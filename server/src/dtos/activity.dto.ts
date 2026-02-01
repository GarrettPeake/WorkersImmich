import { z } from 'zod';
import { Activity } from 'src/database';
import { mapUser, UserResponseDto } from 'src/dtos/user.dto';

export enum ReactionType {
  COMMENT = 'comment',
  LIKE = 'like',
}

export enum ReactionLevel {
  ALBUM = 'album',
  ASSET = 'asset',
}

export type MaybeDuplicate<T> = { duplicate: boolean; value: T };

// --- Response DTOs (plain interfaces) ---

export interface ActivityResponseDto {
  id: string;
  createdAt: Date;
  type: ReactionType;
  user: UserResponseDto;
  assetId: string | null;
  comment?: string | null;
}

export interface ActivityStatisticsResponseDto {
  comments: number;
  likes: number;
}

// --- Request Schemas ---

export const ActivityDtoSchema = z.object({
  albumId: z.string().uuid(),
  assetId: z.string().uuid().optional(),
});
export type ActivityDto = z.infer<typeof ActivityDtoSchema>;

export const ActivitySearchSchema = ActivityDtoSchema.extend({
  type: z.nativeEnum(ReactionType).optional(),
  level: z.nativeEnum(ReactionLevel).optional(),
  userId: z.string().uuid().optional(),
});
export type ActivitySearchDto = z.infer<typeof ActivitySearchSchema>;

export const ActivityCreateSchema = ActivityDtoSchema.extend({
  type: z.nativeEnum(ReactionType),
  comment: z.string().min(1).optional(),
}).refine(
  (data) => data.type !== ReactionType.COMMENT || (data.comment !== undefined && data.comment.length > 0),
  { message: 'Comment is required when type is comment', path: ['comment'] },
);
export type ActivityCreateDto = z.infer<typeof ActivityCreateSchema>;

// --- Mapper ---

export const mapActivity = (activity: Activity): ActivityResponseDto => {
  return {
    id: activity.id,
    assetId: activity.assetId,
    createdAt: activity.createdAt,
    comment: activity.comment,
    type: activity.isLiked ? ReactionType.LIKE : ReactionType.COMMENT,
    user: mapUser(activity.user),
  };
};
