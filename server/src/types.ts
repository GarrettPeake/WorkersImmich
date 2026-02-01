import { SystemConfig } from 'src/config';
import { Asset, AssetFile } from 'src/database';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  AssetOrder,
  AssetType,
  AssetVisibility,
  ExifOrientation,
  ImageFormat,
  MemoryType,
  StorageFolder,
  SyncEntityType,
  SystemMetadataKey,
  UserMetadataKey,
} from 'src/enum';

export type DeepPartial<T> =
  T extends Record<string, unknown>
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T extends Array<infer R>
      ? DeepPartial<R>[]
      : T;

export type RepositoryInterface<T extends object> = Pick<T, keyof T>;

export type ImageOptions = {
  format: ImageFormat;
  quality: number;
  size: number;
  progressive?: boolean;
};

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface UploadFile {
  uuid: string;
  checksum: Buffer;
  originalPath: string;
  originalName: string;
  size: number;
}

export interface UploadBody {
  filename?: string;
  [key: string]: unknown;
}

export type UploadRequest = {
  auth: AuthDto | null;
  fieldName: string;
  file: UploadFile;
  body: UploadBody;
};

export interface UploadFiles {
  assetData: ImmichFile[];
  sidecarData: ImmichFile[];
}

export interface ImmichFile {
  uuid: string;
  /** sha1 hash of file */
  checksum: Buffer;
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
}

export interface IBulkAsset {
  getAssetIds: (id: string, assetIds: string[]) => Promise<Set<string>>;
  addAssetIds: (id: string, assetIds: string[]) => Promise<void>;
  removeAssetIds: (id: string, assetIds: string[]) => Promise<void>;
}

export type SyncAck = {
  type: SyncEntityType;
  updateId: string;
  extraId?: string;
};

export type StorageAsset = {
  id: string;
  ownerId: string;
  livePhotoVideoId: string | null;
  type: AssetType;
  isExternal: boolean;
  checksum: Buffer;
  timeZone: string | null;
  fileCreatedAt: Date;
  originalPath: string;
  originalFileName: string;
  fileSizeInByte: number | null;
  files: AssetFile[];
  make: string | null;
  model: string | null;
  lensModel: string | null;
};

export type OnThisDayData = { year: number };

export interface MemoryData {
  [MemoryType.OnThisDay]: OnThisDayData;
}

export type VersionCheckMetadata = { checkedAt: string; releaseVersion: string };
export type SystemFlags = { mountChecks: Record<StorageFolder, boolean> };
export type MaintenanceModeState =
  | { isMaintenanceMode: true; secret: string }
  | { isMaintenanceMode: false };
export type MemoriesState = {
  /** memories have already been created through this date */
  lastOnThisDayDate: string;
};

export interface SystemMetadata extends Record<SystemMetadataKey, Record<string, any>> {
  [SystemMetadataKey.AdminOnboarding]: { isOnboarded: boolean };
  [SystemMetadataKey.License]: { licenseKey: string; activationKey: string; activatedAt: Date };
  [SystemMetadataKey.MaintenanceMode]: MaintenanceModeState;
  [SystemMetadataKey.SystemConfig]: DeepPartial<SystemConfig>;
  [SystemMetadataKey.SystemFlags]: DeepPartial<SystemFlags>;
  [SystemMetadataKey.VersionCheckState]: VersionCheckMetadata;
  [SystemMetadataKey.MemoriesState]: MemoriesState;
}

export type UserPreferences = {
  albums: {
    defaultAssetOrder: AssetOrder;
  };
  folders: {
    enabled: boolean;
    sidebarWeb: boolean;
  };
  memories: {
    enabled: boolean;
    duration: number;
  };
  people: {
    enabled: boolean;
    sidebarWeb: boolean;
  };
  ratings: {
    enabled: boolean;
  };
  sharedLinks: {
    enabled: boolean;
    sidebarWeb: boolean;
  };
  tags: {
    enabled: boolean;
    sidebarWeb: boolean;
  };
  emailNotifications: {
    enabled: boolean;
    albumInvite: boolean;
    albumUpdate: boolean;
  };
  download: {
    archiveSize: number;
    includeEmbeddedVideos: boolean;
  };
  purchase: {
    showSupportBadge: boolean;
    hideBuyButtonUntil: string;
  };
  cast: {
    gCastEnabled: boolean;
  };
};

export type UserMetadataItem<T extends keyof UserMetadata = UserMetadataKey> = {
  key: T;
  value: UserMetadata[T];
};

export interface UserMetadata extends Record<UserMetadataKey, Record<string, any>> {
  [UserMetadataKey.Preferences]: DeepPartial<UserPreferences>;
  [UserMetadataKey.License]: { licenseKey: string; activationKey: string; activatedAt: string };
  [UserMetadataKey.Onboarding]: { isOnboarded: boolean };
}
