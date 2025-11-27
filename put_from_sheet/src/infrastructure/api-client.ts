import { Config } from '../config/config';
import { Item } from '../domain/item';
import { ApiResult } from '../types/index';

export class ApiClient {
  /**
   * Sends a PUT request to the API with the item data.
   * @param item The item to send.
   * @returns The result of the API call.
   */
  public putItem(item: Item): ApiResult {
    const url = Config.API.ENDPOINT;
    const payload = {
      jan: item.jan,
      name: item.name,
      // Add other fields as necessary
    };

    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
      method: 'put',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    try {
      const response = UrlFetchApp.fetch(url, options);
      const responseCode = response.getResponseCode();
      const responseBody = response.getContentText();

      if (responseCode >= 200 && responseCode < 300) {
        return {
          success: true,
          message: `Success: ${responseCode}`,
          data: JSON.parse(responseBody),
        };
      } else {
        return {
          success: false,
          message: `Error: ${responseCode} - ${responseBody}`,
        };
      }
    } catch (e) {
      return {
        success: false,
        message: `Exception: ${e}`,
      };
    }
  }
}
