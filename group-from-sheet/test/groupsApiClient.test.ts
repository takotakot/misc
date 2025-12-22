/**
 * groupsApiClient モジュールのテスト
 */

import {
  lookupGroup,
  listMembers,
  addMember,
  removeMember,
} from '../src/groupsApiClient';
import {
  GroupName,
  GroupEmail,
  MemberEmail,
  MembershipName,
} from '../src/types';

// GAS グローバルオブジェクトのモック
(
  global as unknown as {
    Logger: Partial<GoogleAppsScript.Base.Logger>;
  }
).Logger = {
  log: jest.fn(),
};

const mockCloudIdentityGroups = {
  Groups: {
    lookup: jest.fn(),
    Memberships: {
      list: jest.fn(),
      create: jest.fn(),
      remove: jest.fn(),
      lookup: jest.fn(),
    },
  },
};

(
  global as unknown as {
    CloudIdentityGroups: typeof mockCloudIdentityGroups;
  }
).CloudIdentityGroups = mockCloudIdentityGroups;

describe('groupsApiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('lookupGroup', () => {
    it('グループが見つかった場合にその名前を返す', () => {
      mockCloudIdentityGroups.Groups.lookup.mockReturnValue({
        name: 'groups/123',
      });

      const result = lookupGroup('test@example.com' as GroupEmail);

      expect(result).toBe('groups/123');
      expect(mockCloudIdentityGroups.Groups.lookup).toHaveBeenCalledWith({
        'groupKey.id': 'test@example.com',
      });
    });

    it('グループが見つからない場合に null を返す', () => {
      mockCloudIdentityGroups.Groups.lookup.mockReturnValue(null);
      expect(lookupGroup('test@example.com' as GroupEmail)).toBeNull();
    });

    it('エラーが発生した場合に null を返す', () => {
      mockCloudIdentityGroups.Groups.lookup.mockImplementation(() => {
        throw new Error('API Error');
      });
      expect(lookupGroup('test@example.com' as GroupEmail)).toBeNull();
    });
  });

  describe('listMembers', () => {
    it('全ページのメンバーを正しく取得する', () => {
      mockCloudIdentityGroups.Groups.Memberships.list
        .mockReturnValueOnce({
          memberships: [
            {
              name: 'm1',
              preferredMemberKey: { id: 'u1@example.com' },
              memberDisplayName: 'User 1',
            },
          ],
          nextPageToken: 'token1',
        })
        .mockReturnValueOnce({
          memberships: [
            {
              name: 'm2',
              preferredMemberKey: { id: 'u2@example.com' },
              memberDisplayName: 'User 2',
            },
          ],
        });

      const result = listMembers('groups/123' as GroupName);

      expect(result.length).toBe(2);
      expect(result[0].email).toBe('u1@example.com');
      expect(result[1].email).toBe('u2@example.com');
      expect(
        mockCloudIdentityGroups.Groups.Memberships.list
      ).toHaveBeenCalledTimes(2);
    });

    it('エラーが発生した場合は空配列を返す', () => {
      mockCloudIdentityGroups.Groups.Memberships.list.mockImplementation(() => {
        throw new Error('Listing failed');
      });
      expect(listMembers('groups/123' as GroupName)).toEqual([]);
    });

    it('メンバーシップのメールアドレスが欠損している場合はスキップする', () => {
      mockCloudIdentityGroups.Groups.Memberships.list.mockReturnValue({
        memberships: [{ name: 'm1' }], // preferredMemberKey 欠損
      });
      expect(listMembers('groups/123' as GroupName)).toEqual([]);
    });

    it('メンバーシップが空の場合は空配列を返す', () => {
      mockCloudIdentityGroups.Groups.Memberships.list.mockReturnValue({});
      expect(listMembers('groups/123' as GroupName)).toEqual([]);
    });
  });

  describe('addMember', () => {
    it('正常にメンバーを追加できる', () => {
      mockCloudIdentityGroups.Groups.Memberships.create.mockReturnValue({
        response: {
          name: 'groups/123/memberships/456' as MembershipName,
          memberDisplayName: 'New User',
        },
      });

      const result = addMember(
        'groups/123' as GroupName,
        'new@example.com' as MemberEmail
      );

      expect(result?.email).toBe('new@example.com' as MemberEmail);
      expect(result?.name).toBe('groups/123/memberships/456' as MembershipName);
      expect(
        mockCloudIdentityGroups.Groups.Memberships.create
      ).toHaveBeenCalled();
    });

    it('エラー時は null を返す', () => {
      mockCloudIdentityGroups.Groups.Memberships.create.mockImplementation(
        () => {
          throw new Error('Creation failed');
        }
      );
      expect(
        addMember('groups/123' as GroupName, 'new@example.com' as MemberEmail)
      ).toBeNull();
    });

    it('レスポンスに情報が含まれない場合は null を返す', () => {
      mockCloudIdentityGroups.Groups.Memberships.create.mockReturnValue({});
      expect(
        addMember('groups/123' as GroupName, 'new@example.com' as MemberEmail)
      ).toBeNull();
    });
  });

  describe('removeMember', () => {
    it('正常にメンバーを削除できる', () => {
      mockCloudIdentityGroups.Groups.Memberships.lookup.mockReturnValue({
        name: 'groups/123/memberships/456' as MembershipName,
      });

      const result = removeMember(
        'groups/123' as GroupName,
        'old@example.com' as MemberEmail
      );

      expect(result).toBe(true);
      expect(
        mockCloudIdentityGroups.Groups.Memberships.remove
      ).toHaveBeenCalledWith('groups/123/memberships/456');
    });

    it('メンバーが見つからない場合は true を返す', () => {
      mockCloudIdentityGroups.Groups.Memberships.lookup.mockReturnValue(null);
      const result = removeMember(
        'groups/123' as GroupName,
        'none@example.com' as MemberEmail
      );
      expect(result).toBe(true);
      expect(
        mockCloudIdentityGroups.Groups.Memberships.remove
      ).not.toHaveBeenCalled();
    });

    it('検索エラー時は true を返す', () => {
      mockCloudIdentityGroups.Groups.Memberships.lookup.mockImplementation(
        () => {
          throw new Error('Lookup failed');
        }
      );
      expect(
        removeMember(
          'groups/123' as GroupName,
          'error@example.com' as MemberEmail
        )
      ).toBe(true);
    });

    it('削除実行エラー時は false を返す', () => {
      mockCloudIdentityGroups.Groups.Memberships.lookup.mockReturnValue({
        name: 'groups/123/memberships/456' as MembershipName,
      });
      mockCloudIdentityGroups.Groups.Memberships.remove.mockImplementation(
        () => {
          throw new Error('Remove failed');
        }
      );
      expect(
        removeMember(
          'groups/123' as GroupName,
          'error@example.com' as MemberEmail
        )
      ).toBe(false);
    });
  });
});
