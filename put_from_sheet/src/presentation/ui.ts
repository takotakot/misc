import { SyncResult } from '../types/index';

/**
 * Displays a modal dialog with the sync results.
 * @param result The result object containing total, success, failed counts and logs.
 */
export function showResultDialog(result: SyncResult): void {
  const ui = SpreadsheetApp.getUi();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        <style>
          body { font-family: sans-serif; padding: 10px; }
          textarea { width: 100%; height: 150px; margin-top: 10px; }
          .summary { margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="summary">
          <p><strong>Total:</strong> ${result.total}</p>
          <p><strong>Success:</strong> ${result.success}</p>
          <p><strong>Failed:</strong> ${result.failed}</p>
        </div>
        <label>Logs:</label>
        <textarea readonly>${result.logs.join('\n')}</textarea>
        <br><br>
        <input type="button" value="Close" onclick="google.script.host.close()" />
      </body>
    </html>
  `;

  const html = HtmlService.createHtmlOutput(htmlContent)
    .setWidth(400)
    .setHeight(350);

  ui.showModalDialog(html, 'Sync Result');
}
