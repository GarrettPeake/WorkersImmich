/**
 * StorageCore — R2 key generation and path utilities.
 *
 * R2 key structure:
 *   assets/{userId}/{assetId}/original.{ext}
 *   assets/{userId}/{assetId}/preview.webp
 *   assets/{userId}/{assetId}/thumbnail.webp
 *   assets/{userId}/{assetId}/fullsize.{format}
 *   assets/{userId}/{assetId}/sidecar.xmp
 *   profiles/{userId}/{filename}
 *
 * No node:path, node:crypto, or filesystem imports.
 * All keys use forward slashes (platform-independent).
 */

export class StorageCore {
  static getAssetOriginalKey(userId: string, assetId: string, ext: string): string {
    return `assets/${userId}/${assetId}/original${ext}`;
  }

  static getAssetPreviewKey(userId: string, assetId: string): string {
    return `assets/${userId}/${assetId}/preview.webp`;
  }

  static getAssetThumbnailKey(userId: string, assetId: string): string {
    return `assets/${userId}/${assetId}/thumbnail.webp`;
  }

  static getAssetFullsizeKey(userId: string, assetId: string, format: string): string {
    return `assets/${userId}/${assetId}/fullsize.${format}`;
  }

  static getAssetSidecarKey(userId: string, assetId: string): string {
    return `assets/${userId}/${assetId}/sidecar.xmp`;
  }

  static getProfileImageKey(userId: string, filename: string): string {
    return `profiles/${userId}/${filename}`;
  }

  /**
   * Extract the asset ID from an R2 key.
   */
  static getAssetIdFromKey(key: string): string | null {
    const match = key.match(/^assets\/[^/]+\/([^/]+)\//);
    return match ? match[1] : null;
  }

  /**
   * Get the prefix for all files belonging to an asset.
   */
  static getAssetPrefix(userId: string, assetId: string): string {
    return `assets/${userId}/${assetId}/`;
  }

  /**
   * Get the prefix for all files belonging to a user.
   */
  static getUserPrefix(userId: string): string {
    return `assets/${userId}/`;
  }
}
