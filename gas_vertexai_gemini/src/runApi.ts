import {callVertexAiGenerateContent} from './vertexai';

/**
 * A2, A3 セルを読み取り、Gemini API を呼び出して結果を B2, B3 セルに書き込む
 */
export function runGeminiAPI(): void {
  const sheet = SpreadsheetApp.getActiveSheet();

  // A2 セルを読み、モデルに与えて結果を B2 セルに書く
  const promptA2 = String(sheet.getRange('A2').getValue() ?? '');
  if (promptA2) {
    try {
      const resultB2 = callVertexAiGenerateContent(promptA2);
      sheet.getRange('B2').setValue(resultB2);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to call Vertex AI: ${message}`);
    }
  }

  // A3 セルを読み、モデルに与えて結果を B3 セルに書く
  const promptA3 = String(sheet.getRange('A3').getValue() ?? '');
  if (promptA3) {
    try {
      const resultB3 = callVertexAiGenerateContent(promptA3);
      sheet.getRange('B3').setValue(resultB3);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to call Vertex AI: ${message}`);
    }
  }
}
