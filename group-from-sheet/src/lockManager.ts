import { Config, LOCK_CONFIG } from './types';

/**
 * Google Apps Script 向けのロック管理モジュール
 *
 * このモジュールは、`LockService`（スクリプト実行の排他制御）と、
 * シート上の「ロック」セル（メンテナンスモード等の人間用排他制御）を
 * 統合的に管理する機能を提供します。
 *
 * 指数バックオフによるリトライ機構を備えており、高頻度な実行環境下での
 * データの整合性を保護します。
 *
 * @module lockManager
 */

/**
 * シート上の「ロック」セルが有効（メンテナンス中）であるかを確認します。
 *
 * 特定のセル（デフォルト: 'B1'）の値を読み取り、それが「ロック」状態を
 * 表す値であるかを判定します。ロック中の場合、スクリプトによる
 * データの自動的な変更を停止させるために使用します。
 *
 * @param config - システム構成設定オブジェクト。シートインスタンスとロックセルアドレスを含みます。
 * @returns ロックが有効な場合は `true`、それ以外は `false` を返します。
 *
 * @example
 * ```typescript
 * const config = getConfig();
 * if (isSheetLocked(config)) {
 *   Logger.log('メンテナンスモードです。処理をスキップします。');
 *   return;
 * }
 * ```
 *
 * @remarks
 * - 文字列: `"ON"`, `"TRUE"`, `"1"` (大文字小文字を区別せず、トリムされます)
 * - ブール値: `true`
 * - 数値: `1`
 *
 * @remarks
 * 比較の際は `toUpperCase()` を使用します。これは、ロケールに依存した `toLowerCase()`
 * の予期せぬ挙動（Turkish I 問題など）を避け、プログラミング定数として安全に比較するためです。
 */
export const isSheetLocked = (config: Config): boolean => {
  // システム設定シート上のセルフロック（B1セル等）を確認
  SpreadsheetApp.flush(); // キャッシュを回避し、最新のシート状態を取得する
  const lockRange = config.settingsSheet.getRange(config.lockCellAddress);
  const value = lockRange.getValue();

  if (typeof value === 'string') {
    const upperValue = value.toUpperCase().trim();
    return upperValue === 'ON' || upperValue === 'TRUE' || upperValue === '1';
  }

  return Boolean(value);
};

/**
 * 指数バックオフ戦略を使用し、シートロックが解除されるまで待機します。
 *
 * シートロックが有効な間、最大 `LOCK_CONFIG.MAX_LOCK_WAIT_MS`（通常 3 分）まで
 * 指数的に増加する待機時間を挟みながら監視を継続します。
 *
 * @param config - システム構成設定オブジェクト。
 * @param startTime - 同期プロセス全体の開始時刻（ミリ秒）。
 * @returns この関数は値を返しません。
 * @throws {Error} 最大待機時間（3分）を超えてもロックが解除されない場合にスローされます。
 * @dependency Google Apps Script の `Utilities.sleep` を使用して待機を行います。呼び出し元の実行時間を消費します。
 *
 * @example
 * ```typescript
 * const startTime = Date.now();
 * try {
 *   waitForSheetLock(config, startTime);
 *   // ロック解除後の処理を継続
 * } catch (e) {
 *   Logger.log('タイムアウトにより処理を中断しました。');
 * }
 * ```
 */
export const waitForSheetLock = (config: Config, startTime: number): void => {
  let backoffMs = LOCK_CONFIG.INITIAL_BACKOFF_MS;

  while (isSheetLocked(config)) {
    const elapsedMs = Date.now() - startTime;

    if (elapsedMs >= LOCK_CONFIG.MAX_LOCK_WAIT_MS) {
      throw new Error(
        `シートロック待機がタイムアウトしました（${LOCK_CONFIG.MAX_LOCK_WAIT_MS / 1000}秒経過）`
      );
    }

    Logger.log(`シートがロックされています。${backoffMs}ms 間待機します...`);
    // NOTE: 本処理は Google Apps Script の Utilities.sleep に依存しています。
    Utilities.sleep(backoffMs);

    // 指数バックオフの計算
    backoffMs = Math.min(backoffMs * 2, LOCK_CONFIG.MAX_BACKOFF_MS);
  }
};

/**
 * 指数バックオフ戦略を使用してロックの取得を試みます。
 *
 * @param lock - 取得を試みるロックインスタンス。
 * @param startTime - 処理全体の開始時刻（タイムアウト判定用）。
 * @returns ロックが取得できた場合は `true`、タイムアウトした場合は `false`。
 */
const tryLockWithExponentialBackoff = (
  lock: GoogleAppsScript.Lock.Lock,
  startTime: number
): boolean => {
  let backoffMs = LOCK_CONFIG.INITIAL_BACKOFF_MS;

  while (Date.now() - startTime < LOCK_CONFIG.MAX_LOCK_WAIT_MS) {
    const elapsedMs = Date.now() - startTime;
    const remainingMs = LOCK_CONFIG.MAX_LOCK_WAIT_MS - elapsedMs;

    // 残り時間とバックオフの小さい方を待機時間として指定
    const waitMs = Math.min(remainingMs, backoffMs);

    if (lock.tryLock(waitMs)) {
      return true;
    }

    Logger.log(
      `[Lock] ロック取得に失敗しました。${backoffMs}ms 後に再試行します...`
    );
    // NOTE: 本処理は Google Apps Script の Utilities.sleep に依存しています。
    Utilities.sleep(backoffMs);

    // 指数バックオフの計算
    backoffMs = Math.min(backoffMs * 2, LOCK_CONFIG.MAX_BACKOFF_MS);
  }
  return false;
};

/**
 * システムレベルのロック（DocumentLock）を取得します。
 *
 * @param startTime - 処理全体の開始時刻（タイムアウト判定用）。
 * @returns 取得されたロックオブジェクトとその解放関数のペア。
 * @throws {Error} タイムアウトまでにロックが取得できなかった場合にスローされます。
 * @dependency Google Apps Script の `Utilities.sleep` を使用してリトライ待機を行います。呼び出し元の実行時間を消費します。
 *
 * @remarks
 * スプレッドシートへの一貫した書き込みを保証するため、広域な `ScriptLock` ではなく、
 * 対象ドキュメントに閉じた `DocumentLock` を採用しています。これにより、スクリプトの
 * 他の無関係な実行を妨げることなく、特定のデータセットに対する排他制御を最小限のスコープで実現します。
 */
export const acquireLockWithRetry = (
  startTime: number
): { lock: GoogleAppsScript.Lock.Lock; release: () => void } => {
  const lock = LockService.getDocumentLock();
  if (!lock) {
    throw new Error('DocumentLock の取得に失敗しました（初期化不可）。');
  }

  const success = tryLockWithExponentialBackoff(lock, startTime);

  if (!success) {
    throw new Error(
      `システムロックを取得できませんでした（タイムアウト: ${LOCK_CONFIG.MAX_LOCK_WAIT_MS}ms）`
    );
  }

  Logger.log('[Lock] システムロック（DocumentLock）を確立しました。');

  return {
    lock,
    release: () => {
      if (lock.hasLock()) {
        lock.releaseLock();
        Logger.log('[Lock] システムロックを解放しました。');
      }
    },
  };
};
