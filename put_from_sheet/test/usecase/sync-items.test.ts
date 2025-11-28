import { SyncItemsUseCase } from '../../src/usecase/sync-items';
import { SheetRepository } from '../../src/storage/sheet-repository';
import { ApiClient } from '../../src/infrastructure/api-client';
import { Item } from '../../src/domain/item';

// Mock dependencies
jest.mock('../../src/storage/sheet-repository');
jest.mock('../../src/infrastructure/api-client');

describe('SyncItemsUseCase', () => {
  let useCase: SyncItemsUseCase;
  let mockSheetRepository: jest.Mocked<SheetRepository>;
  let mockApiClient: jest.Mocked<ApiClient>;

  beforeEach(() => {
    mockSheetRepository = new SheetRepository() as jest.Mocked<SheetRepository>;
    mockApiClient = new ApiClient() as jest.Mocked<ApiClient>;
    useCase = new SyncItemsUseCase(mockSheetRepository, mockApiClient);
  });

  it('should sync items successfully', () => {
    const items: Item[] = [
      { jan: '123', name: 'Item 1', isListed: true },
      { jan: '456', name: 'Item 2', isListed: true },
    ];

    mockSheetRepository.getFilteredItems.mockReturnValue(items);
    mockApiClient.putItem.mockReturnValue({ success: true, message: 'OK' });

    const result = useCase.execute();

    expect(result.total).toBe(2);
    expect(result.success).toBe(2);
    expect(result.failed).toBe(0);
    expect(mockApiClient.putItem).toHaveBeenCalledTimes(2);
  });

  it('should handle failed syncs', () => {
    const items: Item[] = [{ jan: '123', name: 'Item 1', isListed: true }];

    mockSheetRepository.getFilteredItems.mockReturnValue(items);
    mockApiClient.putItem.mockReturnValue({ success: false, message: 'Error' });

    const result = useCase.execute();

    expect(result.total).toBe(1);
    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
  });
});
