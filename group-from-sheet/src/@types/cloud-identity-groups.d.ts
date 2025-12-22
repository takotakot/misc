/**
 * Cloud Identity Groups API の型宣言
 * GAS の Advanced Service として有効にする必要がある
 */

declare namespace CloudIdentityGroups {
  namespace Groups {
    function lookup(params: { 'groupKey.id': string }): { name: string };

    namespace Memberships {
      /** メンバー一覧取得時のオプション */
      interface ListOptions {
        pageSize?: number;
        pageToken?: string;
        view?: string;
      }

      function list(
        groupName: string,
        options?: ListOptions
      ): {
        memberships?: Array<{
          name: string;
          preferredMemberKey?: { id: string };
          roles?: Array<{ name: string }>;
        }>;
        nextPageToken?: string;
      };

      function create(
        membership: {
          preferredMemberKey: { id: string };
          roles: Array<{ name: string }>;
        },
        groupName: string
      ): {
        response: {
          name: string;
        };
      };

      function remove(membershipName: string): void;

      function lookup(
        groupName: string,
        params: { 'memberKey.id': string }
      ): { name: string } | null;
    }
  }
}
