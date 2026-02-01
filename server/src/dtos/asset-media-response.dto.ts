export enum AssetMediaStatus {
  CREATED = 'created',
  REPLACED = 'replaced',
  DUPLICATE = 'duplicate',
}

export interface AssetMediaResponseDto {
  status: AssetMediaStatus;
  id: string;
}

export enum AssetUploadAction {
  ACCEPT = 'accept',
  REJECT = 'reject',
}

export enum AssetRejectReason {
  DUPLICATE = 'duplicate',
  UNSUPPORTED_FORMAT = 'unsupported-format',
}

export interface AssetBulkUploadCheckResult {
  id: string;
  action: AssetUploadAction;
  reason?: AssetRejectReason;
  assetId?: string;
  isTrashed?: boolean;
}

export interface AssetBulkUploadCheckResponseDto {
  results: AssetBulkUploadCheckResult[];
}

export interface CheckExistingAssetsResponseDto {
  existingIds: string[];
}
