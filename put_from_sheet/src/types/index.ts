export type SheetRow = (string | number | boolean)[];

export interface ApiResult {
  success: boolean;
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

export interface SyncResult {
  total: number;
  success: number;
  failed: number;
  logs: string[];
}
