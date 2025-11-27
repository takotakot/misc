import { SyncItemsUseCase } from './usecase/sync-items';
import { showResultDialog } from './presentation/ui';
import { SheetRepository } from './storage/sheet-repository';
import { ApiClient } from './infrastructure/api-client';

/**
 * Automatically runs when the Spreadsheet is opened.
 * Adds a menu to the UI.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function onOpen(): void {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('GAS System').addItem('Sync Items', syncItems.name).addToUi();
}

/**
 * Syncs items from the sheet to the API.
 * This function is triggered from the custom menu.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function syncItems(): void {
  const sheetRepository = new SheetRepository();
  const apiClient = new ApiClient();
  const useCase = new SyncItemsUseCase(sheetRepository, apiClient);
  const result = useCase.execute();
  showResultDialog(result);
}
