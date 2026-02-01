import { z } from 'zod';
import { AssetOrder, UserAvatarColor } from 'src/enum';
import { UserPreferences } from 'src/types';
import { optionalBooleanQuery } from 'src/validation';

// --- Nested Update Schemas ---

const AvatarUpdateSchema = z.object({
  color: z.nativeEnum(UserAvatarColor).optional(),
});

const MemoriesUpdateSchema = z.object({
  enabled: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  duration: z.number().int().positive().optional(),
});

const RatingsUpdateSchema = z.object({
  enabled: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
});

const AlbumsUpdateSchema = z.object({
  defaultAssetOrder: z.nativeEnum(AssetOrder).optional(),
});

const FoldersUpdateSchema = z.object({
  enabled: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  sidebarWeb: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
});

const PeopleUpdateSchema = z.object({
  enabled: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  sidebarWeb: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
});

const SharedLinksUpdateSchema = z.object({
  enabled: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  sidebarWeb: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
});

const TagsUpdateSchema = z.object({
  enabled: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  sidebarWeb: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
});

const EmailNotificationsUpdateSchema = z.object({
  enabled: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  albumInvite: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  albumUpdate: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
});

const DownloadUpdateSchema = z.object({
  archiveSize: z.number().int().positive().optional(),
  includeEmbeddedVideos: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
});

const PurchaseUpdateSchema = z.object({
  showSupportBadge: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  hideBuyButtonUntil: z.string().datetime().optional(),
});

const CastUpdateSchema = z.object({
  gCastEnabled: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
});

// --- Main Update Schema ---

export const UserPreferencesUpdateSchema = z.object({
  albums: AlbumsUpdateSchema.optional(),
  folders: FoldersUpdateSchema.optional(),
  memories: MemoriesUpdateSchema.optional(),
  people: PeopleUpdateSchema.optional(),
  ratings: RatingsUpdateSchema.optional(),
  sharedLinks: SharedLinksUpdateSchema.optional(),
  tags: TagsUpdateSchema.optional(),
  avatar: AvatarUpdateSchema.optional(),
  emailNotifications: EmailNotificationsUpdateSchema.optional(),
  download: DownloadUpdateSchema.optional(),
  purchase: PurchaseUpdateSchema.optional(),
  cast: CastUpdateSchema.optional(),
});
export type UserPreferencesUpdateDto = z.infer<typeof UserPreferencesUpdateSchema>;

// --- Response DTOs (plain interfaces) ---

export interface UserPreferencesResponseDto {
  albums: { defaultAssetOrder: AssetOrder };
  folders: { enabled: boolean; sidebarWeb: boolean };
  memories: { enabled: boolean; duration: number };
  people: { enabled: boolean; sidebarWeb: boolean };
  ratings: { enabled: boolean };
  sharedLinks: { enabled: boolean; sidebarWeb: boolean };
  tags: { enabled: boolean; sidebarWeb: boolean };
  emailNotifications: { enabled: boolean; albumInvite: boolean; albumUpdate: boolean };
  download: { archiveSize: number; includeEmbeddedVideos: boolean };
  purchase: { showSupportBadge: boolean; hideBuyButtonUntil: string };
  cast: { gCastEnabled: boolean };
}

// --- Mapper ---

export const mapPreferences = (preferences: UserPreferences): UserPreferencesResponseDto => {
  return preferences;
};
