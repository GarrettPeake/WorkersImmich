export enum AuthType {
  Password = 'password',
  OAuth = 'oauth',
}

export enum ImmichCookie {
  AccessToken = 'immich_access_token',
  MaintenanceToken = 'immich_maintenance_token',
  AuthType = 'immich_auth_type',
  IsAuthenticated = 'immich_is_authenticated',
  SharedLinkToken = 'immich_shared_link_token',
  OAuthState = 'immich_oauth_state',
  OAuthCodeVerifier = 'immich_oauth_code_verifier',
}

export enum ImmichHeader {
  ApiKey = 'x-api-key',
  UserToken = 'x-immich-user-token',
  SessionToken = 'x-immich-session-token',
  SharedLinkKey = 'x-immich-share-key',
  SharedLinkSlug = 'x-immich-share-slug',
  Checksum = 'x-immich-checksum',
  Cid = 'x-immich-cid',
}

export enum ImmichQuery {
  SharedLinkKey = 'key',
  SharedLinkSlug = 'slug',
  ApiKey = 'apiKey',
  SessionKey = 'sessionKey',
}

export enum AssetType {
  Image = 'IMAGE',
  Video = 'VIDEO',
  Audio = 'AUDIO',
  Other = 'OTHER',
}

export enum AssetFileType {
  /** An full/large-size image extracted/converted from RAW photos */
  FullSize = 'fullsize',
  Preview = 'preview',
  Thumbnail = 'thumbnail',
  Sidecar = 'sidecar',
}

export enum AlbumUserRole {
  Editor = 'editor',
  Viewer = 'viewer',
}

export enum AssetOrder {
  Asc = 'asc',
  Desc = 'desc',
}

export enum DatabaseAction {
  Create = 'CREATE',
  Update = 'UPDATE',
  Delete = 'DELETE',
}

export enum EntityType {
  Asset = 'ASSET',
  Album = 'ALBUM',
}

export enum MemoryType {
  /** pictures taken on this day X years ago */
  OnThisDay = 'on_this_day',
}

export enum AssetOrderWithRandom {
  Asc = AssetOrder.Asc,
  Desc = AssetOrder.Desc,
  /** Randomly Ordered */
  Random = 'random',
}

export enum Permission {
  All = 'all',

  ActivityCreate = 'activity.create',
  ActivityRead = 'activity.read',
  ActivityUpdate = 'activity.update',
  ActivityDelete = 'activity.delete',
  ActivityStatistics = 'activity.statistics',

  ApiKeyCreate = 'apiKey.create',
  ApiKeyRead = 'apiKey.read',
  ApiKeyUpdate = 'apiKey.update',
  ApiKeyDelete = 'apiKey.delete',

  AssetRead = 'asset.read',
  AssetUpdate = 'asset.update',
  AssetDelete = 'asset.delete',
  AssetStatistics = 'asset.statistics',
  AssetShare = 'asset.share',
  AssetView = 'asset.view',
  AssetDownload = 'asset.download',
  AssetUpload = 'asset.upload',
  AssetReplace = 'asset.replace',
  AssetCopy = 'asset.copy',
  AssetDerive = 'asset.derive',

  AssetEditGet = 'asset.edit.get',
  AssetEditCreate = 'asset.edit.create',
  AssetEditDelete = 'asset.edit.delete',

  AlbumCreate = 'album.create',
  AlbumRead = 'album.read',
  AlbumUpdate = 'album.update',
  AlbumDelete = 'album.delete',
  AlbumStatistics = 'album.statistics',
  AlbumShare = 'album.share',
  AlbumDownload = 'album.download',

  AlbumAssetCreate = 'albumAsset.create',
  AlbumAssetDelete = 'albumAsset.delete',

  AlbumUserCreate = 'albumUser.create',
  AlbumUserUpdate = 'albumUser.update',
  AlbumUserDelete = 'albumUser.delete',

  AuthChangePassword = 'auth.changePassword',

  AuthDeviceDelete = 'authDevice.delete',

  ArchiveRead = 'archive.read',

  FolderRead = 'folder.read',

  TimelineRead = 'timeline.read',
  TimelineDownload = 'timeline.download',

  MemoryCreate = 'memory.create',
  MemoryRead = 'memory.read',
  MemoryUpdate = 'memory.update',
  MemoryDelete = 'memory.delete',
  MemoryStatistics = 'memory.statistics',

