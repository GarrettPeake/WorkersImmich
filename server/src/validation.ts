import { z } from 'zod';

export const UUIDParamSchema = z.object({
  id: z.string().uuid(),
});
export type UUIDParamDto = z.infer<typeof UUIDParamSchema>;

export const UUIDAssetIDParamSchema = z.object({
  id: z.string().uuid(),
  assetId: z.string().uuid(),
});
export type UUIDAssetIDParamDto = z.infer<typeof UUIDAssetIDParamSchema>;

export const FilenameParamSchema = z.object({
  filename: z.string().min(1).regex(/^[a-zA-Z0-9_\-.]+$/, {
    message: 'Filename contains invalid characters',
  }),
});
export type FilenameParamDto = z.infer<typeof FilenameParamSchema>;

export const BulkIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});
export type BulkIdsDto = z.infer<typeof BulkIdsSchema>;

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(1000).default(250),
});
export type PaginationDto = z.infer<typeof PaginationSchema>;

export const PinCodeSchema = z.string().min(1).regex(/^\d{6}$/, {
  message: 'Must be a 6-digit numeric string',
});

/**
 * Helper to coerce string query params to booleans.
 * Accepts 'true'/'false' strings or actual booleans.
 */
export const coerceBoolean = z.preprocess((val) => {
  if (val === 'true' || val === true) return true;
  if (val === 'false' || val === false) return false;
  return val;
}, z.boolean());

/**
 * Optional coerced boolean for query parameters.
 */
export const optionalBooleanQuery = z.preprocess((val) => {
  if (val === undefined || val === null || val === '') return undefined;
  if (val === 'true' || val === true) return true;
  if (val === 'false' || val === false) return false;
  return val;
}, z.boolean().optional());

/** Transform email to lowercase */
export const emailTransform = z.string().email().transform((v) => v.toLowerCase());

/** Sanitize a filename (remove dots and invalid chars) */
export const sanitizedString = z.string().transform((v) => {
  const input = typeof v === 'string' ? v : '';
  return input.replaceAll('.', '').replace(/[^\w\s-]/g, '');
});

/** Validate hex color, auto-prefix '#' if missing */
export const hexColor = z.string().regex(/^#?[\dA-Fa-f]{6}$/).transform((v) =>
  v.startsWith('#') ? v : `#${v}`,
);

export const isValidInteger = (value: number, options: { min?: number; max?: number }): value is number => {
  const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = options;
  return Number.isInteger(value) && value >= min && value <= max;
};
