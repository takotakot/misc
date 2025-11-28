import { ApiClient } from '../../src/infrastructure/api-client';
import { Config } from '../../src/config/config';

// Mock UrlFetchApp
const mockFetch = jest.fn();
global.UrlFetchApp = {
  fetch: mockFetch,
} as unknown as GoogleAppsScript.URL_Fetch.UrlFetchApp;

describe('ApiClient', () => {
  let apiClient: ApiClient;

  beforeEach(() => {
    apiClient = new ApiClient();
    mockFetch.mockClear();
  });

  it('should send PUT request and return success', () => {
    const item = { jan: '123', name: 'Item 1', isListed: true };
    const mockResponse = {
      getResponseCode: jest.fn().mockReturnValue(200),
      getContentText: jest.fn().mockReturnValue(JSON.stringify({ id: '1' })),
    };
    mockFetch.mockReturnValue(mockResponse);

    const result = apiClient.putItem(item);

    expect(mockFetch).toHaveBeenCalledWith(
      Config.API.ENDPOINT,
      expect.objectContaining({
        method: 'put',
        payload: JSON.stringify({ jan: '123', name: 'Item 1' }),
      })
    );
    expect(result.success).toBe(true);
  });

  it('should handle API errors', () => {
    const item = { jan: '123', name: 'Item 1', isListed: true };
    const mockResponse = {
      getResponseCode: jest.fn().mockReturnValue(500),
      getContentText: jest.fn().mockReturnValue('Internal Server Error'),
    };
    mockFetch.mockReturnValue(mockResponse);

    const result = apiClient.putItem(item);

    expect(result.success).toBe(false);
    expect(result.message).toContain('500');
  });
});
