import { z } from 'zod';

/** @deprecated Use `BulkIdResponseDto` instead */
export enum AssetIdErrorReason {
  DUPLICATE = 'duplicate',
  NO_PERMISSION = 'no_permission',
  NOT_FOUND = 'not_found',
}

/** @deprecated Use `BulkIdResponseDto` instead */
export interface AssetIdsResponseDto {
  assetId: string;
  success: boolean;
  error?: AssetIdErrorReason;
}

export enum BulkIdErrorReason {
  DUPLICATE = 'duplicate',
  NO_PERMISSION = 'no_permission',
  NOT_FOUND = 'not_found',
  UNKNOWN = 'unknown',
}

export const BulkIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});
export type BulkIdsDto = z.infer<typeof BulkIdsSchema>;

export interface BulkIdResponseDto {
  id: string;
  success: boolean;
  error?: BulkIdErrorReason;
}
