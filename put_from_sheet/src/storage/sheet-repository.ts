import { Config } from '../config/config';
import { Item } from '../domain/item';

export class SheetRepository {
  private getSheet(
    sheetName: string
  ): GoogleAppsScript.Spreadsheet.Sheet | null {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    return ss.getSheetByName(sheetName);
  }

  /**
   * Retrieves items from the filtered sheet.
   * @returns An array of Item objects.
   * @throws Error if the filtered sheet is not found.
   */
  public getFilteredItems(): Item[] {
    const sheet = this.getSheet(Config.SHEET_NAMES.FILTERED);
    if (!sheet) {
      throw new Error(`Sheet "${Config.SHEET_NAMES.FILTERED}" not found.`);
    }

    const data = sheet.getDataRange().getValues();

    // Skip header and map to Item objects
    return data
      .slice(1)
      .map(row => ({
        jan: String(row[1]),
        name: String(row[2]),
        isListed: true,
      }))
      .filter(item => item.jan !== '');
  }
}
