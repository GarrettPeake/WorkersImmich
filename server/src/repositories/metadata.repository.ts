/**
 * MetadataRepository — Pure-JS EXIF extraction for Cloudflare Workers.
 *
 * Replaces exiftool-vendored (which requires native Perl binaries) with
 * exifreader, a pure JavaScript EXIF/IPTC/XMP parser that runs in any
 * JavaScript runtime including Cloudflare Workers.
 *
 * No exiftool-vendored, node:, or native binary imports.
 */

import ExifReader from 'exifreader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  orientation?: number;
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

/**
 * Simplified ImmichTags interface for Workers.
 * Mirrors a subset of the fields from the original exiftool-vendored Tags
 * that are actually used by Immich services.
 */
export interface ImmichTags {
  // Camera
  Make?: string;
  Model?: string;
  LensModel?: string;

  // Exposure
  ExposureTime?: string | number;
  FNumber?: number;
  FocalLength?: number;
  ISO?: number | number[];

  // Dates
  DateTimeOriginal?: string;
  CreateDate?: string;
  ModifyDate?: string;
  TimeZone?: string;
  tz?: string;
  OffsetTimeOriginal?: string;

  // GPS
  GPSLatitude?: number;
  GPSLongitude?: number;
  latitude?: number;
  longitude?: number;

  // Dimensions
  ExifImageWidth?: number;
  ExifImageHeight?: number;
  ImageWidth?: number;
  ImageHeight?: number;

  // Orientation
  Orientation?: number;

  // Description
  Description?: string | number;
  ImageDescription?: string | number;

  // Color
  ProfileDescription?: string;
  ColorSpace?: string | number;
  BitsPerSample?: number;

  // Video
  Duration?: number | string;

  // Misc
  Rating?: number;
  ContentIdentifier?: string;
  MediaGroupUUID?: string;
  ProjectionType?: string;
  MotionPhoto?: number;
  MotionPhotoVersion?: number;
  MotionPhotoPresentationTimestampUs?: number;

  // Tags
  TagsList?: (string | number)[];
  HierarchicalSubject?: (string | number)[];
  Keywords?: string | number | (string | number)[];

  // Face regions
  RegionInfo?: {
    AppliedToDimensions: {
      W: number;
      H: number;
      Unit: string;
    };
    RegionList: {
      Area: {
        X: number;
        Y: number;
        W: number;
        H: number;
        Unit: string;
      };
      Rotation?: number;
      Type?: string;
      Name?: string;
    }[];
  };

  // Embedded video
  EmbeddedVideoType?: string;
  EmbeddedVideoFile?: unknown;
  MotionPhotoVideo?: unknown;

  // Device (Samsung etc.)
  Device?: {
    Manufacturer?: string;
    ModelName?: string;
  };
  AndroidMake?: string;
  AndroidModel?: string;

