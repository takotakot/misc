/**
 * config モジュールのテスト
 */

import { getExcludedUsers, getConfig } from '../src/config';
import { MemberEmail } from '../src/types';

// GAS グローバルオブジェクトのモック
(
  global as unknown as {
    Logger: Partial<GoogleAppsScript.Base.Logger>;
  }
).Logger = {
  log: jest.fn(),
};

(
  global as unknown as {
    PropertiesService: Partial<GoogleAppsScript.Properties.PropertiesService>;
  }
).PropertiesService = {
  getScriptProperties: jest.fn(),
};

(
  global as unknown as {
    SpreadsheetApp: Partial<GoogleAppsScript.Spreadsheet.SpreadsheetApp>;
  }
).SpreadsheetApp = {
  getActiveSpreadsheet: jest.fn(),
};

describe('config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getExcludedUsers', () => {
    let mockProperties: jest.Mocked<GoogleAppsScript.Properties.Properties>;

    beforeEach(() => {
      mockProperties = {
        getProperty: jest.fn(),
      } as unknown as jest.Mocked<GoogleAppsScript.Properties.Properties>;
      (
        global.PropertiesService.getScriptProperties as jest.Mock
      ).mockReturnValue(mockProperties);
    });

    it('カンマ区切りのメールアドレスを正しくパースする', () => {
      mockProperties.getProperty.mockReturnValue(
        'admin@example.com,owner@example.com'
      );

      const result = getExcludedUsers();

      expect(result).toEqual(
        new Set([
          'admin@example.com' as MemberEmail,
          'owner@example.com' as MemberEmail,
        ])
      );
    });

    it('前後の空白をトリムする', () => {
      mockProperties.getProperty.mockReturnValue(
        ' user1@example.com , user2@example.com '
      );

      const result = getExcludedUsers();

      expect(result).toEqual(
        new Set(['user1@example.com', 'user2@example.com'])
      );
    });

    it('空文字列のエントリを無視する', () => {
      mockProperties.getProperty.mockReturnValue(
        'user1@example.com,,user2@example.com'
      );

      const result = getExcludedUsers();

      expect(result).toEqual(
        new Set(['user1@example.com', 'user2@example.com'])
      );
    });

    it('プロパティが設定されていない場合は空のSetを返す', () => {
      mockProperties.getProperty.mockReturnValue(null);

      const result = getExcludedUsers();

      expect(result).toEqual(new Set());
    });

    it('単一の値を正しく処理する', () => {
      mockProperties.getProperty.mockReturnValue('admin@example.com');

      const result = getExcludedUsers();

      expect(result).toEqual(new Set(['admin@example.com' as MemberEmail]));
    });
  });

  describe('getConfig', () => {
    let mockSpreadsheet: jest.Mocked<GoogleAppsScript.Spreadsheet.Spreadsheet>;
    let mockSheet: jest.Mocked<GoogleAppsScript.Spreadsheet.Sheet>;

    beforeEach(() => {
      mockSheet = {
        getName: jest.fn().mockReturnValue('設定'),
      } as unknown as jest.Mocked<GoogleAppsScript.Spreadsheet.Sheet>;

      mockSpreadsheet = {
        getSheetByName: jest.fn().mockReturnValue(mockSheet),
        getSheets: jest.fn().mockReturnValue([mockSheet]),
      } as unknown as jest.Mocked<GoogleAppsScript.Spreadsheet.Spreadsheet>;

      (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock).mockReturnValue(
        mockSpreadsheet
      );

      const mockProperties = {
        getProperty: jest.fn().mockReturnValue('admin@example.com'),
      };
      (
        global.PropertiesService.getScriptProperties as jest.Mock
      ).mockReturnValue(mockProperties);
    });

    it('設定オブジェクトを正しく返す', () => {
      const config = getConfig();

      expect(config.settingsSheet).toBe(mockSheet);
      expect(config.dataSheet).toBe(mockSheet);
      expect(config.lockCellAddress).toBe('B1');
      expect(config.lastOperationCellAddress).toBe('B2');
      expect(config.dataStartRow).toBe(2);
      expect(config.excludedUsers).toEqual(
        new Set(['admin@example.com' as MemberEmail])
      );
    });

    it('必要なシートが存在しない場合はエラーをスローする', () => {
      mockSpreadsheet.getSheetByName.mockReturnValue(null);

      expect(() => {
        getConfig();
      }).toThrow(/必要なシートが見つかりません/);
    });

    it('Spreadsheet が見つからない場合はエラーをスローする', () => {
      (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock).mockReturnValue(
        null
      );

      expect(() => {
        getConfig();
      }).toThrow('アクティブなスプレッドシートが見つかりません。');
    });
  });
});
