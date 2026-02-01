import { z } from 'zod';

// --- Request Schemas ---

export const DownloadInfoSchema = z.object({
  assetIds: z.array(z.string().uuid()).optional(),
  albumId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  archiveSize: z.coerce.number().int().positive().optional(),
});
export type DownloadInfoDto = z.infer<typeof DownloadInfoSchema>;

// --- Response DTOs (plain interfaces) ---

export interface DownloadArchiveInfo {
  size: number;
  assetIds: string[];
}

export interface DownloadResponseDto {
  totalSize: number;
  archives: DownloadArchiveInfo[];
}
