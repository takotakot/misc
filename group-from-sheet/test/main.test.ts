/**
 * main モジュールのテスト
 */

import { syncGroupsFromSheet } from '../src/main';
import { getConfig } from '../src/config';
import * as LockManager from '../src/lockManager';
import { loadSheetData } from '../src/sheetService';
import * as SheetWriter from '../src/sheetService';
import * as SyncLogic from '../src/syncLogic';
import { GroupEmail, MemberEmail, Config } from '../src/types';

// モック
jest.mock('../src/config');
jest.mock('../src/lockManager');
jest.mock('../src/sheetService');
jest.mock('../src/syncLogic');

// GAS グローバル
(
  global as unknown as { Logger: Partial<GoogleAppsScript.Base.Logger> }
).Logger = {
  log: jest.fn(),
};

describe('main', () => {
  const mockConfig: Config = {
    settingsSheet: {} as GoogleAppsScript.Spreadsheet.Sheet,
    dataSheet: {} as GoogleAppsScript.Spreadsheet.Sheet,
    lockCellAddress: 'B1',
    lastOperationCellAddress: 'B2',
    dataStartRow: 2,
    excludedUsers: new Set<MemberEmail>(),
  };

  const mockRelease = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (getConfig as jest.Mock).mockReturnValue(mockConfig);
    (LockManager.acquireLockWithRetry as jest.Mock).mockReturnValue({
      lock: {},
      release: mockRelease,
    });
  });

  it('同期プロセスが正常に完了する', () => {
    const mockRows = [
      {
        groupEmail: 'g1@example.com' as GroupEmail,
        memberEmail: 'u1@example.com' as MemberEmail,
        rowIndex: 2,
      },
    ];
    const mockResults = [
      {
        groupEmail: 'g1@example.com' as GroupEmail,
        added: ['u1@example.com' as MemberEmail],
        removed: [],
        addedMemberNames: new Map(),
      },
    ];

    (loadSheetData as jest.Mock).mockReturnValue(mockRows);
    (SyncLogic.syncGroup as jest.Mock).mockReturnValue(mockResults[0]);

    syncGroupsFromSheet();

    expect(SheetWriter.writeLastOperationTime).toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalled();
  });

  it('削除のみ行われた場合も最終操作時刻を更新する', () => {
    const mockRows = [
      {
        groupEmail: 'g1@example.com' as GroupEmail,
        memberEmail: 'u1@example.com' as MemberEmail,
        rowIndex: 2,
      },
    ];
    const mockResults = [
      {
        groupEmail: 'g1@example.com' as GroupEmail,
        added: [],
        removed: ['u1@example.com' as MemberEmail],
        addedMemberNames: new Map(),
      },
    ];

    (loadSheetData as jest.Mock).mockReturnValue(mockRows);
    (SyncLogic.syncGroup as jest.Mock).mockReturnValue(mockResults[0]);

    syncGroupsFromSheet();

    expect(SheetWriter.writeLastOperationTime).toHaveBeenCalled();
  });

  it('データが0件の場合は早期リターンする', () => {
    (loadSheetData as jest.Mock).mockReturnValue([]);

    syncGroupsFromSheet();

    expect(SyncLogic.syncGroup).not.toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalled();
  });

  it('変更がない場合は最終操作時刻を更新しない', () => {
    const mockRows = [{ groupEmail: 'g1@example.com' as GroupEmail }];
    const mockResults = [
      { groupEmail: 'g1@example.com' as GroupEmail, added: [], removed: [] },
    ];

    (loadSheetData as jest.Mock).mockReturnValue(mockRows);
    (SyncLogic.syncGroup as jest.Mock).mockReturnValue(mockResults[0]);

    syncGroupsFromSheet();

    expect(SheetWriter.writeLastOperationTime).not.toHaveBeenCalled();
  });

  it('エラー発生時にエラーをログ出力して再スローし、ロックを解放する', () => {
    (loadSheetData as jest.Mock).mockImplementation(() => {
      throw new Error('Unexpected error');
    });

    expect(() => {
      syncGroupsFromSheet();
    }).toThrow('Unexpected error');

    expect(mockRelease).toHaveBeenCalled();
    expect(global.Logger.log).toHaveBeenCalledWith(
      expect.stringContaining('致命的なエラー')
    );
  });

  it('スタックトレースがないエラーが発生した場合も適切に処理する', () => {
    (loadSheetData as jest.Mock).mockImplementation(() => {
      const error = new Error('No stack error');
      delete error.stack;
      throw error;
    });

    expect(() => {
      syncGroupsFromSheet();
    }).toThrow('No stack error');

    expect(global.Logger.log).toHaveBeenCalledWith(
      expect.stringContaining('致命的なエラー')
    );
    expect(global.Logger.log).not.toHaveBeenCalledWith(
      expect.stringContaining('Stack Trace:')
    );
  });
});
