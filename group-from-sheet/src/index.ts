import { syncGroupsFromSheet } from './main';

/**
 * シートが開かれると自動的に実行される
 *
 * @returns
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const onOpen = (): void => {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('グループ同期')
    .addItem('グループ同期の実行', onTimeTriggered.name)
    .addToUi();
};

/**
 * Google Apps Script 実行のメインエントリーポイントモジュール
 *
 * このモジュールは、Google Sheets のトリガー環境から呼び出される
 * トップレベルの関数を定義し、グローバルスコープに公開します。
 *
 * @module index
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const onTimeTriggered = (): void => {
  try {
    syncGroupsFromSheet();
  } catch (e) {
    const error = e as Error;
    Logger.log(
      `[Fatal Error] グループ同期プロセスが異常終了しました: ${error.message}`
    );
    if (error.stack) {
      Logger.log(error.stack);
    }
  }
};
