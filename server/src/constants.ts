/**
 * Server version — updated via build process.
 * This replaces the previous readFileSync(package.json) approach
 * which is not compatible with Cloudflare Workers.
 */
export const SERVER_VERSION = '2.5.2';

export const SALT_ROUNDS = 10;

export const MOBILE_REDIRECT = 'app.immich:///oauth-callback';
export const LOGIN_URL = '/auth/login?autoLaunch=0';

export const FACE_THUMBNAIL_SIZE = 250;

export const JOBS_ASSET_PAGINATION_SIZE = 1000;

export const AUDIT_LOG_MAX_DURATION_DAYS = 100;
export const ONE_HOUR_MS = 3_600_000;

/**
 * Supported image MIME types for upload validation.
 */
export const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/tiff',
  'image/bmp',
  'image/svg+xml',
  'image/jxl',
  'image/jp2',
  // RAW formats
  'image/x-canon-cr2',
  'image/x-canon-cr3',
  'image/x-nikon-nef',
  'image/x-sony-arw',
  'image/x-fuji-raf',
  'image/x-adobe-dng',
  'image/x-panasonic-rw2',
  'image/x-olympus-orf',
  'image/x-pentax-pef',
  'image/x-samsung-srw',
  'image/x-sigma-x3f',
  'image/x-hasselblad-3fr',
  'image/x-hasselblad-fff',
  'image/x-leica-rwl',
  'image/x-phaseone-iiq',
  'image/x-kodak-dcr',
  'image/x-kodak-k25',
  'image/x-kodak-kdc',
  'image/x-minolta-mrw',
  'image/x-epson-erf',
  'image/x-sony-sr2',
  'image/x-sony-srf',
]);

/**
 * Supported video MIME types for upload validation.
 */
export const SUPPORTED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm',
  'video/3gpp',
  'video/mpeg',
  'video/mp2t',
  'video/x-m4v',
  'video/x-flv',
  'video/x-ms-wmv',
]);

/**
 * Cookie names used throughout the application.
 */
export const COOKIE_NAMES = {
  ACCESS_TOKEN: 'immich_access_token',
  AUTH_TYPE: 'immich_auth_type',
  IS_AUTHENTICATED: 'immich_is_authenticated',
  SHARED_LINK_TOKEN: 'immich_shared_link_token',
} as const;

/**
 * Paths excluded from general middleware processing.
 */
export const excludePaths = ['/.well-known/immich', '/custom.css', '/favicon.ico'];
