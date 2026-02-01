import { z } from 'zod';
import { AuthApiKey, AuthSession, AuthSharedLink, AuthUser, UserAdmin } from 'src/database';
import { ImmichCookie, UserMetadataKey } from 'src/enum';
import { UserMetadataItem } from 'src/types';
import { PinCodeSchema } from 'src/validation';

export type CookieResponse = {
  isSecure: boolean;
  values: Array<{ key: ImmichCookie; value: string | null }>;
};

export interface AuthDto {
  user: AuthUser;
  apiKey?: AuthApiKey;
  sharedLink?: AuthSharedLink;
  session?: AuthSession;
}

// --- Request Schemas ---

export const LoginCredentialSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(1),
});
export type LoginCredentialDto = z.infer<typeof LoginCredentialSchema>;

export const SignUpSchema = LoginCredentialSchema.extend({
  name: z.string().min(1),
});
export type SignUpDto = z.infer<typeof SignUpSchema>;

export const ChangePasswordSchema = z.object({
  password: z.string().min(1),
  newPassword: z.string().min(8),
  invalidateSessions: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
});
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;

export const PinCodeSetupSchema = z.object({
  pinCode: PinCodeSchema,
});
export type PinCodeSetupDto = z.infer<typeof PinCodeSetupSchema>;

export const PinCodeResetSchema = z.object({
  pinCode: PinCodeSchema.optional(),
  password: z.string().min(1).optional(),
});
export type PinCodeResetDto = z.infer<typeof PinCodeResetSchema>;

export const SessionUnlockSchema = PinCodeResetSchema;
export type SessionUnlockDto = z.infer<typeof SessionUnlockSchema>;

export const PinCodeChangeSchema = PinCodeResetSchema.extend({
  newPinCode: PinCodeSchema,
});
export type PinCodeChangeDto = z.infer<typeof PinCodeChangeSchema>;

export const OAuthCallbackSchema = z.object({
  url: z.string().min(1),
  state: z.string().optional(),
  codeVerifier: z.string().optional(),
});
export type OAuthCallbackDto = z.infer<typeof OAuthCallbackSchema>;

export const OAuthConfigSchema = z.object({
  redirectUri: z.string().min(1),
  state: z.string().optional(),
  codeChallenge: z.string().optional(),
});
export type OAuthConfigDto = z.infer<typeof OAuthConfigSchema>;

// --- Response DTOs (plain interfaces) ---

export interface LoginResponseDto {
  accessToken: string;
  userId: string;
  userEmail: string;
  name: string;
  profileImagePath: string;
  isAdmin: boolean;
  shouldChangePassword: boolean;
  isOnboarded: boolean;
}

export function mapLoginResponse(entity: UserAdmin, accessToken: string): LoginResponseDto {
  const onboardingMetadata = entity.metadata.find(
    (item): item is UserMetadataItem<UserMetadataKey.Onboarding> => item.key === UserMetadataKey.Onboarding,
  )?.value;

  return {
    accessToken,
    userId: entity.id,
    userEmail: entity.email,
    name: entity.name,
    isAdmin: entity.isAdmin,
    profileImagePath: entity.profileImagePath,
    shouldChangePassword: entity.shouldChangePassword,
    isOnboarded: onboardingMetadata?.isOnboarded ?? false,
  };
}

export interface LogoutResponseDto {
  successful: boolean;
  redirectUri: string;
}

export interface ValidateAccessTokenResponseDto {
  authStatus: boolean;
}

export interface OAuthAuthorizeResponseDto {
  url: string;
}

export interface AuthStatusResponseDto {
  pinCode: boolean;
  password: boolean;
  isElevated: boolean;
  expiresAt?: string;
  pinExpiresAt?: string;
}
