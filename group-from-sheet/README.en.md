# Google Groups Member Synchronization System

A system that automatically synchronizes Google Groups members based on data in Google Sheets, while managing validity periods.

## Features

- **Time-based Membership Management**: Automatically adds and removes members based on start and end times.
- **Declarative Reconciliation**: Treats the sheet content as the "source of truth" and keeps the group state consistent with the sheet.
- **Excluded Users**: Allows setting users (e.g., administrators) to be excluded from system operations.
- **Double Lock Mechanism**: Prevents concurrent execution using both sheet locks and `LockService`.
- **Exponential Backoff**: Retries for up to 3 minutes if lock acquisition fails.

## Prerequisites

1. Google Workspace Account
2. Google Groups Management Permissions
3. Google Apps Script Project
4. Cloud Identity Groups API enabled (as an Advanced Service)

## Setup

### 1. Prepare Google Sheet

Create a spreadsheet with the following structure (**Sheet names are fixed**):

**1. Data Management Sheet**
- **Sheet Name**: `同期リスト`
- **Columns**:

| Column A: Group Email | Column B: Member Email | Column C: Start Time | Column D: End Time | Column E: Membership Name |
|-----------------------|------------------------|----------------------|--------------------|---------------------------|
| group@example.com     | user1@example.com      | 2025/01/01 09:00     | 2025/12/31 23:59   | (Auto-filled)             |
| group@example.com     | user2@example.com      | 2025/06/01 00:00     | 2025/06/30 23:59   | (Auto-filled)             |

**2. Settings Sheet**
- **Sheet Name**: `システム設定`
- **Cells**:
    - `B1`: Lock Cell ("ON" or empty)
    - `B2`: Last Operation Time (Auto-updated)

### 2. Script Property Settings

1. Open "Project Settings" -> "Script Properties" in the GAS project.
2. Add the following property:
   - Key: `EXCLUDED_USERS`
   - Value: Comma-separated email addresses (e.g., `admin@example.com,owner@example.com`)

### 3. Enable Cloud Identity Groups API

1. Click "Services" -> "Add a service" in the GAS editor.
2. Search for and add "Cloud Identity Groups API".
3. Set the identifier to `CloudIdentityGroups`.

### 4. Build and Deploy

```shell
# Install dependencies
npm install

# Build TypeScript
npm run build

# Deploy to GAS project
npm run deploy
```

### 5. Trigger Settings

1. Open "Triggers" in the GAS editor.
2. Add a new trigger:
   - Function to run: `onTimeTriggered`
   - Event source: Time-driven
   - Type of time based trigger: Minutes timer
   - Minute interval: Every 5 minutes

## Usage

### Normal Operation

1. Enter the information of the members you want to add to the spreadsheet.
2. The trigger will run automatically to add or remove members.
3. The member name (Membership ID) will be automatically filled in Column E.

### Maintenance Mode

If you want to edit the sheet manually:
1. Enter "ON" in the Lock Cell (B1).
2. Edit the sheet.
3. After editing, clear the Lock Cell.

While the Lock Cell is "ON", the system stops operating and makes no changes.

## File Structure

```
src/
├── types.ts              # Type definitions
├── config.ts             # Configuration loading
├── lockManager.ts        # Lock management
├── sheetService.ts       # Sheet read/write operations
├── groupsApiClient.ts    # Groups API client
├── syncLogic.ts          # Synchronization logic
├── main.ts               # Main processing
├── index.ts              # Entry point
└── @types/
    └── cloud-identity-groups.d.ts  # API type declarations
```

## Customization

### Changing Sheet Structure

You can adjust the following in the `getConfig()` function in `src/config.ts`:
- Sheet names
- Lock cell address
- Last operation time cell address
- Data start row

### Changing Trigger Interval

A 5-minute interval is recommended, but you can change it if necessary. Be mindful of API quotas.

## Troubleshooting

### Check Logs

Check "Executions" or "Logs" in the GAS editor.

### Common Issues

**Q: Members are not being added**
- Check if the group email address is correct.
- Check if the validity period includes the current time.
- Check if the user is not in the excluded users list.

**Q: "Group not found" error**
- Check if the Cloud Identity Groups API is enabled.
- Check if the executing user has management permissions for the group.

**Q: "ScriptLock acquisition timeout" error**
- The previous execution might not have completed.
- Wait for a while and try running it again.
