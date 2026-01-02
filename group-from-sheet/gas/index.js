const SHEET_NAMES = {
  SETTINGS: 'システム設定',
  DATA: '同期リスト',
};
const DEFAULT_CONFIG = {
  LOCK_CELL_ADDRESS: 'B1',
  LAST_OP_CELL_ADDRESS: 'B2',
  DATA_START_ROW: 2,
};
const COLUMN_INDEX = {
  GROUP_EMAIL: 0,
  MEMBER_EMAIL: 1,
  START_TIME: 2,
  END_TIME: 3,
  MEMBERSHIP_NAME: 4,
};
const SCRIPT_PROPERTY_KEYS = {
  EXCLUDED_USERS: 'EXCLUDED_USERS',
};
const LOCK_CONFIG = {
  MAX_LOCK_WAIT_MS: 3 * 60 * 1000,
  INITIAL_BACKOFF_MS: 1000,
  MAX_BACKOFF_MS: 30000,
};

const getExcludedUsers = () => {
  const properties = PropertiesService.getScriptProperties();
  const excludedUsersStr = properties.getProperty(
    SCRIPT_PROPERTY_KEYS.EXCLUDED_USERS
  );
  if (!excludedUsersStr) {
    Logger.log(
      '操作除外ユーザーリスト (EXCLUDED_USERS) が設定されていません。'
    );
    return new Set();
  }
  const emails = excludedUsersStr
    .split(',')
    .map(email => email.trim())
    .filter(email => email.length > 0);
  Logger.log(`操作除外ユーザーとして ${emails.length} 件をロードしました。`);
  return new Set(emails);
};
const getConfig = () => {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('アクティブなスプレッドシートが見つかりません。');
  }
  const settingsSheet = spreadsheet.getSheetByName(SHEET_NAMES.SETTINGS);
  const dataSheet = spreadsheet.getSheetByName(SHEET_NAMES.DATA);
  if (!settingsSheet || !dataSheet) {
    const missing = [];
    if (!settingsSheet) missing.push(`'${SHEET_NAMES.SETTINGS}'`);
    if (!dataSheet) missing.push(`'${SHEET_NAMES.DATA}'`);
    throw new Error(
      `必要なシートが見つかりません: ${missing.join(', ')}。シートを作成してください。`
    );
  }
  return {
    excludedUsers: getExcludedUsers(),
    settingsSheet,
    dataSheet,
    lockCellAddress: DEFAULT_CONFIG.LOCK_CELL_ADDRESS,
    lastOperationCellAddress: DEFAULT_CONFIG.LAST_OP_CELL_ADDRESS,
    dataStartRow: DEFAULT_CONFIG.DATA_START_ROW,
  };
};

const isSheetLocked = config => {
  SpreadsheetApp.flush();
  const lockRange = config.settingsSheet.getRange(config.lockCellAddress);
  const value = lockRange.getValue();
  if (typeof value === 'string') {
    const upperValue = value.toUpperCase().trim();
    return upperValue === 'ON' || upperValue === 'TRUE' || upperValue === '1';
  }
  return Boolean(value);
};
const waitForSheetLock = (config, startTime) => {
  let backoffMs = LOCK_CONFIG.INITIAL_BACKOFF_MS;
  while (isSheetLocked(config)) {
    const elapsedMs = Date.now() - startTime;
    if (elapsedMs >= LOCK_CONFIG.MAX_LOCK_WAIT_MS) {
      throw new Error(
        `シートロック待機がタイムアウトしました（${LOCK_CONFIG.MAX_LOCK_WAIT_MS / 1000}秒経過）`
      );
    }
    Logger.log(`シートがロックされています。${backoffMs}ms 間待機します...`);
    Utilities.sleep(backoffMs);
    backoffMs = Math.min(backoffMs * 2, LOCK_CONFIG.MAX_BACKOFF_MS);
  }
};
const tryLockWithExponentialBackoff = (lock, startTime) => {
  let backoffMs = LOCK_CONFIG.INITIAL_BACKOFF_MS;
  while (Date.now() - startTime < LOCK_CONFIG.MAX_LOCK_WAIT_MS) {
    const elapsedMs = Date.now() - startTime;
    const remainingMs = LOCK_CONFIG.MAX_LOCK_WAIT_MS - elapsedMs;
    const waitMs = Math.min(remainingMs, backoffMs);
    if (lock.tryLock(waitMs)) {
      return true;
    }
    Logger.log(
      `[Lock] ロック取得に失敗しました。${backoffMs}ms 後に再試行します...`
    );
    Utilities.sleep(backoffMs);
    backoffMs = Math.min(backoffMs * 2, LOCK_CONFIG.MAX_BACKOFF_MS);
  }
  return false;
};
const acquireLockWithRetry = startTime => {
  const lock = LockService.getDocumentLock();
  if (!lock) {
    throw new Error('DocumentLock の取得に失敗しました（初期化不可）。');
  }
  const success = tryLockWithExponentialBackoff(lock, startTime);
  if (!success) {
    throw new Error(
      `システムロックを取得できませんでした（タイムアウト: ${LOCK_CONFIG.MAX_LOCK_WAIT_MS}ms）`
    );
  }
  Logger.log('[Lock] システムロック（DocumentLock）を確立しました。');
  return {
    lock,
    release: () => {
      if (lock.hasLock()) {
        lock.releaseLock();
        Logger.log('[Lock] システムロックを解放しました。');
      }
    },
  };
};

