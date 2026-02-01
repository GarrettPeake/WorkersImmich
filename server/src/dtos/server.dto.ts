import { SemVer } from 'semver';

// --- Response DTOs (plain interfaces) ---

export interface ServerPingResponse {
  res: string;
}

export interface ServerAboutResponseDto {
  version: string;
  versionUrl: string;
  repository?: string;
  repositoryUrl?: string;
  sourceRef?: string;
  sourceCommit?: string;
  sourceUrl?: string;
  build?: string;
  buildUrl?: string;
  buildImage?: string;
  buildImageUrl?: string;
  nodejs?: string;
  ffmpeg?: string;
  imagemagick?: string;
  libvips?: string;
  exiftool?: string;
  licensed: boolean;
  thirdPartySourceUrl?: string;
  thirdPartyBugFeatureUrl?: string;
  thirdPartyDocumentationUrl?: string;
  thirdPartySupportUrl?: string;
}

export interface ServerApkLinksDto {
  arm64v8a: string;
  armeabiv7a: string;
  universal: string;
  x86_64: string;
}

export interface ServerStorageResponseDto {
  diskSize: string;
  diskUse: string;
  diskAvailable: string;
  diskSizeRaw: number;
  diskUseRaw: number;
  diskAvailableRaw: number;
  diskUsagePercentage: number;
}

export class ServerVersionResponseDto {
  major!: number;
  minor!: number;
  patch!: number;

  static fromSemVer(value: SemVer) {
    return { major: value.major, minor: value.minor, patch: value.patch };
  }
}

export interface ServerVersionHistoryResponseDto {
  id: string;
  createdAt: Date;
  version: string;
}

export interface UsageByUserDto {
  userId: string;
  userName: string;
  photos: number;
  videos: number;
  usage: number;
  usagePhotos: number;
  usageVideos: number;
  quotaSizeInBytes: number | null;
}

export interface ServerStatsResponseDto {
  photos: number;
  videos: number;
  usage: number;
  usagePhotos: number;
  usageVideos: number;
  usageByUser: UsageByUserDto[];
}

export interface ServerMediaTypesResponseDto {
  video: string[];
  image: string[];
  sidecar: string[];
}

export interface ServerThemeDto {
  customCss: string;
}

export interface ServerConfigDto {
  oauthButtonText: string;
  loginPageMessage: string;
  trashDays: number;
  userDeleteDelay: number;
  isInitialized: boolean;
  isOnboarded: boolean;
  externalDomain: string;
  publicUsers: boolean;
  mapDarkStyleUrl: string;
  mapLightStyleUrl: string;
  maintenanceMode: boolean;
}

export interface ServerFeaturesDto {
  smartSearch: boolean;
  duplicateDetection: boolean;
  configFile: boolean;
  facialRecognition: boolean;
  map: boolean;
  trash: boolean;
  reverseGeocoding: boolean;
  importFaces: boolean;
  oauth: boolean;
  oauthAutoLaunch: boolean;
  passwordLogin: boolean;
  sidecar: boolean;
  search: boolean;
  email: boolean;
  ocr: boolean;
}

export interface ReleaseNotification {
  isAvailable: boolean;
  /** ISO8601 */
  checkedAt: string;
  serverVersion: ServerVersionResponseDto;
  releaseVersion: ServerVersionResponseDto;
}
