/**
 * syncLogic モジュールのテスト
 */

import {
  calculateDesiredState,
  calculateDiff,
  syncGroup,
} from '../src/syncLogic';
import { SheetRow, GroupEmail, MemberEmail } from '../src/types';
import * as GroupsApi from '../src/groupsApiClient';

// GroupsApi のモック
jest.mock('../src/groupsApiClient');

// GAS グローバルオブジェクトのモック
(
  global as unknown as { Logger: Partial<GoogleAppsScript.Base.Logger> }
).Logger = {
  log: jest.fn(),
};

describe('syncLogic', () => {
  describe('calculateDesiredState', () => {
    it('有効期間内のメンバーを正しく計算する', () => {
      const rows: SheetRow[] = [
        {
          rowIndex: 2,
          groupEmail: 'test@example.com' as GroupEmail,
          memberEmail: 'user1@example.com' as MemberEmail,
          startTime: new Date('2025-01-01'),
          endTime: new Date('2025-12-31'),
          membershipName: null,
        },
        {
          rowIndex: 3,
          groupEmail: 'test@example.com' as GroupEmail,
          memberEmail: 'user2@example.com' as MemberEmail,
          startTime: new Date('2025-06-01'),
          endTime: new Date('2025-06-30'),
          membershipName: null,
        },
      ];

      const currentTime = new Date('2025-06-15');
      const excludedUsers = new Set<MemberEmail>();

      const result = calculateDesiredState(rows, currentTime, excludedUsers);

      expect(result).toEqual(
        new Set([
          'user1@example.com' as MemberEmail,
          'user2@example.com' as MemberEmail,
        ])
      );
    });

    it('有効期間外のメンバーを除外する', () => {
      const rows: SheetRow[] = [
        {
          rowIndex: 2,
          groupEmail: 'test@example.com' as GroupEmail,
          memberEmail: 'user1@example.com' as MemberEmail,
          startTime: new Date('2025-01-01'),
          endTime: new Date('2025-05-31'),
          membershipName: null,
        },
      ];

      const currentTime = new Date('2025-06-15');
      const excludedUsers = new Set<MemberEmail>();

      const result = calculateDesiredState(rows, currentTime, excludedUsers);

      expect(result).toEqual(new Set());
    });

    it('操作除外ユーザーを除外する', () => {
      const rows: SheetRow[] = [
        {
          rowIndex: 2,
          groupEmail: 'test@example.com' as GroupEmail,
          memberEmail: 'admin@example.com' as MemberEmail,
          startTime: new Date('2025-01-01'),
          endTime: new Date('2025-12-31'),
          membershipName: null,
        },
        {
          rowIndex: 3,
          groupEmail: 'test@example.com' as GroupEmail,
          memberEmail: 'user@example.com' as MemberEmail,
          startTime: new Date('2025-01-01'),
          endTime: new Date('2025-12-31'),
          membershipName: null,
        },
      ];

      const currentTime = new Date('2025-06-15');
      const excludedUsers = new Set<MemberEmail>([
        'admin@example.com' as MemberEmail,
      ]);

      const result = calculateDesiredState(rows, currentTime, excludedUsers);

      expect(result).toEqual(new Set(['user@example.com' as MemberEmail]));
    });
  });

  describe('calculateDiff', () => {
    it('追加すべきメンバーを正しく計算する', () => {
      const desired = new Set<MemberEmail>([
        'user1@example.com' as MemberEmail,
        'user2@example.com' as MemberEmail,
      ]);
      const actual = new Set<MemberEmail>(['user1@example.com' as MemberEmail]);

      const result = calculateDiff(desired, actual);

      expect(result.toAdd).toEqual(['user2@example.com' as MemberEmail]);
      expect(result.toRemove).toEqual([]);
    });

    it('削除すべきメンバーを正しく計算する', () => {
      const desired = new Set<MemberEmail>([
        'user1@example.com' as MemberEmail,
      ]);
      const actual = new Set<MemberEmail>([
        'user1@example.com' as MemberEmail,
        'user2@example.com' as MemberEmail,
      ]);

      const result = calculateDiff(desired, actual);

      expect(result.toAdd).toEqual([]);
      expect(result.toRemove).toEqual(['user2@example.com' as MemberEmail]);
    });

    it('追加と削除の両方を正しく計算する', () => {
      const desired = new Set<MemberEmail>([
        'user1@example.com' as MemberEmail,
        'user3@example.com' as MemberEmail,
      ]);
      const actual = new Set<MemberEmail>([
        'user1@example.com' as MemberEmail,
        'user2@example.com' as MemberEmail,
      ]);

      const result = calculateDiff(desired, actual);

      expect(result.toAdd).toEqual(['user3@example.com' as MemberEmail]);
      expect(result.toRemove).toEqual(['user2@example.com' as MemberEmail]);
    });

    it('変更がない場合は空配列を返す', () => {
      const desired = new Set<MemberEmail>([
        'user1@example.com' as MemberEmail,
      ]);
      const actual = new Set<MemberEmail>(['user1@example.com' as MemberEmail]);

      const result = calculateDiff(desired, actual);

      expect(result.toAdd).toEqual([]);
      expect(result.toRemove).toEqual([]);
    });
  });

  describe('syncGroup', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('グループが見つからない場合はエラーを投げる', () => {
      (GroupsApi.lookupGroup as jest.Mock).mockReturnValue(null);

      expect(() =>
        syncGroup('test@example.com' as GroupEmail, [], new Set(), new Date())
      ).toThrow('グループが見つかりませんでした: test@example.com');
    });

    it('メンバーを正しく追加する', () => {
      const groupName = 'groups/12345';
      const rows: SheetRow[] = [
        {
          rowIndex: 2,
          groupEmail: 'test@example.com' as GroupEmail,
          memberEmail: 'newuser@example.com' as MemberEmail,
          startTime: new Date('2025-01-01'),
          endTime: new Date('2025-12-31'),
          membershipName: null,
        },
      ];

      (GroupsApi.lookupGroup as jest.Mock).mockReturnValue(groupName);
      (GroupsApi.listMembers as jest.Mock).mockReturnValue([]);
      (GroupsApi.addMember as jest.Mock).mockReturnValue({
        name: 'groups/12345/memberships/67890',
        email: 'newuser@example.com' as MemberEmail,
        membershipName: null,
      });

      const result = syncGroup(
        'test@example.com' as GroupEmail,
        rows,
        new Set<MemberEmail>(),
        new Date('2025-06-15')
      );

      expect(result.added).toEqual(['newuser@example.com' as MemberEmail]);
      expect(
        result.addedMembershipNames.get('newuser@example.com' as MemberEmail)
      ).toBe('groups/12345/memberships/67890');
      expect(GroupsApi.addMember).toHaveBeenCalledWith(
        groupName,
        'newuser@example.com'
      );
    });

    it('メンバーを正しく削除する', () => {
      const groupName = 'groups/12345';
      const rows: SheetRow[] = [];

      (GroupsApi.lookupGroup as jest.Mock).mockReturnValue(groupName);
      (GroupsApi.listMembers as jest.Mock).mockReturnValue([
        {
          name: 'groups/12345/memberships/67890',
          email: 'olduser@example.com' as MemberEmail,
          membershipName: 'Old User', // test data only, ignored by logic
        },
      ]);
      (GroupsApi.removeMember as jest.Mock).mockReturnValue(true);

      const result = syncGroup(
        'test@example.com' as GroupEmail,
        rows,
        new Set<MemberEmail>(),
        new Date('2025-06-15')
      );

      expect(result.removed).toEqual(['olduser@example.com' as MemberEmail]);
      expect(GroupsApi.removeMember).toHaveBeenCalledWith(
        groupName,
        'olduser@example.com'
      );
    });

    it('操作除外ユーザーを無視する', () => {
      const groupName = 'groups/12345';
      const rows: SheetRow[] = [
        {
          rowIndex: 2,
          groupEmail: 'test@example.com' as GroupEmail,
          memberEmail: 'admin@example.com' as MemberEmail,
          startTime: new Date('2025-01-01'),
          endTime: new Date('2025-12-31'),
          membershipName: null,
        },
      ];

      (GroupsApi.lookupGroup as jest.Mock).mockReturnValue(groupName);
      (GroupsApi.listMembers as jest.Mock).mockReturnValue([
        {
          name: 'groups/12345/memberships/99999',
          email: 'admin@example.com' as MemberEmail,
          membershipName: 'Admin',
        },
      ]);

      const result = syncGroup(
        'test@example.com' as GroupEmail,
        rows,
        new Set<MemberEmail>(['admin@example.com' as MemberEmail]),
        new Date('2025-06-15')
      );

      // 操作除外ユーザーなので、追加も削除もされない
      expect(result.added).toEqual([]);
      expect(result.removed).toEqual([]);
      expect(GroupsApi.addMember).not.toHaveBeenCalled();
      expect(GroupsApi.removeMember).not.toHaveBeenCalled();
    });

    it('追加や削除が失敗した場合は結果に含めない', () => {
      const groupName = 'groups/123';
      const rows: SheetRow[] = [
        {
          rowIndex: 2,
          groupEmail: 'g@example.com' as GroupEmail,
          memberEmail: 'add@example.com' as MemberEmail,
          startTime: new Date('2025-01-01'),
          endTime: new Date('2025-12-31'),
          membershipName: null,
        },
      ];

      (GroupsApi.lookupGroup as jest.Mock).mockReturnValue(groupName);
      (GroupsApi.listMembers as jest.Mock).mockReturnValue([
        { email: 'rem@example.com' as MemberEmail },
      ]);
      (GroupsApi.addMember as jest.Mock).mockReturnValue(null); // 追加失敗
      (GroupsApi.removeMember as jest.Mock).mockReturnValue(false); // 削除失敗

      const result = syncGroup(
        'g@example.com' as GroupEmail,
        rows,
        new Set<MemberEmail>(),
        new Date('2025-06-01')
      );

      expect(result.added).toEqual([]);
      expect(result.removed).toEqual([]);
    });
  });
});
