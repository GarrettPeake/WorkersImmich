import { z } from 'zod';
import { Stack } from 'src/database';
import { AssetResponseDto, mapAsset } from 'src/dtos/asset-response.dto';
import { AuthDto } from 'src/dtos/auth.dto';

// --- Request Schemas ---

export const StackCreateSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(2),
});
export type StackCreateDto = z.infer<typeof StackCreateSchema>;

export const StackSearchSchema = z.object({
  primaryAssetId: z.string().uuid().optional(),
});
export type StackSearchDto = z.infer<typeof StackSearchSchema>;

export const StackUpdateSchema = z.object({
  primaryAssetId: z.string().uuid().optional(),
});
export type StackUpdateDto = z.infer<typeof StackUpdateSchema>;

// --- Response DTOs (plain interfaces) ---

export interface StackResponseDto {
  id: string;
  primaryAssetId: string;
  assets: AssetResponseDto[];
}

// --- Mapper ---

export const mapStack = (stack: Stack, { auth }: { auth?: AuthDto }) => {
  const primary = stack.assets.filter((asset) => asset.id === stack.primaryAssetId);
  const others = stack.assets.filter((asset) => asset.id !== stack.primaryAssetId);

  return {
    id: stack.id,
    primaryAssetId: stack.primaryAssetId,
    assets: [...primary, ...others].map((asset) => mapAsset(asset, { auth })),
  };
};
