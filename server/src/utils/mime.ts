/**
 * Workers-compatible MIME type utilities.
 * Provides basic MIME type detection from file extensions.
 *
 * NOTE: The codebase also has a more comprehensive `mime-types.ts` utility
 * that handles Immich-specific asset type classification. This module provides
 * a simpler lookup for general-purpose MIME type detection.
 */

const MIME_MAP: Record<string, string> = {
  // Images - web
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.jxl': 'image/jxl',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.webp': 'image/webp',
  // Images - RAW
  '.arw': 'image/x-sony-arw',
  '.cr2': 'image/x-canon-cr2',
  '.cr3': 'image/x-canon-cr3',
  '.dng': 'image/x-adobe-dng',
  '.nef': 'image/x-nikon-nef',
  '.orf': 'image/x-olympus-orf',
  '.pef': 'image/x-pentax-pef',
  '.raf': 'image/x-fuji-raf',
  '.raw': 'image/x-raw',
  '.rw2': 'image/x-panasonic-rw2',
  '.srw': 'image/x-samsung-srw',
  // Video
  '.3gp': 'video/3gpp',
  '.avi': 'video/x-msvideo',
  '.flv': 'video/x-flv',
  '.m4v': 'video/x-m4v',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.mts': 'video/mp2t',
  '.webm': 'video/webm',
  '.wmv': 'video/x-ms-wmv',
  // Audio
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.wma': 'audio/x-ms-wma',
  // Documents
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.xmp': 'application/xml',
};

export function getMimeType(filename: string): string {
  const ext = '.' + filename.toLowerCase().split('.').pop();
  return MIME_MAP[ext] || 'application/octet-stream';
}

export function isImageMimeType(mime: string): boolean {
  return mime.startsWith('image/');
}

export function isVideoMimeType(mime: string): boolean {
  return mime.startsWith('video/');
}

export function getExtensionForMimeType(mimeType: string): string | undefined {
  for (const [ext, mime] of Object.entries(MIME_MAP)) {
    if (mime === mimeType) {
      return ext;
    }
  }
  return undefined;
}