  MemoryAssetCreate = 'memoryAsset.create',
  MemoryAssetDelete = 'memoryAsset.delete',

  PartnerCreate = 'partner.create',
  PartnerRead = 'partner.read',
  PartnerUpdate = 'partner.update',
  PartnerDelete = 'partner.delete',

  PersonCreate = 'person.create',
  PersonRead = 'person.read',
  PersonUpdate = 'person.update',
  PersonDelete = 'person.delete',
  PersonStatistics = 'person.statistics',
  PersonMerge = 'person.merge',
  PersonReassign = 'person.reassign',

  PinCodeCreate = 'pinCode.create',
  PinCodeUpdate = 'pinCode.update',
  PinCodeDelete = 'pinCode.delete',

  ServerAbout = 'server.about',
  ServerApkLinks = 'server.apkLinks',
  ServerStorage = 'server.storage',
  ServerStatistics = 'server.statistics',
  ServerVersionCheck = 'server.versionCheck',

  ServerLicenseRead = 'serverLicense.read',
  ServerLicenseUpdate = 'serverLicense.update',
  ServerLicenseDelete = 'serverLicense.delete',

  SessionCreate = 'session.create',
  SessionRead = 'session.read',
  SessionUpdate = 'session.update',
  SessionDelete = 'session.delete',
  SessionLock = 'session.lock',

  SharedLinkCreate = 'sharedLink.create',
  SharedLinkRead = 'sharedLink.read',
  SharedLinkUpdate = 'sharedLink.update',
  SharedLinkDelete = 'sharedLink.delete',

  StackCreate = 'stack.create',
  StackRead = 'stack.read',
  StackUpdate = 'stack.update',
  StackDelete = 'stack.delete',

  SyncStream = 'sync.stream',
  SyncCheckpointRead = 'syncCheckpoint.read',
  SyncCheckpointUpdate = 'syncCheckpoint.update',
  SyncCheckpointDelete = 'syncCheckpoint.delete',

  SystemConfigRead = 'systemConfig.read',
  SystemConfigUpdate = 'systemConfig.update',

  SystemMetadataRead = 'systemMetadata.read',
  SystemMetadataUpdate = 'systemMetadata.update',

  TagCreate = 'tag.create',
  TagRead = 'tag.read',
  TagUpdate = 'tag.update',
  TagDelete = 'tag.delete',
  TagAsset = 'tag.asset',

  UserRead = 'user.read',
  UserUpdate = 'user.update',

  UserLicenseCreate = 'userLicense.create',
  UserLicenseRead = 'userLicense.read',
  UserLicenseUpdate = 'userLicense.update',
  UserLicenseDelete = 'userLicense.delete',

  UserOnboardingRead = 'userOnboarding.read',
  UserOnboardingUpdate = 'userOnboarding.update',
  UserOnboardingDelete = 'userOnboarding.delete',

  UserPreferenceRead = 'userPreference.read',
  UserPreferenceUpdate = 'userPreference.update',

  UserProfileImageCreate = 'userProfileImage.create',
  UserProfileImageRead = 'userProfileImage.read',
  UserProfileImageUpdate = 'userProfileImage.update',
  UserProfileImageDelete = 'userProfileImage.delete',

  AdminUserCreate = 'adminUser.create',
  AdminUserRead = 'adminUser.read',
  AdminUserUpdate = 'adminUser.update',
  AdminUserDelete = 'adminUser.delete',

  AdminSessionRead = 'adminSession.read',

  AdminAuthUnlinkAll = 'adminAuth.unlinkAll',
}

export enum SharedLinkType {
  Album = 'ALBUM',
  /** Individual asset or group of assets not in an album */
  Individual = 'INDIVIDUAL',
}

export enum StorageFolder {
  Library = 'library',
  Upload = 'upload',
  Profile = 'profile',
  Thumbnails = 'thumbs',
}

export enum SystemMetadataKey {
  AdminOnboarding = 'admin-onboarding',
  MaintenanceMode = 'maintenance-mode',
  SystemConfig = 'system-config',
  SystemFlags = 'system-flags',
  VersionCheckState = 'version-check-state',
  License = 'license',
  MemoriesState = 'memories-state',
}

