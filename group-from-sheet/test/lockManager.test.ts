/**
 * lockManager モジュールのテスト
 */

import {
  isSheetLocked,
  waitForSheetLock,
  acquireLockWithRetry,
} from '../src/lockManager';
import { Config, LOCK_CONFIG, MemberEmail } from '../src/types';

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
    SpreadsheetApp: Partial<GoogleAppsScript.Spreadsheet.SpreadsheetApp>;
  }
).SpreadsheetApp = {
  flush: jest.fn(),
};

(
  global as unknown as {
    Utilities: Partial<GoogleAppsScript.Utilities.Utilities>;
  }
).Utilities = {
  sleep: jest.fn(),
};

(
  global as unknown as {
    LockService: Partial<GoogleAppsScript.Lock.LockService>;
  }
).LockService = {
  getDocumentLock: jest.fn(),
};

describe('lockManager', () => {
  describe('isSheetLocked', () => {
    let mockSheet: jest.Mocked<GoogleAppsScript.Spreadsheet.Sheet>;
    let config: Config;

    beforeEach(() => {
      mockSheet = {
        getRange: jest.fn().mockReturnValue({
          getValue: jest.fn(),
        }),
      } as unknown as jest.Mocked<GoogleAppsScript.Spreadsheet.Sheet>;

      config = {
        settingsSheet: mockSheet,
        dataSheet: mockSheet,
        lockCellAddress: 'B1',
        lastOperationCellAddress: 'B2',
        dataStartRow: 2,
        excludedUsers: new Set<MemberEmail>(),
      };
    });

    it('セル値が "ON" の場合は true を返す', () => {
      (mockSheet.getRange('B1').getValue as jest.Mock).mockReturnValue('ON');
      expect(isSheetLocked(config)).toBe(true);
    });

    it('セル値が "on" (小文字) の場合は true を返す', () => {
      (mockSheet.getRange('B1').getValue as jest.Mock).mockReturnValue('on');
      expect(isSheetLocked(config)).toBe(true);
    });

    it('セル値が "TRUE" の場合は true を返す', () => {
      (mockSheet.getRange('B1').getValue as jest.Mock).mockReturnValue('TRUE');
      expect(isSheetLocked(config)).toBe(true);
    });

    it('セル値が true (ブール値) の場合は true を返す', () => {
      (mockSheet.getRange('B1').getValue as jest.Mock).mockReturnValue(true);
      expect(isSheetLocked(config)).toBe(true);
    });

    it('セル値が空文字列の場合は false を返す', () => {
      (mockSheet.getRange('B1').getValue as jest.Mock).mockReturnValue('');
      expect(isSheetLocked(config)).toBe(false);
    });

    it('セル値が "OFF" の場合は false を返す', () => {
      (mockSheet.getRange('B1').getValue as jest.Mock).mockReturnValue('OFF');
      expect(isSheetLocked(config)).toBe(false);
    });

    it('セル値が null の場合は false を返す', () => {
      (mockSheet.getRange('B1').getValue as jest.Mock).mockReturnValue(null);
      expect(isSheetLocked(config)).toBe(false);
    });
  });

  describe('waitForSheetLock', () => {
    let mockSheet: jest.Mocked<GoogleAppsScript.Spreadsheet.Sheet>;
    let config: Config;

    beforeEach(() => {
      jest.clearAllMocks();
      mockSheet = {
        getRange: jest.fn().mockReturnValue({
          getValue: jest.fn(),
        }),
      } as unknown as jest.Mocked<GoogleAppsScript.Spreadsheet.Sheet>;

      config = {
        settingsSheet: mockSheet,
        dataSheet: mockSheet,
        lockCellAddress: 'B1',
        lastOperationCellAddress: 'B2',
        dataStartRow: 2,
        excludedUsers: new Set<MemberEmail>(),
      };
    });

    it('ロックされていない場合は即座に戻る', () => {
      (mockSheet.getRange('B1').getValue as jest.Mock).mockReturnValue('');
      const startTime = Date.now();

      waitForSheetLock(config, startTime);

      expect(global.Utilities.sleep).not.toHaveBeenCalled();
    });

    it('ロックが解放されるまで待機する', () => {
      let callCount = 0;
      (mockSheet.getRange('B1').getValue as jest.Mock).mockImplementation(
        () => {
          callCount++;
          return callCount <= 2 ? 'ON' : '';
        }
      );

      const startTime = Date.now();
      waitForSheetLock(config, startTime);

      expect(global.Utilities.sleep).toHaveBeenCalledTimes(2);

      // flush が待機のたびに（またはチェックのたびに）呼ばれていることを確認
      // isSheetLocked は 3回呼ばれる (ON -> ON -> OFF) ため、flush も 3回呼ばれるはず
      expect(global.SpreadsheetApp.flush).toHaveBeenCalledTimes(3);
    });

    it('タイムアウトした場合はエラーをスローする', () => {
      (mockSheet.getRange('B1').getValue as jest.Mock).mockReturnValue('ON');
      const startTime = Date.now() - LOCK_CONFIG.MAX_LOCK_WAIT_MS - 1000;

      expect(() => {
        waitForSheetLock(config, startTime);
      }).toThrow('シートロック待機がタイムアウトしました');
    });
  });

  describe('acquireLockWithRetry', () => {
    let mockLock: jest.Mocked<GoogleAppsScript.Lock.Lock>;

    beforeEach(() => {
      jest.clearAllMocks();
      mockLock = {
        tryLock: jest.fn(),
        releaseLock: jest.fn(),
        hasLock: jest.fn(), // Added hasLock mock as per instruction
      } as unknown as jest.Mocked<GoogleAppsScript.Lock.Lock>;
      (global.LockService.getDocumentLock as jest.Mock).mockReturnValue(
        mockLock
      );
    });

    it('ロックを取得できた場合は即座に戻る', () => {
      mockLock.tryLock.mockReturnValue(true);
      const startTime = Date.now();

      const result = acquireLockWithRetry(startTime);

      expect(result.lock).toBe(mockLock);
      expect(typeof result.release).toBe('function');
      expect(mockLock.tryLock).toHaveBeenCalledTimes(1);
    });

    it('リトライしてロックを取得する', () => {
      let callCount = 0;
      mockLock.tryLock.mockImplementation(() => {
        callCount++;
        return callCount > 2;
      });

      const startTime = Date.now();
      const result = acquireLockWithRetry(startTime);

      expect(result.lock).toBe(mockLock);
      expect(mockLock.tryLock).toHaveBeenCalledTimes(3);
    });

    it('タイムアウトした場合はエラーをスローする', () => {
      mockLock.tryLock.mockReturnValue(false);
      const startTime = Date.now() - LOCK_CONFIG.MAX_LOCK_WAIT_MS - 1000;

      expect(() => {
        acquireLockWithRetry(startTime);
      }).toThrow('システムロックを取得できませんでした');
    });
  });
});
