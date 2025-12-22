import {
  SheetRow,
  SyncResult,
  MemberEmail,
  GroupEmail,
  MembershipName,
} from './types';
import * as GroupsApi from './groupsApiClient';

/**
 * グループメンバーシップ同期ロジックモジュール
 *
 * 宣言的調整（Declarative Reconciliation）パターンを用いて、
 * スプレッドシート上に定義された「あるべき状態（Desired State）」と
 * Google グループの「現在の状態（Actual State）」の差分を計算し、
 * API を通じて同期を実行します。
 *
 * @module syncLogic
 */

/**
 * 現在時刻と有効期間の整合性をチェックし、あるべきメンバーの状態を計算します。
 *
 * @param rows - 同一グループに関連するシートデータ行のリスト。
 * @param currentTime - 判定の基準となる現在時刻。
 * @param excludedUsers - 自動操作（追加・削除）をスキップすべき特権ユーザー。
 * @returns 現在グループに所属しているべきメンバーのメールアドレスセット。
 *
 * @example
 */
export const calculateDesiredState = (
  rows: SheetRow[],
  currentTime: Date,
  excludedUsers: Set<MemberEmail>
): Set<MemberEmail> => {
  const desiredEmails = rows
    .filter(row => !excludedUsers.has(row.memberEmail))
    .filter(row => row.startTime <= currentTime && currentTime <= row.endTime)
    .map(row => row.memberEmail);

  return new Set<MemberEmail>(desiredEmails);
};

/**
 * 期待される状態と実際の状態を比較し、適用すべき差分（追加/削除アクション）を計算します。
 *
 * @param desired - 同期完了後にあるべきメンバーのセット。
 * @param actual - 現在グループに所属しているメンバーのセット。
 * @returns 追加が必要なユーザーと削除が必要なユーザーのリスト。
 */
export const calculateDiff = (
  desired: Set<MemberEmail>,
  actual: Set<MemberEmail>
): { toAdd: MemberEmail[]; toRemove: MemberEmail[] } => {
  const toAdd = [...desired].filter(email => !actual.has(email));
  const toRemove = [...actual].filter(email => !desired.has(email));

  return { toAdd, toRemove };
};

/**
 * 単一のグループを対象に、情報の取得・差分計算・API 適用までの一連の同期プロセスを実行します。
 *
 * @param groupEmail - 同期対象グループのメールアドレス。
 * @param rows - このグループに関連するシートデータ行。
 * @param excludedUsers - 同期除外ユーザー。
 * @param currentTime - 判定基準時刻。
 * @returns 実際に実行された変更内容を含む同期結果オブジェクト。
 */
export const syncGroup = (
  groupEmail: GroupEmail,
  rows: SheetRow[],
  excludedUsers: Set<MemberEmail>,
  currentTime: Date
): SyncResult => {
  Logger.log(`[Sync] グループ同期を開始します: ${groupEmail}`);

  // 1. グループ名（リソースID）の特定
  const groupName = GroupsApi.lookupGroup(groupEmail);
  if (!groupName) {
    throw new Error(`グループが見つかりませんでした: ${groupEmail}`);
  }

  // 2. クラウド上の現在の状態を取得
  const currentMembers = GroupsApi.listMembers(groupName);
  // 操作除外ユーザーを考慮した、純粋な「操作対象メンバー」のみを抽出
  const currentEmails = new Set<MemberEmail>(
    currentMembers.map(m => m.email).filter(email => !excludedUsers.has(email))
  );

  // 3. スプレッドシートに基づくあるべき状態を計算
  const desiredState = calculateDesiredState(rows, currentTime, excludedUsers);

  // 4. 差分（追加/削除）の抽出
  const { toAdd, toRemove } = calculateDiff(desiredState, currentEmails);

  // 5. 変更の適用（API実行）
  // 追加処理
  const addedMemberInfos = toAdd
    .map(email => GroupsApi.addMember(groupName, email))
    .filter((info): info is NonNullable<typeof info> => info !== null);

  const addedEmails = addedMemberInfos.map(info => info.email);
  const addedMembershipNamesMap = new Map<MemberEmail, MembershipName>(
    addedMemberInfos.map(info => [info.email, info.name])
  );

  // 削除処理
  const removedEmails = toRemove.filter(email =>
    GroupsApi.removeMember(groupName, email)
  );

  Logger.log(
    `[Sync] 同期完了: ${groupEmail} (追加: ${addedEmails.length}, 削除: ${removedEmails.length})`
  );

  return {
    groupEmail,
    added: addedEmails,
    removed: removedEmails,
    addedMembershipNames: addedMembershipNamesMap,
  };
};