const parseDateTime = value => {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
};
const loadSheetData = config => {
  const { dataSheet, dataStartRow } = config;
  const lastRow = dataSheet.getLastRow();
  if (lastRow < dataStartRow) {
    Logger.log('データ行が見つかりませんでした。');
    return [];
  }
  const numRows = lastRow - dataStartRow + 1;
  const values = dataSheet.getRange(dataStartRow, 1, numRows, 5).getValues();
  const rows = [];
  values.forEach((row, index) => {
    const rowIndex = dataStartRow + index;
    const groupEmailValue = row[COLUMN_INDEX.GROUP_EMAIL];
    const memberEmailValue = row[COLUMN_INDEX.MEMBER_EMAIL];
    const startTimeValue = row[COLUMN_INDEX.START_TIME];
    const endTimeValue = row[COLUMN_INDEX.END_TIME];
    const membershipNameValue = row[COLUMN_INDEX.MEMBERSHIP_NAME];
    if (!groupEmailValue || !memberEmailValue) {
      return;
    }
    const startTime = parseDateTime(startTimeValue);
    const endTime = parseDateTime(endTimeValue);
    if (!startTime || !endTime) {
      Logger.log(
        `[Warning] 行 ${rowIndex} の日時形式が不正なためスキップしました (Start: ${startTimeValue}, End: ${endTimeValue})`
      );
      return;
    }
    rows.push({
      rowIndex,
      groupEmail: String(groupEmailValue).trim(),
      memberEmail: String(memberEmailValue).trim(),
      startTime,
      endTime,
      membershipName: membershipNameValue
        ? String(membershipNameValue).trim()
        : null,
    });
  });
  Logger.log(`シートから ${rows.length} 件の有効なデータを読み込みました。`);
  return rows;
};
const writeMembershipNames = (config, rows, results) => {
  const { dataSheet } = config;
  results.forEach(result => {
    if (result.added.length === 0) return;
    result.added.forEach(memberEmail => {
      const row = rows.find(
        r => r.groupEmail === result.groupEmail && r.memberEmail === memberEmail
      );
      if (row) {
        const membershipName =
          result.addedMembershipNames.get(memberEmail) || '';
        dataSheet
          .getRange(row.rowIndex, COLUMN_INDEX.MEMBERSHIP_NAME + 1)
          .setValue(membershipName);
        Logger.log(
          `[Output] 行 ${row.rowIndex} にメンバーシップ名を書き込みました: ${membershipName}`
        );
      }
    });
  });
};
const clearRemovedMembershipNames = (config, rows, results) => {
  const { dataSheet } = config;
  results.forEach(result => {
    if (result.removed.length === 0) return;
    result.removed.forEach(memberEmail => {
      const row = rows.find(
        r => r.groupEmail === result.groupEmail && r.memberEmail === memberEmail
      );
      if (row) {
        dataSheet
          .getRange(row.rowIndex, COLUMN_INDEX.MEMBERSHIP_NAME + 1)
          .setValue('');
        Logger.log(
          `[Output] 行 ${row.rowIndex} のメンバーシップ名をクリアしました: ${memberEmail}`
        );
      }
    });
  });
};
const writeLastOperationTime = (config, time) => {
  const { settingsSheet, lastOperationCellAddress } = config;
  settingsSheet.getRange(lastOperationCellAddress).setValue(time);
  Logger.log(
    `[Output] 最終操作時刻を更新しました: ${time.toLocaleString('ja-JP')}`
  );
};

const lookupGroup = groupEmail => {
  try {
    const response = CloudIdentityGroups.Groups.lookup({
      'groupKey.id': groupEmail,
    });
    if (response && response.name) {
      Logger.log(`グループを特定しました: ${groupEmail} -> ${response.name}`);
      return response.name;
    }
    return null;
  } catch (e) {
    const error = e;
    Logger.log(
      `グループの検索中にエラーが発生しました (${groupEmail}): ${error.message}`
    );
    return null;
  }
};
const listMembers = groupName => {
  const members = [];
  try {
    let pageToken = undefined;
    do {
      const options = {
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
              name: membership.name,
              email: email,
            });
          }
        }
      }
      pageToken = response.nextPageToken;
    } while (pageToken);
    Logger.log(`${groupName} には ${members.length} 人のメンバーがいます。`);
    return members;
  } catch (e) {
    const error = e;
    Logger.log(`メンバー一覧の取得に失敗しました: ${error.message}`);
    return [];
  }
};
const addMember = (groupName, memberEmail) => {
  try {
    const membership = {
      preferredMemberKey: { id: memberEmail },
      roles: [{ name: 'MEMBER' }],
    };
    const result = CloudIdentityGroups.Groups.Memberships.create(
      membership,
      groupName
    );
    if (result && result.response) {
      Logger.log(`メンバーを追加しました: ${memberEmail}`);
      return {
        name: result.response.name,
        email: memberEmail,
      };
    }
    return null;
  } catch (e) {
    const error = e;
    Logger.log(
      `メンバーの追加に失敗しました (${memberEmail}): ${error.message}`
    );
    return null;
  }
};
const removeMember = (groupName, memberEmail) => {
  try {
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
    const error = e;
    Logger.log(
      `メンバーの削除中にエラーが発生しました (${memberEmail}): ${error.message}`
    );
    return false;
  }
};
const getMembershipName = (groupName, memberEmail) => {
  try {
    const response = CloudIdentityGroups.Groups.Memberships.lookup(groupName, {
      'memberKey.id': memberEmail,
    });
    return response?.name || null;
  } catch (e) {
    return null;
  }
};

