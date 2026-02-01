import { z } from 'zod';
import type { Session } from 'src/database';

// --- Request Schemas ---

export const SessionCreateSchema = z.object({
  duration: z.number().int().positive().optional(),
  deviceType: z.string().optional(),
  deviceOS: z.string().optional(),
});
export type SessionCreateDto = z.infer<typeof SessionCreateSchema>;

export const SessionUpdateSchema = z.object({
  isPendingSyncReset: z.literal(true).optional(),
});
export type SessionUpdateDto = z.infer<typeof SessionUpdateSchema>;

// --- Response DTOs (plain interfaces) ---

export interface SessionResponseDto {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  current: boolean;
  deviceType: string;
  deviceOS: string;
  appVersion: string | null;
  isPendingSyncReset: boolean;
}

export interface SessionCreateResponseDto extends SessionResponseDto {
  token: string;
}

// --- Mapper ---

export const mapSession = (entity: Session, currentId?: string): SessionResponseDto => ({
  id: entity.id,
  createdAt: entity.createdAt,   // Already ISO 8601 string in D1
  updatedAt: entity.updatedAt,
  expiresAt: entity.expiresAt ?? undefined,
  current: currentId === entity.id,
  appVersion: entity.appVersion,
  deviceOS: entity.deviceOS,
  deviceType: entity.deviceType,
  isPendingSyncReset: entity.isPendingSyncReset,
});
