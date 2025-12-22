import {
  Config,
  SCRIPT_PROPERTY_KEYS,
  MemberEmail,
  DEFAULT_CONFIG,
  SHEET_NAMES,
} from './types';

/**
 * @module config
 */

/**
 * スクリプトプロパティから同期操作の対象外とするユーザーリストを取得します。
 *
 * 管理者や特権ユーザーなど、自動同期ロジックによって誤って削除
 * されてはいけないユーザーのメールアドレスを `Set` 形式で返します。
 *
 * @returns 操作除外ユーザーのメールアドレスを含む Set。設定がない場合は空の Set を返します。
 *
 * @example
 * ```typescript
 * const excluded = getExcludedUsers();
 * if (excluded.has('admin@example.com')) {
 *   // 削除対象から除外
 * }
 * ```
 *
 * @remarks
 * スクリプトプロパティのキー `EXCLUDED_USERS` にカンマ区切りで
 * 記述されていることを想定しています。
 */
export const getExcludedUsers = (): Set<MemberEmail> => {
  const properties = PropertiesService.getScriptProperties();
  const excludedUsersStr = properties.getProperty(
    SCRIPT_PROPERTY_KEYS.EXCLUDED_USERS
  );

  if (!excludedUsersStr) {
    Logger.log(
      '操作除外ユーザーリスト (EXCLUDED_USERS) が設定されていません。'
    );
    return new Set<MemberEmail>();
  }

  // カンマ区切り文字列をパースし、正規化（トリム）
  const emails = excludedUsersStr
    .split(',')
    .map(email => email.trim())
    .filter(email => email.length > 0);

  Logger.log(`操作除外ユーザーとして ${emails.length} 件をロードしました。`);
  return new Set<MemberEmail>(emails as MemberEmail[]);
};

/**
 * 実行に必要なすべての設定情報を集約した `Config` オブジェクトを取得します。
 *
 * @returns システム構成設定オブジェクト。
 * @throws {Error} アクティブなスプレッドシートが取得できない場合にスローされます。
 *
 * @example
 * ```typescript
 * const config = getConfig();
 * Logger.log(`Target Sheet: ${config.targetSheet.getName()}`);
 * ```
 *
 * @remarks
 * シート名 '設定' を探し、見つからない場合はエラーをスローします。
 * 明示的なシート作成を促すことで、誤ったシートへの書き込み事故を防止します。
 */
export const getConfig = (): Config => {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('アクティブなスプレッドシートが見つかりません。');
  }

  const settingsSheet = spreadsheet.getSheetByName(SHEET_NAMES.SETTINGS);
  const dataSheet = spreadsheet.getSheetByName(SHEET_NAMES.DATA);

  if (!settingsSheet || !dataSheet) {
    const missing = [];
    if (!settingsSheet) missing.push(`'${SHEET_NAMES.SETTINGS}'`);
    if (!dataSheet) missing.push(`'${SHEET_NAMES.DATA}'`);
    throw new Error(
      `必要なシートが見つかりません: ${missing.join(', ')}。シートを作成してください。`
    );
  }

  return {
    excludedUsers: getExcludedUsers(),
    settingsSheet,
    dataSheet,
    lockCellAddress: DEFAULT_CONFIG.LOCK_CELL_ADDRESS,
    lastOperationCellAddress: DEFAULT_CONFIG.LAST_OP_CELL_ADDRESS,
    dataStartRow: DEFAULT_CONFIG.DATA_START_ROW,
  };
};