const calculateDesiredState = (rows, currentTime, excludedUsers) => {
  const desiredEmails = rows
    .filter(row => !excludedUsers.has(row.memberEmail))
    .filter(row => row.startTime <= currentTime && currentTime <= row.endTime)
    .map(row => row.memberEmail);
  return new Set(desiredEmails);
};
const calculateDiff = (desired, actual) => {
  const toAdd = [...desired].filter(email => !actual.has(email));
  const toRemove = [...actual].filter(email => !desired.has(email));
  return { toAdd, toRemove };
};
const syncGroup = (groupEmail, rows, excludedUsers, currentTime) => {
  Logger.log(`[Sync] グループ同期を開始します: ${groupEmail}`);
  const groupName = lookupGroup(groupEmail);
  if (!groupName) {
    throw new Error(`グループが見つかりませんでした: ${groupEmail}`);
  }
  const currentMembers = listMembers(groupName);
  const currentEmails = new Set(
    currentMembers.map(m => m.email).filter(email => !excludedUsers.has(email))
  );
  const desiredState = calculateDesiredState(rows, currentTime, excludedUsers);
  const { toAdd, toRemove } = calculateDiff(desiredState, currentEmails);
  const addedMemberInfos = toAdd
    .map(email => addMember(groupName, email))
    .filter(info => info !== null);
  const addedEmails = addedMemberInfos.map(info => info.email);
  const addedMembershipNamesMap = new Map(
    addedMemberInfos.map(info => [info.email, info.name])
  );
  const removedEmails = toRemove.filter(email =>
    removeMember(groupName, email)
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

const syncGroupsFromSheet = () => {
  const startTime = Date.now();
  let releaseLock = null;
  try {
    Logger.log('===== [Process Start] グループ同期処理を開始します =====');
    const config = getConfig();
    waitForSheetLock(config, startTime);
    const lockResult = acquireLockWithRetry(startTime);
    releaseLock = lockResult.release;
    const allRows = loadSheetData(config);
    if (allRows.length === 0) {
      Logger.log(
        '[Notice] 同期対象のデータが0件のため、処理を正常終了します。'
      );
      return;
    }
    const rowsByGroup = new Map();
    allRows.forEach(row => {
      const groupRows = rowsByGroup.get(row.groupEmail) || [];
      groupRows.push(row);
      rowsByGroup.set(row.groupEmail, groupRows);
    });
    Logger.log(
      `[Process] ${rowsByGroup.size} 個のユニークなグループを処理します。`
    );
    const currentTime = new Date();
    const syncResults = [];
    rowsByGroup.forEach((rows, groupEmail) => {
      const result = syncGroup(
        groupEmail,
        rows,
        config.excludedUsers,
        currentTime
      );
      syncResults.push(result);
    });
    writeMembershipNames(config, allRows, syncResults);
    clearRemovedMembershipNames(config, allRows, syncResults);
    const hasChanges = syncResults.some(
      r => r.added.length > 0 || r.removed.length > 0
    );
    if (hasChanges) {
      writeLastOperationTime(config, new Date());
      Logger.log(
        '[Process] 変更が適用されたため、最終操作時刻を記録しました。'
      );
    } else {
      Logger.log('[Process] すべてのグループが同期済みでした（変更なし）。');
    }
    Logger.log(
      '===== [Process Success] すべての同期ステップが完了しました ====='
    );
  } catch (e) {
    const error = e;
    Logger.log(
      `[Critical] 同期プロセス中に致命的なエラーが発生しました: ${error.message}`
    );
    if (error.stack) {
      Logger.log(`Stack Trace:\n${error.stack}`);
    }
    throw e;
  } finally {
    if (releaseLock) {
      releaseLock();
    }
  }
};

const onOpen = () => {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('グループ同期')
    .addItem('グループ同期の実行', onTimeTriggered.name)
    .addToUi();
};
const onTimeTriggered = () => {
  try {
    syncGroupsFromSheet();
  } catch (e) {
    const error = e;
    Logger.log(
      `[Fatal Error] グループ同期プロセスが異常終了しました: ${error.message}`
    );
    if (error.stack) {
      Logger.log(error.stack);
    }
  }
};