export enum UserMetadataKey {
  Preferences = 'preferences',
  License = 'license',
  Onboarding = 'onboarding',
}

export enum AssetMetadataKey {
  MobileApp = 'mobile-app',
}

export enum UserAvatarColor {
  Primary = 'primary',
  Pink = 'pink',
  Red = 'red',
  Yellow = 'yellow',
  Blue = 'blue',
  Green = 'green',
  Purple = 'purple',
  Orange = 'orange',
  Gray = 'gray',
  Amber = 'amber',
}

export enum UserStatus {
  Active = 'active',
  Removing = 'removing',
  Deleted = 'deleted',
}

export enum AssetStatus {
  Active = 'active',
  Trashed = 'trashed',
  Deleted = 'deleted',
}

export enum SourceType {
  MachineLearning = 'machine-learning',
  Exif = 'exif',
  Manual = 'manual',
}

export enum AssetPathType {
  Original = 'original',
}

export enum PersonPathType {
  Face = 'face',
}

export enum UserPathType {
  Profile = 'profile',
}

export type PathType = AssetFileType | AssetPathType | PersonPathType | UserPathType;

export enum ImageFormat {
  Jpeg = 'jpeg',
  Webp = 'webp',
}

export enum LogLevel {
  Verbose = 'verbose',
  Debug = 'debug',
  Log = 'log',
  Warn = 'warn',
  Error = 'error',
  Fatal = 'fatal',
}

export enum ApiCustomExtension {
  Permission = 'x-immich-permission',
  AdminOnly = 'x-immich-admin-only',
  History = 'x-immich-history',
  State = 'x-immich-state',
}

export enum MetadataKey {
  AuthRoute = 'auth_route',
  AdminRoute = 'admin_route',
  SharedRoute = 'shared_route',
  ApiKeySecurity = 'api_key',
  EventConfig = 'event_config',
}

export enum RouteKey {
  Asset = 'assets',
  User = 'users',
}

export enum CacheControl {
  PrivateWithCache = 'private_with_cache',
  PrivateWithoutCache = 'private_without_cache',
  None = 'none',
}

export enum ImmichEnvironment {
  Development = 'development',
  Testing = 'testing',
  Production = 'production',
}

export enum AssetVisibility {
  Archive = 'archive',
  Timeline = 'timeline',
  /** Video part of LivePhotos and MotionPhotos */
  Hidden = 'hidden',
  Locked = 'locked',
}

export enum NotificationLevel {
  Success = 'success',
  Error = 'error',
  Warning = 'warning',
  Info = 'info',
}

export enum NotificationType {
  JobFailed = 'JobFailed',
  BackupFailed = 'BackupFailed',
  SystemMessage = 'SystemMessage',
  AlbumInvite = 'AlbumInvite',
  AlbumUpdate = 'AlbumUpdate',
  Custom = 'Custom',
}

export enum Colorspace {
  Srgb = 'srgb',
  P3 = 'p3',
}

export enum ExifOrientation {
  Horizontal = 1,
  MirrorHorizontal = 2,
  Rotate180 = 3,
  MirrorVertical = 4,
  MirrorHorizontalRotate270CW = 5,
  Rotate90CW = 6,
  MirrorHorizontalRotate90CW = 7,
  Rotate270CW = 8,
}

export enum SyncRequestType {
  AlbumsV1 = 'AlbumsV1',
  AlbumUsersV1 = 'AlbumUsersV1',
  AlbumToAssetsV1 = 'AlbumToAssetsV1',
  AlbumAssetsV1 = 'AlbumAssetsV1',
  AlbumAssetExifsV1 = 'AlbumAssetExifsV1',
  AssetsV1 = 'AssetsV1',
  AssetExifsV1 = 'AssetExifsV1',
  AssetMetadataV1 = 'AssetMetadataV1',
  AuthUsersV1 = 'AuthUsersV1',
  MemoriesV1 = 'MemoriesV1',
  MemoryToAssetsV1 = 'MemoryToAssetsV1',
  PartnersV1 = 'PartnersV1',
  PartnerAssetsV1 = 'PartnerAssetsV1',
  PartnerAssetExifsV1 = 'PartnerAssetExifsV1',
  PartnerStacksV1 = 'PartnerStacksV1',
  StacksV1 = 'StacksV1',
  UsersV1 = 'UsersV1',
  PeopleV1 = 'PeopleV1',
  AssetFacesV1 = 'AssetFacesV1',
  UserMetadataV1 = 'UserMetadataV1',
}

