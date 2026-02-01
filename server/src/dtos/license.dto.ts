import { z } from 'zod';

// --- Request Schemas ---

export const LicenseKeySchema = z.object({
  licenseKey: z.string().min(1).regex(/IM(SV|CL)(-[\dA-Za-z]{4}){8}/),
  activationKey: z.string().min(1),
});
export type LicenseKeyDto = z.infer<typeof LicenseKeySchema>;

// --- Response DTOs (plain interfaces) ---

export interface LicenseResponseDto {
  licenseKey: string;
  activationKey: string;
  activatedAt: Date;
}
