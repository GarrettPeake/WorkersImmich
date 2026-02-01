import { z } from 'zod';
import { Memory } from 'src/database';
import { AssetResponseDto, mapAsset } from 'src/dtos/asset-response.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { AssetOrderWithRandom, MemoryType } from 'src/enum';
import { optionalBooleanQuery } from 'src/validation';

// --- Nested Schemas ---

const OnThisDaySchema = z.object({
  year: z.number().int().positive(),
});

type MemoryData = z.infer<typeof OnThisDaySchema>;

// --- Request Schemas ---

const MemoryBaseSchema = z.object({
  isSaved: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  seenAt: z.coerce.date().optional(),
});

export const MemorySearchSchema = z.object({
  type: z.nativeEnum(MemoryType).optional(),
  for: z.coerce.date().optional(),
  isTrashed: optionalBooleanQuery,
  isSaved: optionalBooleanQuery,
  size: z.coerce.number().int().positive().optional(),
  order: z.nativeEnum(AssetOrderWithRandom).optional(),
});
export type MemorySearchDto = z.infer<typeof MemorySearchSchema>;

export const MemoryUpdateSchema = MemoryBaseSchema.extend({
  memoryAt: z.coerce.date().optional(),
});
export type MemoryUpdateDto = z.infer<typeof MemoryUpdateSchema>;

export const MemoryCreateSchema = MemoryBaseSchema.extend({
  type: z.nativeEnum(MemoryType),
  data: OnThisDaySchema,
  memoryAt: z.coerce.date(),
  assetIds: z.array(z.string().uuid()).optional(),
});
export type MemoryCreateDto = z.infer<typeof MemoryCreateSchema>;

// --- Response DTOs (plain interfaces) ---

export interface MemoryStatisticsResponseDto {
  total: number;
}

export interface MemoryResponseDto {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  memoryAt: Date;
  seenAt?: Date;
  showAt?: Date;
  hideAt?: Date;
  ownerId: string;
  type: MemoryType;
  data: MemoryData;
  isSaved: boolean;
  assets: AssetResponseDto[];
}

// --- Mapper ---

export const mapMemory = (entity: Memory, auth: AuthDto): MemoryResponseDto => {
  return {
    id: entity.id,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    deletedAt: entity.deletedAt ?? undefined,
    memoryAt: entity.memoryAt,
    seenAt: entity.seenAt ?? undefined,
    showAt: entity.showAt ?? undefined,
    hideAt: entity.hideAt ?? undefined,
    ownerId: entity.ownerId,
    type: entity.type as MemoryType,
    data: entity.data as unknown as MemoryData,
    isSaved: entity.isSaved,
    assets: ('assets' in entity ? entity.assets : []).map((asset) => mapAsset(asset, { auth })),
  };
};
