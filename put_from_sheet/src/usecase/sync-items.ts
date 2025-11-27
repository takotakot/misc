import { SheetRepository } from '../storage/sheet-repository';
import { ApiClient } from '../infrastructure/api-client';
import { ApiResult } from '../types/index';

export class SyncItemsUseCase {
  private sheetRepository: SheetRepository;
  private apiClient: ApiClient;

  constructor(sheetRepository: SheetRepository, apiClient: ApiClient) {
    this.sheetRepository = sheetRepository;
    this.apiClient = apiClient;
  }

  public execute(): {
    total: number;
    success: number;
    failed: number;
    logs: string[];
  } {
    const items = this.sheetRepository.getFilteredItems();
    const logs: string[] = [];
    let successCount = 0;
    let failedCount = 0;

    logs.push(`Found ${items.length} items to sync.`);

    for (const item of items) {
      const result: ApiResult = this.apiClient.putItem(item);
      if (result.success) {
        successCount++;
        logs.push(`[SUCCESS] JAN: ${item.jan}, Name: ${item.name}`);
      } else {
        failedCount++;
        logs.push(
          `[FAILED] JAN: ${item.jan}, Name: ${item.name}, Message: ${result.message}`
        );
      }
    }

    return {
      total: items.length,
      success: successCount,
      failed: failedCount,
      logs: logs,
    };
  }
}