export enum SyncEntityType {
  AuthUserV1 = 'AuthUserV1',

  UserV1 = 'UserV1',
  UserDeleteV1 = 'UserDeleteV1',

  AssetV1 = 'AssetV1',
  AssetDeleteV1 = 'AssetDeleteV1',
  AssetExifV1 = 'AssetExifV1',
  AssetMetadataV1 = 'AssetMetadataV1',
  AssetMetadataDeleteV1 = 'AssetMetadataDeleteV1',

  PartnerV1 = 'PartnerV1',
  PartnerDeleteV1 = 'PartnerDeleteV1',

  PartnerAssetV1 = 'PartnerAssetV1',
  PartnerAssetBackfillV1 = 'PartnerAssetBackfillV1',
  PartnerAssetDeleteV1 = 'PartnerAssetDeleteV1',
  PartnerAssetExifV1 = 'PartnerAssetExifV1',
  PartnerAssetExifBackfillV1 = 'PartnerAssetExifBackfillV1',
  PartnerStackBackfillV1 = 'PartnerStackBackfillV1',
  PartnerStackDeleteV1 = 'PartnerStackDeleteV1',
  PartnerStackV1 = 'PartnerStackV1',

  AlbumV1 = 'AlbumV1',
  AlbumDeleteV1 = 'AlbumDeleteV1',

  AlbumUserV1 = 'AlbumUserV1',
  AlbumUserBackfillV1 = 'AlbumUserBackfillV1',
  AlbumUserDeleteV1 = 'AlbumUserDeleteV1',

  AlbumAssetCreateV1 = 'AlbumAssetCreateV1',
  AlbumAssetUpdateV1 = 'AlbumAssetUpdateV1',
  AlbumAssetBackfillV1 = 'AlbumAssetBackfillV1',
  AlbumAssetExifCreateV1 = 'AlbumAssetExifCreateV1',
  AlbumAssetExifUpdateV1 = 'AlbumAssetExifUpdateV1',
  AlbumAssetExifBackfillV1 = 'AlbumAssetExifBackfillV1',

  AlbumToAssetV1 = 'AlbumToAssetV1',
  AlbumToAssetDeleteV1 = 'AlbumToAssetDeleteV1',
  AlbumToAssetBackfillV1 = 'AlbumToAssetBackfillV1',

  MemoryV1 = 'MemoryV1',
  MemoryDeleteV1 = 'MemoryDeleteV1',

  MemoryToAssetV1 = 'MemoryToAssetV1',
  MemoryToAssetDeleteV1 = 'MemoryToAssetDeleteV1',

  StackV1 = 'StackV1',
  StackDeleteV1 = 'StackDeleteV1',

  PersonV1 = 'PersonV1',
  PersonDeleteV1 = 'PersonDeleteV1',

  AssetFaceV1 = 'AssetFaceV1',
  AssetFaceDeleteV1 = 'AssetFaceDeleteV1',

  UserMetadataV1 = 'UserMetadataV1',
  UserMetadataDeleteV1 = 'UserMetadataDeleteV1',

  SyncAckV1 = 'SyncAckV1',
  SyncResetV1 = 'SyncResetV1',
  SyncCompleteV1 = 'SyncCompleteV1',
}

export enum ApiTag {
  Activities = 'Activities',
  Albums = 'Albums',
  ApiKeys = 'API keys',
  Authentication = 'Authentication',
  AuthenticationAdmin = 'Authentication (admin)',
  Assets = 'Assets',
  Download = 'Download',
  Map = 'Map',
  Memories = 'Memories',
  Partners = 'Partners',
  Search = 'Search',
  Server = 'Server',
  Sessions = 'Sessions',
  SharedLinks = 'Shared links',
  Stacks = 'Stacks',
  Sync = 'Sync',
  SystemConfig = 'System config',
  SystemMetadata = 'System metadata',
  Tags = 'Tags',
  Timeline = 'Timeline',
  Trash = 'Trash',
  UsersAdmin = 'Users (admin)',
  Users = 'Users',
  Views = 'Views',
}

