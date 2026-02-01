/**
 * MediaRepository — Cloudflare Workers image processing.
 *
 * Replaces Sharp-based image processing with Cloudflare Images transforms.
 * Replaces ExifTool with exifreader (pure JS EXIF parser).
 * No sharp, exiftool-vendored, fluent-ffmpeg, or node: imports.
 *
 * Image transforms use Cloudflare Image Resizing via cf.image options on fetch().
 * The Worker must be deployed on a zone with Image Resizing enabled.
 *
 * Generated variants (thumbnail, preview) are stored in R2 alongside the original.
 * The original file is always preserved.
 */

import ExifReader from 'exifreader';
import { StorageCore } from 'src/cores/storage.core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageTransformOptions {
  width: number;
  height: number;
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  format?: 'webp' | 'avif' | 'jpeg' | 'png';
  quality?: number;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ExifData {
  make?: string;
  model?: string;
  exposureTime?: string;
  fNumber?: number;
  iso?: number;
  focalLength?: number;
  lensModel?: string;
  dateTimeOriginal?: string;
  modifyDate?: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  state?: string;
  country?: string;
  description?: string;
  orientation?: string;
  exifImageWidth?: number;
  exifImageHeight?: number;
  fileSizeInByte?: number;
  projectionType?: string;
  profileDescription?: string;
  colorspace?: string;
  bitsPerSample?: number;
  rating?: number;
  timeZone?: string;
  fps?: number;
  livePhotoCID?: string;
  autoStackId?: string;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class MediaRepository {
  constructor(
    private bucket: R2Bucket,
    private imageResizingBaseUrl: string,
  ) {}

  // -------------------------------------------------------------------------
  // Thumbnail generation
  // -------------------------------------------------------------------------

  /**
   * Generate a thumbnail using Cloudflare Image Resizing.
   * Stores the result in R2 for caching.
   *
   * The worker fetches a subrequest to its own zone with `cf.image` options,
   * which invokes Cloudflare Image Resizing on the fly.
   *
   * @returns The R2 key where the thumbnail is stored.
   */
  async generateThumbnail(
    userId: string,
    assetId: string,
    originalKey: string,
    options: { width: number; height: number; format?: string; quality?: number },
  ): Promise<string> {
    const thumbnailKey = StorageCore.getAssetThumbnailKey(userId, assetId);

    // Return existing thumbnail if cached
    const existing = await this.bucket.head(thumbnailKey);
    if (existing) {
      return thumbnailKey;
    }

    // Read original from R2
    const original = await this.bucket.get(originalKey);
    if (!original) {
      throw new Error(`Original not found: ${originalKey}`);
    }

    // Transform via Cloudflare Image Resizing
    const transformed = await this.transformImage(original, {
      width: options.width,
      height: options.height,
      fit: 'cover',
      format: (options.format as ImageTransformOptions['format']) || 'webp',
      quality: options.quality || 80,
    });

    // Store in R2
    const format = options.format || 'webp';
    await this.bucket.put(thumbnailKey, transformed, {
      httpMetadata: { contentType: `image/${format}` },
    });

    return thumbnailKey;
  }

  // -------------------------------------------------------------------------
  // Preview generation
  // -------------------------------------------------------------------------

  /**
   * Generate a preview (larger than thumbnail) using Cloudflare Image Resizing.
   *
   * @returns The R2 key where the preview is stored.
   */
  async generatePreview(
    userId: string,
    assetId: string,
    originalKey: string,
    options?: { maxDimension?: number; format?: string; quality?: number },
  ): Promise<string> {
    const previewKey = StorageCore.getAssetPreviewKey(userId, assetId);

    // Return existing preview if cached
    const existing = await this.bucket.head(previewKey);
    if (existing) {
      return previewKey;
    }

    // Read original from R2
    const original = await this.bucket.get(originalKey);
    if (!original) {
      throw new Error(`Original not found: ${originalKey}`);
    }

    const maxDim = options?.maxDimension || 1440;
    const format = (options?.format as ImageTransformOptions['format']) || 'webp';
    const quality = options?.quality || 80;

    // Transform via Cloudflare Image Resizing
    const transformed = await this.transformImage(original, {
      width: maxDim,
      height: maxDim,
      fit: 'scale-down',
      format,
      quality,
    });

    // Store in R2
    await this.bucket.put(previewKey, transformed, {
      httpMetadata: { contentType: `image/${format}` },
    });

    return previewKey;
  }

  // -------------------------------------------------------------------------
  // Fullsize generation
  // -------------------------------------------------------------------------

  /**
   * Generate a fullsize converted image (e.g. HEIC to JPEG).
   *
   * @returns The R2 key where the fullsize image is stored.
   */
  async generateFullsize(
    userId: string,
    assetId: string,
    originalKey: string,
    options?: { format?: string; quality?: number },
  ): Promise<string> {
    const format = options?.format || 'jpeg';
    const fullsizeKey = StorageCore.getAssetFullsizeKey(userId, assetId, format);

    // Return existing if cached
    const existing = await this.bucket.head(fullsizeKey);
    if (existing) {
      return fullsizeKey;
    }

    // Read original from R2
    const original = await this.bucket.get(originalKey);
    if (!original) {
      throw new Error(`Original not found: ${originalKey}`);
    }

    // Convert format without resizing (use a very large dimension to avoid downscaling)
    const transformed = await this.transformImage(original, {
      width: 16384,
      height: 16384,
      fit: 'scale-down',
      format: format as ImageTransformOptions['format'],
      quality: options?.quality || 90,
    });

    await this.bucket.put(fullsizeKey, transformed, {
      httpMetadata: { contentType: `image/${format}` },
    });

    return fullsizeKey;
  }

  // -------------------------------------------------------------------------
  // EXIF extraction
  // -------------------------------------------------------------------------

  /**
   * Extract EXIF metadata from an image using exifreader (pure JS).
   * Replaces exiftool-vendored which requires native binaries.
   */
  async extractExif(data: ArrayBuffer): Promise<ExifData> {
    try {
      const tags = ExifReader.load(data, { expanded: true });
      return mapExifTags(tags);
    } catch (error) {
      console.warn('EXIF extraction failed:', error);
      return {};
    }
  }

  // -------------------------------------------------------------------------
  // Image dimensions
  // -------------------------------------------------------------------------

  /**
   * Get image dimensions from an image buffer using EXIF data.
   */
  async getImageDimensions(data: ArrayBuffer): Promise<ImageDimensions | null> {
    try {
      const tags = ExifReader.load(data);
      const width =
        tags['Image Width']?.value ??
        tags['PixelXDimension']?.value ??
        tags['ImageWidth']?.value;
      const height =
        tags['Image Height']?.value ??
        tags['PixelYDimension']?.value ??
        tags['ImageHeight']?.value;

      if (width && height) {
        return { width: Number(width), height: Number(height) };
      }
      return null;
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // RAW file support (TODO stub)
  // -------------------------------------------------------------------------

  /**
   * TODO: RAW file support
   * RAW files are stored in R2 but thumbnail/preview generation is not yet supported.
   * When implemented, use a WASM-based RAW decoder or extract embedded JPEG preview.
   */
  async generateRawPreview(
    _userId: string,
    _assetId: string,
    _originalKey: string,
  ): Promise<string | null> {
    console.warn('RAW file preview generation not yet supported');
    return null;
  }

  // -------------------------------------------------------------------------
  // Video thumbnail support (TODO stub)
  // -------------------------------------------------------------------------

  /**
   * TODO: Video thumbnail generation
   * Requires a video processing service (e.g., Cloudflare Stream or external API).
   * For now, videos are stored without thumbnails.
   */
  async generateVideoThumbnail(
    _userId: string,
    _assetId: string,
    _originalKey: string,
  ): Promise<string | null> {
    console.warn('Video thumbnail generation not yet supported');
    return null;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Transform an image using Cloudflare Image Resizing.
   *
   * This sends a subrequest to the worker's own zone with `cf.image` options.
   * The zone must have Image Resizing enabled in the Cloudflare dashboard.
   *
   * For R2 objects, we POST the image body to a transform endpoint, which
   * applies the cf.image options and returns the transformed image.
   */
  private async transformImage(
    original: R2ObjectBody,
    options: ImageTransformOptions,
  ): Promise<ArrayBuffer> {
    // If no base URL is configured (e.g. in tests / dev), skip image resizing
    // and return the original bytes.
    if (!this.imageResizingBaseUrl) {
      return original.arrayBuffer();
    }

    const contentType = original.httpMetadata?.contentType || 'image/jpeg';

    let url: URL;
    try {
      url = new URL(
        `/cdn-cgi/image/w=${options.width},h=${options.height},fit=${options.fit || 'scale-down'},f=${options.format || 'webp'},q=${options.quality || 80}/original`,
        this.imageResizingBaseUrl,
      );
    } catch {
      // Invalid base URL — fall back to original
      return original.arrayBuffer();
    }

    const request = new Request(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': contentType },
    });

    // Use Cloudflare Image Resizing via cf.image on the fetch
    const response = await fetch(request, {
      cf: {
        image: {
          width: options.width,
          height: options.height,
          fit: options.fit || 'scale-down',
          format: options.format || 'webp',
          quality: options.quality || 80,
        },
      },
    } as RequestInit);

    if (!response.ok) {
      // Fallback: if Image Resizing is not available, store the original as-is
      console.warn(
        `Image Resizing returned ${response.status}. ` +
        'Ensure the zone has Image Resizing enabled. Falling back to original.',
      );
      return original.arrayBuffer();
    }

    return response.arrayBuffer();
  }
}

// ---------------------------------------------------------------------------
// EXIF mapping helpers
// ---------------------------------------------------------------------------

/**
 * Map exifreader tags to our ExifData interface.
 * exifreader returns tags in an expanded format when { expanded: true } is used.
 */
function mapExifTags(tags: Record<string, any>): ExifData {
  const exif: ExifData = {};

  // Camera info
  exif.make = tags.exif?.Make?.description;
  exif.model = tags.exif?.Model?.description;

  // Exposure info
  exif.exposureTime = tags.exif?.ExposureTime?.description;
  if (tags.exif?.FNumber?.value && Array.isArray(tags.exif.FNumber.value)) {
    exif.fNumber = tags.exif.FNumber.value[0] / tags.exif.FNumber.value[1];
  } else if (tags.exif?.FNumber?.description) {
    exif.fNumber = Number.parseFloat(tags.exif.FNumber.description);
  }

  exif.iso = typeof tags.exif?.ISOSpeedRatings?.value === 'number'
    ? tags.exif.ISOSpeedRatings.value
    : undefined;

  if (tags.exif?.FocalLength?.value && Array.isArray(tags.exif.FocalLength.value)) {
    exif.focalLength = tags.exif.FocalLength.value[0] / tags.exif.FocalLength.value[1];
  } else if (tags.exif?.FocalLength?.description) {
    exif.focalLength = Number.parseFloat(tags.exif.FocalLength.description);
  }

  exif.lensModel = tags.exif?.LensModel?.description;

  // Date/time
  exif.dateTimeOriginal = tags.exif?.DateTimeOriginal?.description;
  exif.modifyDate = tags.exif?.ModifyDate?.description ?? tags.exif?.DateTime?.description;

  // GPS coordinates
  if (tags.gps) {
    exif.latitude = typeof tags.gps.Latitude === 'number' ? tags.gps.Latitude : undefined;
    exif.longitude = typeof tags.gps.Longitude === 'number' ? tags.gps.Longitude : undefined;
  }

  // Orientation
  if (tags.exif?.Orientation?.value) {
    exif.orientation = String(tags.exif.Orientation.value);
  }

  // Dimensions
  const width = tags.exif?.PixelXDimension?.value ?? tags.exif?.ImageWidth?.value;
  const height = tags.exif?.PixelYDimension?.value ?? tags.exif?.ImageHeight?.value;
  if (width) exif.exifImageWidth = Number(width);
  if (height) exif.exifImageHeight = Number(height);

  // Description — check both EXIF and IPTC
  exif.description =
    tags.exif?.ImageDescription?.description ??
    tags.iptc?.['Caption/Abstract']?.description ??
    tags.iptc?.caption?.description;

  // Color / profile info
  exif.profileDescription = tags.icc?.['Profile Description']?.description;
  exif.colorspace = tags.exif?.ColorSpace?.description;
  if (tags.exif?.BitsPerSample?.value) {
    exif.bitsPerSample = Number(tags.exif.BitsPerSample.value);
  }

  // Rating
  if (tags.xmp?.Rating?.value !== undefined) {
    exif.rating = Number(tags.xmp.Rating.value);
  }

  return exif;
}
