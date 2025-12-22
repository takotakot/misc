import {
  Config,
  COLUMN_INDEX,
  SheetRow,
  SyncResult,
  GroupEmail,
  MemberEmail,
  MembershipName,
} from './types';

/**
 * スプレッドシート I/O サービスモジュール
 *
 * 設定シートからのデータ読み取り、および実行結果（メンバー名、最終操作時刻）の
 * 書き戻し機能を一括して管理します。
 *
 * 読み取り（Reader）と書き出し（Writer）を一つのモジュールに集約することで、
 * シートの物理レイアウト（列定義など）に関する知識を一箇所で管理し、
 * 読み書きの整合性を担保します。
 *
 * @module sheetService
 */

/**
 * 日付形式の値を解析し、Date オブジェクトに変換します。
 *
 * @param value - 解析対象の値（Date オブジェクト、または日付文字列）。
 * @returns 変換後の Date オブジェクト。解析不能な場合は `null` を返します。
 *
 * @internal
 *
 * @remarks
 * Google Sheets では、セルの書式設定によって `Date` オブジェクトとして
 * 渡される場合と、文字列や数値（シリアル値）として渡される場合があります。
 * 本関数はそれらを可能な限り許容してパースを試みます。
 */
export const parseDateTime = (value: unknown): Date | null => {
  // すでに Date オブジェクトである場合
  if (value instanceof Date) {
    // 直近の GAS 環境では無効な Date が渡される可能性があるためチェック
    return isNaN(value.getTime()) ? null : value;
  }

  // 文字列、または数値（シリアル値）の場合
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
};

/**
 * 設定シートから全メンバーデータを読み込み、内部データモデル（SheetRow）の配列に変換します。
 *
 * @param config - システム構成設定オブジェクト（シート情報を含む）。
 * @returns 有効なメールアドレスを持つ行データのリスト。
 *
 * @example
 * ```typescript
 * const rows = loadSheetData(config);
 * ```
 */
export const loadSheetData = (config: Config): SheetRow[] => {
  const { dataSheet, dataStartRow } = config;
  const lastRow = dataSheet.getLastRow();

  // データ行が存在しない場合
  if (lastRow < dataStartRow) {
    Logger.log('データ行が見つかりませんでした。');
    return [];
  }

  // シートから全データを一括取得（高速化のため getValues を1回のみ呼び出し）
  // 取得範囲: データ開始行〜最終行まで、A〜E列（インデックス 4 まで）
  const numRows = lastRow - dataStartRow + 1;
  const values = dataSheet.getRange(dataStartRow, 1, numRows, 5).getValues();

  const rows: SheetRow[] = [];

  values.forEach((row, index) => {
    const rowIndex = dataStartRow + index;
    const groupEmailValue = row[COLUMN_INDEX.GROUP_EMAIL];
    const memberEmailValue = row[COLUMN_INDEX.MEMBER_EMAIL];
    const startTimeValue = row[COLUMN_INDEX.START_TIME];
    const endTimeValue = row[COLUMN_INDEX.END_TIME];
    const membershipNameValue = row[COLUMN_INDEX.MEMBERSHIP_NAME];

    // 必須項目（メールアドレス）の存在チェック
    if (!groupEmailValue || !memberEmailValue) {
      return; // continue 相当
    }

    // 日時データのバリデーションとパース
    const startTime = parseDateTime(startTimeValue);
    const endTime = parseDateTime(endTimeValue);

    if (!startTime || !endTime) {
      Logger.log(
        `[Warning] 行 ${rowIndex} の日時形式が不正なためスキップしました (Start: ${startTimeValue}, End: ${endTimeValue})`
      );
      return;
    }

    rows.push({
      rowIndex,
      groupEmail: String(groupEmailValue).trim() as GroupEmail,
      memberEmail: String(memberEmailValue).trim() as MemberEmail,
      startTime,
      endTime,
      membershipName: membershipNameValue
        ? (String(membershipNameValue).trim() as MembershipName)
        : null,
    });
  });

  Logger.log(`シートから ${rows.length} 件の有効なデータを読み込みました。`);
  return rows;
};

/**
 * 同期によって新しく追加されたメンバーのメンバーシップ名（Relation ID）を、
 * スプレッドシートの対応する行に書き戻します。
 *
 * @param config - システム構成設定オブジェクト
 * @param rows - 読み込まれた全行データのリスト
 * @param results - 同期実行結果のリスト
 * @returns
 */
export const writeMembershipNames = (
  config: Config,
  rows: SheetRow[],
  results: SyncResult[]
): void => {
  const { dataSheet } = config;

  results.forEach(result => {
    if (result.added.length === 0) return;

    result.added.forEach(memberEmail => {
      // 対象の行を特定（メールアドレスとグループアドレスが一致する最初の行）
      const row = rows.find(
        r => r.groupEmail === result.groupEmail && r.memberEmail === memberEmail
      );

      if (row) {
        const membershipName =
          result.addedMembershipNames.get(memberEmail) || '';
        dataSheet
          .getRange(row.rowIndex, COLUMN_INDEX.MEMBERSHIP_NAME + 1)
          .setValue(membershipName);
        Logger.log(
          `[Output] 行 ${row.rowIndex} にメンバーシップ名を書き込みました: ${membershipName}`
        );
      }
    });
  });
};

/**
 * グループから削除されたメンバーに対応するシート上のメンバーシップ名をクリアします。
 *
 * @param config - システム構成設定オブジェクト
 * @param rows - 読み込まれた全行データのリスト
 * @param results - 同期実行結果のリスト
 * @returns
 */
export const clearRemovedMembershipNames = (
  config: Config,
  rows: SheetRow[],
  results: SyncResult[]
): void => {
  const { dataSheet } = config;

  results.forEach(result => {
    if (result.removed.length === 0) return;

    result.removed.forEach(memberEmail => {
      const row = rows.find(
        r => r.groupEmail === result.groupEmail && r.memberEmail === memberEmail
      );

      if (row) {
        dataSheet
          .getRange(row.rowIndex, COLUMN_INDEX.MEMBERSHIP_NAME + 1)
          .setValue('');
        Logger.log(
          `[Output] 行 ${row.rowIndex} のメンバーシップ名をクリアしました: ${memberEmail}`
        );
      }
    });
  });
};

/**
 * 最終同期処理の完了時刻を、設定されたセルに記録します。
 *
 * @param config - システム構成設定オブジェクト
 * @param time - 記録する日時オブジェクト
 * @returns
 */
export const writeLastOperationTime = (config: Config, time: Date): void => {
  const { settingsSheet, lastOperationCellAddress } = config;
  settingsSheet.getRange(lastOperationCellAddress).setValue(time);
  Logger.log(
    `[Output] 最終操作時刻を更新しました: ${time.toLocaleString('ja-JP')}`
  );
};
