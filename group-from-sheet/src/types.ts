/**
 * @module types
 */

/**
 * ブランド型（Branded Types）の基本定義
 */
type Brand<K, T> = K & { __brand: T };

/**
 * Google グループの一意なリソース名
 * 形式: `groups/{group_id}`
 */
export type GroupName = Brand<string, 'GroupName'>;

/**
 * メンバーシップの一意なリソース名
 * 形式: `groups/{group_id}/memberships/{membership_id}`
 * @remarks
 * これは単なる「名前」ではなく、グループとメンバーの紐付け（Relation）を
 * 表す不変の識別子（Relationship ID）として機能します。
 */
export type MembershipName = Brand<string, 'MembershipName'>;

/**
 * ユーザーのメールアドレス
 */
export type MemberEmail = Brand<string, 'MemberEmail'>;

/**
 * グループのメールアドレス
 */
export type GroupEmail = Brand<string, 'GroupEmail'>;

/**
 * シート上の1行（1つのメンバーシップ設定）を表すデータ構造です。
 * スプレッドシートからの読み込みおよび書き込み、ロジック演算の基礎となります。
 */
export interface SheetRow {
  /**
   * スプレッドシート上の行番号（1-indexed）
   * 処理結果を元の行に書き戻す際に使用される
   */
  rowIndex: number;

  /**
   * 対象となる Google グループのメールアドレス
   */
  groupEmail: GroupEmail;

  /**
   * グループに追加・削除する対象メンバーのメールアドレス
   */
  memberEmail: MemberEmail;

  /**
   * メンバーシップの有効開始日時
   */
  startTime: Date;

  /**
   * メンバーシップの有効終了日時
   */
  endTime: Date;

  /**
   * メンバーシップのリソース名（Relation ID）
   * API から取得された `groups/.../memberships/...` 形式の ID が保持される
   * 未定義または未追加の場合は `null` となる
   */
  membershipName: MembershipName | null;
}

/**
 * Google Cloud Identity Groups API から取得されるメンバーシップの基本情報です。
 * 最小限のフィールド（名前、メール、表示名）を定義しています。
 */
export interface MembershipInfo {
  /**
   * API 上での一意なリソース名
   * 形式: `groups/{group_id}/memberships/{membership_id}`
   */
  name: MembershipName;

  /**
   * メンバーのプライマリメールアドレス
   */
  email: MemberEmail;
}

/**
 * 単一グループの同期実行結果を要約するための構造体です。
 * ログ出力やレポート作成に使用されます。
 */
export interface SyncResult {
  /** 対象グループのメールアドレス */
  groupEmail: GroupEmail;

  /** 今回の実行で新規追加されたメンバーのメールアドレスリスト */
  added: MemberEmail[];

  /** 今回の実行で削除されたメンバーのメールアドレスリスト */
  removed: MemberEmail[];

  /**
   * 追加されたメンバーのメールアドレスとメンバーシップ名（Relation ID）のマッピング
   * シートへの書き戻しに使用される
   */
  addedMembershipNames: Map<MemberEmail, MembershipName>;
}

/**
 * システム全体の稼働を制御する設定オブジェクト
 * `config.ts` モジュールによって初期化される
 */
export interface Config {
  /** 自動同期の対象外とするユーザーのセット */
  readonly excludedUsers: Set<MemberEmail>;

  /** 制御用セルが配置されているシートのインスタンス */
  readonly settingsSheet: GoogleAppsScript.Spreadsheet.Sheet;

  /** メンバー一覧データが格納されているシートのインスタンス */
  readonly dataSheet: GoogleAppsScript.Spreadsheet.Sheet;

  /**
   * シートロックの状態を制御するセルのアドレス（デフォルト: 'B1'）。
   */
  readonly lockCellAddress: string;

  /** 最後に同期が正常完了した時刻を記録するセルのアドレス（デフォルト: 'B2'） */
  readonly lastOperationCellAddress: string;

  /** メンバーシップのデータが開始される行番号（1-indexed） */
  readonly dataStartRow: number;
}

/** スプレッドシートの各シート名 */
export const SHEET_NAMES = {
  /** システム制御用（ロック、最終操作ログ等） */
  SETTINGS: 'システム設定',
  /** グループ同期データ用 */
  DATA: '同期リスト',
} as const;

/**
 * システムのデフォルト設定値（マジックリテラル排除用）
 */
export const DEFAULT_CONFIG = {
  /** ロックセルのアドレス ('B1') */
  LOCK_CELL_ADDRESS: 'B1',
  /** 最終操作時刻セルのアドレス ('B2') */
  LAST_OP_CELL_ADDRESS: 'B2',
  /** データ開始行 (1行目:ヘッダー, 2行目以降:データ) */
  DATA_START_ROW: 2,
} as const;

/** スプレッドシート内の列インデックス定義（0-indexed） */
export const COLUMN_INDEX = {
  /** A列: グループメールアドレス */
  GROUP_EMAIL: 0,
  /** B列: メンバーメールアドレス */
  MEMBER_EMAIL: 1,
  /** C列: 開始時刻 */
  START_TIME: 2,
  /** D列: 終了時刻 */
  END_TIME: 3,
  /**
   * E列: メンバーシップ名（Relation ID）
   * API から返却される `groups/{groupId}/memberships/{membershipId}` 形式の ID。
   * これを保持しておくことで、削除時などの特定に使用する。
   */
  MEMBERSHIP_NAME: 4,
} as const;

/**
 * Google Apps Script のスクリプトプロパティで使用するキー名の定数
 */
export const SCRIPT_PROPERTY_KEYS = {
  /** 操作除外ユーザーリスト（カンマ区切り文字列） */
  EXCLUDED_USERS: 'EXCLUDED_USERS',
} as const;

/**
 * 排他制御（ロック）に関連する動作パラメータ
 */
export const LOCK_CONFIG = {
  /**
   * ロック取得およびシート監視の最大継続時間（ミリ秒）
   * デフォルトは 3 分
   */
  MAX_LOCK_WAIT_MS: 3 * 60 * 1000,

  /**
   * 指数バックオフの初期待機時間（ミリ秒）
   */
  INITIAL_BACKOFF_MS: 1000,

  /**
   * 指数バックオフによる待機時間の最大上限（ミリ秒）
   */
  MAX_BACKOFF_MS: 30000,
};
