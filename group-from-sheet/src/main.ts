import { getConfig } from './config';
import * as LockManager from './lockManager';
import {
  loadSheetData,
  writeMembershipNames,
  clearRemovedMembershipNames,
  writeLastOperationTime,
} from './sheetService';
import { syncGroup } from './syncLogic';
import { SyncResult, Config, SheetRow, GroupEmail } from './types';

/**
 * 同期処理オーケストレーションモジュール
 *
 * 各モジュール（設定、ロック、読込、同期、書込）を組み合わせ、
 * システム全体の「スプレッドシートから Google グループへの同期」フローを実行します。
 *
 * @module main
 */

/**
 * スプレッドシートの定義に基づき、すべてのグループメンバーシップを同期します。
 *
 * 本関数はシステム全体のメインエントリーポイントであり、排他制御、
 * データ抽出、ビジネスロジックの適用、結果の物理永続化を順次実行します。
 *
 * @returns この関数は値を返しません。
 * @throws {Error} ロック取得失敗、API 致命的エラー、シートアクセス不能などの場合にスローされます。
 *
 * @example
 * ```typescript
 * // GAS のトリガーやメニューから呼び出す
 * syncGroupsFromSheet();
 * ```
 *
 * @remarks
 * **処理パイプライン**:
 * 1. **初期化**: 設定情報のロードと開始時刻の記録。
 * 2. **排他制御**: シート上のメンテナンスロックおよび `ScriptLock` の取得。
 * 3. **データ抽出**: シート全行の読み込みとグループ単位への構造化。
 * 4. **同期実行**: 各グループについて `syncGroup` ロジックを適用。
 * 5. **永続化**: 追加・削除結果のシート反映と最終実行時刻の記録。
 * 6. **クリーンアップ**: `finally` ブロックでの確実なロック解放。
 */
export const syncGroupsFromSheet = (): void => {
  const startTime = Date.now();
  let releaseLock: (() => void) | null = null;

  try {
    Logger.log('===== [Process Start] グループ同期処理を開始します =====');

    // 1. 設定情報の取得
    const config: Config = getConfig();

    // 2. 排他制御の確立
    // シート上のセルフロック（B1セル）を確認
    LockManager.waitForSheetLock(config, startTime);
    // システムレベルのロック（DocumentLock）を取得
    const lockResult = LockManager.acquireLockWithRetry(startTime);
    releaseLock = lockResult.release;

    // 3. 全データのロード
    const allRows = loadSheetData(config);
    if (allRows.length === 0) {
      Logger.log(
        '[Notice] 同期対象のデータが0件のため、処理を正常終了します。'
      );
      return;
    }

    // 4. グループメールアドレスごとにデータを集約
    const rowsByGroup = new Map<GroupEmail, SheetRow[]>();
    allRows.forEach(row => {
      const groupRows = rowsByGroup.get(row.groupEmail) || [];
      groupRows.push(row);
      rowsByGroup.set(row.groupEmail, groupRows);
    });

    Logger.log(
      `[Process] ${rowsByGroup.size} 個のユニークなグループを処理します。`
    );

    // 5. グループ別の同期処理（Declarative Reconciliation）
    const currentTime = new Date();
    const syncResults: SyncResult[] = [];

    rowsByGroup.forEach((rows, groupEmail) => {
      const result = syncGroup(
        groupEmail,
        rows,
        config.excludedUsers,
        currentTime
      );
      syncResults.push(result);
    });

    // 6. 実行結果のシート書き戻し
    // 新規追加メンバーの表示名埋め
    writeMembershipNames(config, allRows, syncResults);
    // 削除済みメンバーの名前クリア
    clearRemovedMembershipNames(config, allRows, syncResults);

    // 7. 状態更新の記録
    const hasChanges = syncResults.some(
      r => r.added.length > 0 || r.removed.length > 0
    );

    if (hasChanges) {
      writeLastOperationTime(config, new Date());
      Logger.log(
        '[Process] 変更が適用されたため、最終操作時刻を記録しました。'
      );
    } else {
      Logger.log('[Process] すべてのグループが同期済みでした（変更なし）。');
    }

    Logger.log(
      '===== [Process Success] すべての同期ステップが完了しました ====='
    );
  } catch (e) {
    const error = e as Error;
    Logger.log(
      `[Critical] 同期プロセス中に致命的なエラーが発生しました: ${error.message}`
    );
    if (error.stack) {
      Logger.log(`Stack Trace:\n${error.stack}`);
    }
    throw e; // 上位（index.ts）へ委譲
  } finally {
    // 8. 排他制御の解除
    if (releaseLock) {
      releaseLock();
    }
  }
};
