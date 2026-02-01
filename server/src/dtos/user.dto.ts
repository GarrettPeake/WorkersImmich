import { z } from 'zod';
import { User, UserAdmin } from 'src/database';
import { UserAvatarColor, UserMetadataKey, UserStatus } from 'src/enum';
import { UserMetadataItem } from 'src/types';
import { optionalBooleanQuery } from 'src/validation';

// --- Request Schemas ---

export const UserUpdateMeSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()).optional(),
  password: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  avatarColor: z.nativeEnum(UserAvatarColor).nullable().optional(),
});
export type UserUpdateMeDto = z.infer<typeof UserUpdateMeSchema>;

export const UserAdminSearchSchema = z.object({
  withDeleted: optionalBooleanQuery,
  id: z.string().uuid().optional(),
});
export type UserAdminSearchDto = z.infer<typeof UserAdminSearchSchema>;

export const UserAdminCreateSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(1),
  name: z.string().min(1),
  avatarColor: z.nativeEnum(UserAvatarColor).nullable().optional(),
  storageLabel: z.string().nullable().optional().transform((v) => {
    if (typeof v !== 'string') return v;
    return v.replaceAll('.', '').replace(/[^\w\s-]/g, '');
  }),
  quotaSizeInBytes: z.number().int().min(0).nullable().optional(),
  shouldChangePassword: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  notify: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  isAdmin: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
});
export type UserAdminCreateDto = z.infer<typeof UserAdminCreateSchema>;

export const UserAdminUpdateSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()).optional(),
  password: z.string().min(1).optional(),
  pinCode: z.string().regex(/^\d{6}$/, { message: 'Must be a 6-digit numeric string' }).nullable().optional()
    .transform((v) => (v === '' ? null : v)),
  name: z.string().min(1).optional(),
  avatarColor: z.nativeEnum(UserAvatarColor).nullable().optional(),
  storageLabel: z.string().nullable().optional().transform((v) => {
    if (typeof v !== 'string') return v;
    return v.replaceAll('.', '').replace(/[^\w\s-]/g, '');
  }),
  shouldChangePassword: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  quotaSizeInBytes: z.number().int().min(0).nullable().optional(),
  isAdmin: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
});
export type UserAdminUpdateDto = z.infer<typeof UserAdminUpdateSchema>;

export const UserAdminDeleteSchema = z.object({
  force: optionalBooleanQuery,
});
export type UserAdminDeleteDto = z.infer<typeof UserAdminDeleteSchema>;

// --- Response DTOs (plain interfaces) ---

export interface UserResponseDto {
  id: string;
  name: string;
  email: string;
  profileImagePath: string;
  avatarColor: UserAvatarColor;
  profileChangedAt: string | Date;
}

export interface UserLicense {
  licenseKey: string;
  activationKey: string;
  activatedAt: Date;
}

export interface UserAdminResponseDto extends UserResponseDto {
  storageLabel: string | null;
  shouldChangePassword: boolean;
  isAdmin: boolean;
  createdAt: string | Date;
  deletedAt: string | Date | null;
  updatedAt: string | Date;
  oauthId: string;
  quotaSizeInBytes: number | null;
  quotaUsageInBytes: number | null;
  status: string;
  license: UserLicense | null;
}

// --- Mappers ---

const emailToAvatarColor = (email: string): UserAvatarColor => {
  const values = Object.values(UserAvatarColor);
  const randomIndex = Math.floor(
    [...email].map((letter) => letter.codePointAt(0) ?? 0).reduce((a, b) => a + b, 0) % values.length,
  );
  return values[randomIndex];
};

export const mapUser = (entity: User | UserAdmin): UserResponseDto => {
  return {
    id: entity.id,
    email: entity.email,
    name: entity.name,
    profileImagePath: entity.profileImagePath,
    avatarColor: entity.avatarColor ?? emailToAvatarColor(entity.email),
    profileChangedAt: entity.profileChangedAt,
  };
};

export function mapUserAdmin(entity: UserAdmin): UserAdminResponseDto {
  const metadata = entity.metadata || [];
  const license = metadata.find(
    (item): item is UserMetadataItem<UserMetadataKey.License> => item.key === UserMetadataKey.License,
  )?.value;

  return {
    ...mapUser(entity),
    storageLabel: entity.storageLabel,
    shouldChangePassword: entity.shouldChangePassword,
    isAdmin: entity.isAdmin,
    createdAt: entity.createdAt,
    deletedAt: entity.deletedAt,
    updatedAt: entity.updatedAt,
    oauthId: entity.oauthId,
    quotaSizeInBytes: entity.quotaSizeInBytes,
    quotaUsageInBytes: entity.quotaUsageInBytes,
    status: entity.status,
    license: license ? { ...license, activatedAt: new Date(license?.activatedAt) } : null,
  };
}