  // Allow additional string-keyed properties
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class MetadataRepository {
  /**
   * Extract EXIF data from an image buffer using exifreader (pure JS).
   * Replaces exiftool-vendored which requires native binaries.
   */
  async extractExif(data: ArrayBuffer): Promise<ExifData> {
    try {
      const tags = ExifReader.load(data, { expanded: true });
      return this.mapExifTags(tags);
    } catch (error) {
      console.warn('EXIF extraction failed:', error);
      return {};
    }
  }

  /**
   * Read tags from an image buffer and return them in the ImmichTags format.
   * This is the Workers replacement for exiftool.read(path).
   *
   * Unlike the original which reads from a file path, this takes a buffer
   * since Workers access files via R2 (not the local filesystem).
   */
  async readTags(data: ArrayBuffer): Promise<ImmichTags> {
    try {
      const tags = ExifReader.load(data, { expanded: true });
      return this.mapToImmichTags(tags);
    } catch (error) {
      console.warn('Tag reading failed:', error);
      return {};
    }
  }

  /**
   * Write EXIF tags is not supported in the Workers environment.
   * exifreader is read-only. If EXIF writing is needed in the future,
   * consider a WASM-based solution or an external service.
   */
  async writeTags(_data: ArrayBuffer, _tags: Partial<ImmichTags>): Promise<void> {
    console.warn('EXIF writing is not supported in the Workers environment');
  }

  /**
   * Extract a binary tag (e.g., embedded JPEG from RAW) is not yet supported.
   * The original used exiftool.extractBinaryTagToBuffer().
   */
  async extractBinaryTag(_data: ArrayBuffer, _tagName: string): Promise<ArrayBuffer | null> {
    console.warn('Binary tag extraction not yet supported in Workers environment');
    return null;
  }

  // -------------------------------------------------------------------------
  // Private mapping methods
  // -------------------------------------------------------------------------

  private mapExifTags(tags: Record<string, any>): ExifData {
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
      exif.orientation = Number(tags.exif.Orientation.value);
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

  /**
   * Map exifreader expanded tags to the ImmichTags format used throughout
   * the Immich codebase. This provides compatibility with existing services
   * that expect the exiftool-vendored tag names.
   */
  private mapToImmichTags(tags: Record<string, any>): ImmichTags {
    const result: ImmichTags = {};

    // Camera
    result.Make = tags.exif?.Make?.description;
    result.Model = tags.exif?.Model?.description;
    result.LensModel = tags.exif?.LensModel?.description;

    // Exposure
    result.ExposureTime = tags.exif?.ExposureTime?.description;
    if (tags.exif?.FNumber?.value && Array.isArray(tags.exif.FNumber.value)) {
      result.FNumber = tags.exif.FNumber.value[0] / tags.exif.FNumber.value[1];
    } else if (tags.exif?.FNumber?.description) {
      result.FNumber = Number.parseFloat(tags.exif.FNumber.description);
    }
    if (tags.exif?.FocalLength?.value && Array.isArray(tags.exif.FocalLength.value)) {
      result.FocalLength = tags.exif.FocalLength.value[0] / tags.exif.FocalLength.value[1];
    } else if (tags.exif?.FocalLength?.description) {
      result.FocalLength = Number.parseFloat(tags.exif.FocalLength.description);
    }
    result.ISO = typeof tags.exif?.ISOSpeedRatings?.value === 'number'
      ? tags.exif.ISOSpeedRatings.value
      : undefined;

    // Dates
    result.DateTimeOriginal = tags.exif?.DateTimeOriginal?.description;
    result.CreateDate = tags.exif?.CreateDate?.description;
    result.ModifyDate = tags.exif?.ModifyDate?.description ?? tags.exif?.DateTime?.description;
    result.OffsetTimeOriginal = tags.exif?.OffsetTimeOriginal?.description;

    // GPS
    if (tags.gps) {
      result.GPSLatitude = typeof tags.gps.Latitude === 'number' ? tags.gps.Latitude : undefined;
      result.GPSLongitude = typeof tags.gps.Longitude === 'number' ? tags.gps.Longitude : undefined;
      result.latitude = result.GPSLatitude;
      result.longitude = result.GPSLongitude;
    }

    // Dimensions
    result.ExifImageWidth = tags.exif?.PixelXDimension?.value
      ? Number(tags.exif.PixelXDimension.value)
      : undefined;
    result.ExifImageHeight = tags.exif?.PixelYDimension?.value
      ? Number(tags.exif.PixelYDimension.value)
      : undefined;
    result.ImageWidth = tags.file?.['Image Width']?.value
      ? Number(tags.file['Image Width'].value)
      : result.ExifImageWidth;
    result.ImageHeight = tags.file?.['Image Height']?.value
      ? Number(tags.file['Image Height'].value)
      : result.ExifImageHeight;

    // Orientation
    if (tags.exif?.Orientation?.value) {
      result.Orientation = Number(tags.exif.Orientation.value);
    }

    // Description
    result.ImageDescription = tags.exif?.ImageDescription?.description;
    result.Description =
      tags.iptc?.['Caption/Abstract']?.description ??
      tags.iptc?.caption?.description ??
      tags.xmp?.Description?.description;

    // Color
    result.ProfileDescription = tags.icc?.['Profile Description']?.description;
    result.ColorSpace = tags.exif?.ColorSpace?.description;
    if (tags.exif?.BitsPerSample?.value) {
      result.BitsPerSample = Number(tags.exif.BitsPerSample.value);
    }

    // Rating
    if (tags.xmp?.Rating?.value !== undefined) {
      result.Rating = Number(tags.xmp.Rating.value);
    }

    // Projection type (for 360 photos)
    result.ProjectionType = tags.xmp?.ProjectionType?.description;

    // Motion photo (Google/Samsung)
    if (tags.xmp?.MotionPhoto?.value !== undefined) {
      result.MotionPhoto = Number(tags.xmp.MotionPhoto.value);
    }
    if (tags.xmp?.MotionPhotoVersion?.value !== undefined) {
      result.MotionPhotoVersion = Number(tags.xmp.MotionPhotoVersion.value);
    }

    // Content identifier (Apple Live Photo)
    result.ContentIdentifier =
      tags.xmp?.ContentIdentifier?.description ??
      tags.exif?.ContentIdentifier?.description;
    result.MediaGroupUUID = tags.xmp?.MediaGroupUUID?.description;

    return result;
  }
}
