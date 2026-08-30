import {runGeminiAPI} from './runApi';

/**
 * スプレッドシートが開かれたときにカスタムメニューを追加する
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function onOpen(): void {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Gemini')
    .addItem('Read sheet and invoke Gemini API and write', runGeminiAPI.name)
    .addToUi();
}
