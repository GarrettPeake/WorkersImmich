import { z } from 'zod';
import { coerceBoolean } from 'src/validation';

// --- Request Schemas ---

export const OnboardingSchema = z.object({
  isOnboarded: coerceBoolean,
});
export type OnboardingDto = z.infer<typeof OnboardingSchema>;

// --- Response DTO ---

export interface OnboardingResponseDto {
  isOnboarded: boolean;
}
