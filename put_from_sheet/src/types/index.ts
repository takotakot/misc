export type SheetRow = (string | number | boolean)[];

export interface ApiResult {
  success: boolean;
  message: string;
  data?: any;
}
