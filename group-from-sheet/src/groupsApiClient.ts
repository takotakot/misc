import {
  MembershipInfo,
  GroupName,
  MembershipName,
  MemberEmail,
  GroupEmail,
} from './types';

/**
 * Cloud Identity Groups API クライアントモジュール
 *
 * Google Workspace / Cloud Identity のグループメンバーシップを管理するための
 * API クライアント機能を提供します。
 *
 * `CloudIdentity` Advanced Service を利用し、単一の責務を持つ
 * 小さな関数群で構成されています。
 *
 * @module groupsApiClient
 */

/**
 * グループのメールアドレスからリソース名（`groups/{group_id}`）を検索します。
 *
 * @param groupEmail - 検索対象のグループメールアドレス。
 * @returns グループのリソース名。見つからない場合やエラー時は `null` を返します。
 *
 * @example
 * ```typescript
 * const groupName = lookupGroup('team-a@example.com');
 * if (groupName) {
 *   // groupName: "groups/01abcd2345"
 * }
 * ```
 */
export const lookupGroup = (groupEmail: GroupEmail): GroupName | null => {
  try {
    const response = CloudIdentityGroups.Groups.lookup({
      'groupKey.id': groupEmail,
    });

    if (response && response.name) {
      Logger.log(`グループを特定しました: ${groupEmail} -> ${response.name}`);
      return response.name as GroupName;
    }

    return null;
  } catch (e) {
    const error = e as Error;
    Logger.log(
      `グループの検索中にエラーが発生しました (${groupEmail}): ${error.message}`
    );
    return null;
  }
};

/**
 * 指定されたグループの全メンバー一覧を同期的に取得します（ページネーション対応）。
 *
 * @param groupName - グループのリソース名（`groups/` で始まるパス）。
 * @returns メンバー情報の配列。取得失敗時は空の配列を返します。
 *
 * @example
 * ```typescript
 * const members = listMembers('groups/01abcd2345');
 * members.forEach(m => Logger.log(m.email));
 * ```
 */
export const listMembers = (groupName: GroupName): MembershipInfo[] => {
  const members: MembershipInfo[] = [];

  try {
    let pageToken: string | undefined = undefined;

    do {
      // ページネーションオプションの構築
      const options: CloudIdentityGroups.Groups.Memberships.ListOptions = {
        pageSize: 100,
      };

      if (pageToken) {
        options.pageToken = pageToken;
      }

      const response = CloudIdentityGroups.Groups.Memberships.list(
        groupName,
        options
      );

      if (response.memberships) {
        for (const membership of response.memberships) {
          const email = membership.preferredMemberKey?.id;
          if (email) {
            members.push({
              name: membership.name as MembershipName,
              email: email as MemberEmail,
            });
          }
        }
      }

      pageToken = response.nextPageToken;
    } while (pageToken);

    Logger.log(`${groupName} には ${members.length} 人のメンバーがいます。`);
    return members;
  } catch (e) {
    const error = e as Error;
    Logger.log(`メンバー一覧の取得に失敗しました: ${error.message}`);
    return [];
  }
};

/**
 * グループに新しいメンバーを追加します。
 * ロールはデフォルトで `MEMBER` として付与されます。
 *
 * @param groupName - グループのリソース名。
 * @param memberEmail - 追加するユーザーのメールアドレス。
 * @returns 追加されたメンバーの情報を返します。失敗時は `null`。
 *
 * @example
 * ```typescript
 * const result = addMember('groups/01abcd2345', 'new-user@example.com');
 * ```
 */
export const addMember = (
  groupName: GroupName,
  memberEmail: MemberEmail
): MembershipInfo | null => {
  try {
    const membership = {
      preferredMemberKey: { id: memberEmail },
      roles: [{ name: 'MEMBER' }],
    };

    const result = CloudIdentityGroups.Groups.Memberships.create(
      membership,
      groupName
    );

    // API のレスポンスから情報を抽出
    if (result && result.response) {
      Logger.log(`メンバーを追加しました: ${memberEmail}`);
      return {
        name: result.response.name as MembershipName,
        email: memberEmail,
      };
    }

    return null;
  } catch (e) {
    const error = e as Error;
    Logger.log(
      `メンバーの追加に失敗しました (${memberEmail}): ${error.message}`
    );
    return null;
  }
};

/**
 * グループから指定されたメールアドレスのメンバーを削除します。
 *
 * @param groupName - グループのリソース名。
 * @param memberEmail - 削除するユーザーのメールアドレス。
 * @returns 削除に成功した（または既に存在しない）場合は `true`、失敗時は `false`。
 */
export const removeMember = (
  groupName: GroupName,
  memberEmail: MemberEmail
): boolean => {
  try {
    // 削除には membershipId が必要なので lookup して特定する
    const membershipName = getMembershipName(groupName, memberEmail);

    if (!membershipName) {
      Logger.log(
        `対象メンバーが見つかりませんでした。既に削除されている可能性があります: ${memberEmail}`
      );
      return true;
    }

    CloudIdentityGroups.Groups.Memberships.remove(membershipName);
    Logger.log(`メンバーを削除しました: ${memberEmail}`);
    return true;
  } catch (e) {
    const error = e as Error;
    Logger.log(
      `メンバーの削除中にエラーが発生しました (${memberEmail}): ${error.message}`
    );
    return false;
  }
};

/**
 * メンバーシップのリソース名を取得するための内部ヘルパー関数です。
 *
 * @param groupName - グループのリソース名。
 * @param memberEmail - メンバーのメールアドレス。
 * @returns メンバーシップ名（`groups/.../memberships/...`）。
 * @internal
 */
const getMembershipName = (
  groupName: GroupName,
  memberEmail: MemberEmail
): MembershipName | null => {
  try {
    const response = CloudIdentityGroups.Groups.Memberships.lookup(groupName, {
      'memberKey.id': memberEmail,
    });

    return (response?.name as MembershipName) || null;
  } catch (e) {
    // メンバーが存在しない場合は 404 エラーとなるが、ここでは null を返すことで対応
    return null;
  }
};
