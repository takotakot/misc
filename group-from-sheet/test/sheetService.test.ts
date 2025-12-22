/**
 * sheetService モジュールのテスト
 */

import {
  loadSheetData,
  parseDateTime,
  writeMembershipNames,
  clearRemovedMembershipNames,
  writeLastOperationTime,
} from '../src/sheetService';
import {
  Config,
  SyncResult,
  SheetRow,
  GroupEmail,
  MemberEmail,
  MembershipName,
} from '../src/types';

// GAS グローバルオブジェクトのモック
(
  global as unknown as { Logger: Partial<GoogleAppsScript.Base.Logger> }
).Logger = {
  log: jest.fn(),
};

describe('sheetService', () => {
  let mockSheet: jest.Mocked<GoogleAppsScript.Spreadsheet.Sheet>;
  let config: Config;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSheet = {
      getLastRow: jest.fn(),
      getRange: jest.fn().mockReturnValue({
        getValues: jest.fn(),
        setValue: jest.fn(),
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

  describe('parseDateTime', () => {
    it('Date オブジェクトをそのまま返す', () => {
      const date = new Date('2025-01-01T12:00:00');
      expect(parseDateTime(date)).toEqual(date);
    });

    it('日付形式の文字列を Date オブジェクトに変換する', () => {
      const dateStr = '2025/01/01 12:00:00';
      const expected = new Date('2025/01/01 12:00:00');
      expect(parseDateTime(dateStr)).toEqual(expected);
    });

    it('不正な入力に対しては null を返す', () => {
      expect(parseDateTime('not a date')).toBeNull();
      expect(parseDateTime(null)).toBeNull();
      expect(parseDateTime(undefined)).toBeNull();
      expect(parseDateTime(true)).toBeNull();
    });

    it('無効な Date オブジェクト（Invalid Date）に対しては null を返す', () => {
      expect(parseDateTime(new Date('invalid'))).toBeNull();
    });

    it('ミリ秒数値は Date に変換される', () => {
      const ms = 1735686000000;
      expect(parseDateTime(ms)).toBeInstanceOf(Date);
    });
  });

  describe('loadSheetData', () => {
    it('シートからデータを正しく読み込む（表示名あり/なし両方）', () => {
      mockSheet.getLastRow.mockReturnValue(3);
      (mockSheet.getRange(2, 1, 2, 5).getValues as jest.Mock).mockReturnValue([
        [
          'group1@example.com',
          'user1@example.com',
          '2025/01/01',
          '2025/12/31',
          '  User 1  ',
          'Notes',
        ],
        [
          'group1@example.com',
          'user2@example.com',
          new Date('2025/01/01'),
          new Date('2025/12/31'),
          null,
          '',
        ],
      ]);

      const result = loadSheetData(config);

      expect(result.length).toBe(2);
      expect(result[0].groupEmail).toBe('group1@example.com' as GroupEmail);
      expect(result[0].rowIndex).toBe(2);
      expect(result[0].membershipName).toBe('User 1');
      expect(result[1].membershipName).toBeNull();
    });

    it('不完全な行（メールアドレス欠損）や日時不正な行をスキップする', () => {
      mockSheet.getLastRow.mockReturnValue(4);
      (mockSheet.getRange(2, 1, 3, 5).getValues as jest.Mock).mockReturnValue([
        ['', 'user1@example.com', '2025/01/01', '2025/12/31', 'User 1', ''],
        ['group1@example.com', '', '2025/01/01', '2025/12/31', 'User 2', ''],
        ['g1@example.com', 'u3@example.com', 'invalid', '2025/01/01', 'U3', ''],
      ]);

      const result = loadSheetData(config);
      expect(result.length).toBe(0);
    });

    it('データが存在しない場合は空配列を返す', () => {
      mockSheet.getLastRow.mockReturnValue(1);
      expect(loadSheetData(config)).toEqual([]);
    });
  });

  describe('writeMembershipNames', () => {
    it('追加されたメンバーのメンバーシップ名を正しく書き込む', () => {
      const rows: SheetRow[] = [
        {
          rowIndex: 2,
          groupEmail: 'g1@example.com' as GroupEmail,
          memberEmail: 'm1@example.com' as MemberEmail,
          startTime: new Date(),
          endTime: new Date(),
          membershipName: null,
        },
      ];
      const addedMembershipNames = new Map<MemberEmail, MembershipName>();
      addedMembershipNames.set(
        'm1@example.com' as MemberEmail,
        'Member 1' as MembershipName
      );

      const results: SyncResult[] = [
        {
          groupEmail: 'g1@example.com' as GroupEmail,
          added: ['m1@example.com' as MemberEmail],
          removed: [],
          addedMembershipNames,
        },
      ];

      writeMembershipNames(config, rows, results);

      expect(mockSheet.getRange).toHaveBeenCalledWith(2, 5);
      expect(mockSheet.getRange(2, 5).setValue).toHaveBeenCalledWith(
        'Member 1'
      );
    });

    it('追加されたメンバーのメンバーシップ名が空の場合は空文字を書き込む', () => {
      const rows: SheetRow[] = [
        {
          rowIndex: 2,
          groupEmail: 'g@example.com' as GroupEmail,
          memberEmail: 'u@example.com' as MemberEmail,
          startTime: new Date(),
          endTime: new Date(),
          membershipName: null,
        },
      ];
      const results: SyncResult[] = [
        {
          groupEmail: 'g@example.com' as GroupEmail,
          added: ['u@example.com' as MemberEmail],
          removed: [],
          addedMembershipNames: new Map<MemberEmail, MembershipName>(),
        },
      ];
      writeMembershipNames(config, rows, results);
      expect(mockSheet.getRange(2, 5).setValue).toHaveBeenCalledWith('');
    });

    it('該当する行がない、または追加がない場合は書き込まない', () => {
      // 追加リストが空の場合（ライン 126 の true 分岐）
      writeMembershipNames(
        config,
        [],
        [
          {
            groupEmail: 'g1@example.com' as GroupEmail,
            added: [],
            removed: [],
            addedMembershipNames: new Map<MemberEmail, MembershipName>(),
          },
        ]
      );
      expect(mockSheet.getRange).not.toHaveBeenCalled();

      // 該当行がない場合（ライン 134 の false 分岐）
      writeMembershipNames(
        config,
        [],
        [
          {
            groupEmail: 'g1@example.com' as GroupEmail,
            added: ['missing@example.com' as MemberEmail],
            removed: [],
            addedMembershipNames: new Map<MemberEmail, MembershipName>(),
          },
        ]
      );
      expect(mockSheet.getRange).not.toHaveBeenCalled();
    });
  });

  describe('clearRemovedMembershipNames', () => {
    it('削除されたメンバーのメンバーシップ名をクリアする', () => {
      const rows: SheetRow[] = [
        {
          rowIndex: 2,
          groupEmail: 'g1@example.com' as GroupEmail,
          memberEmail: 'm1@example.com' as MemberEmail,
          startTime: new Date(),
          endTime: new Date(),
          membershipName: 'Name' as MembershipName,
        },
      ];
      const results: SyncResult[] = [
        {
          groupEmail: 'g1@example.com' as GroupEmail,
          added: [],
          removed: ['m1@example.com' as MemberEmail],
          addedMembershipNames: new Map<MemberEmail, MembershipName>(),
        },
      ];

      clearRemovedMembershipNames(config, rows, results);

      expect(mockSheet.getRange).toHaveBeenCalledWith(2, 5);
      expect(mockSheet.getRange(2, 5).setValue).toHaveBeenCalledWith('');
    });

    it('削除対象の行が見つからない、または削除がない場合は何もしない', () => {
      // 削除リストが空の場合（ライン 162 の true 分岐）
      clearRemovedMembershipNames(
        config,
        [],
        [
          {
            groupEmail: 'g1@example.com' as GroupEmail,
            added: [],
            removed: [],
            addedMembershipNames: new Map<MemberEmail, MembershipName>(),
          },
        ]
      );
      expect(mockSheet.getRange).not.toHaveBeenCalled();

      // 該当行がない場合（ライン 169 の false 分岐）
      clearRemovedMembershipNames(
        config,
        [],
        [
          {
            groupEmail: 'g@example.com' as GroupEmail,
            added: [],
            removed: ['u@example.com' as MemberEmail],
            addedMembershipNames: new Map<MemberEmail, MembershipName>(),
          },
        ]
      );
      expect(mockSheet.getRange).not.toHaveBeenCalled();
    });
  });

  describe('writeLastOperationTime', () => {
    it('最終操作時刻を正しく書き込む', () => {
      const now = new Date();
      writeLastOperationTime(config, now);
      expect(mockSheet.getRange).toHaveBeenCalledWith('B2');
      expect(mockSheet.getRange('B2').setValue).toHaveBeenCalledWith(now);
    });
  });
});
