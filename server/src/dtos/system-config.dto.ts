import { z } from 'zod';
import { SystemConfig } from 'src/config';
import {
  AudioCodec,
  CQMode,
  Colorspace,
  ImageFormat,
  LogLevel,
  OAuthTokenEndpointAuthMethod,
  QueueName,
  ToneMapping,
  TranscodeHardwareAcceleration,
  TranscodePolicy,
  VideoCodec,
  VideoContainer,
} from 'src/enum';
import { ConcurrentQueueName } from 'src/types';

// --- Simplified Zod schema for system config validation ---

const coerceBool = z.preprocess((val) => {
  if (val === 'true' || val === true) return true;
  if (val === 'false' || val === false) return false;
  return val;
}, z.boolean());

const DatabaseBackupConfigSchema = z.object({
  enabled: coerceBool,
  cronExpression: z.string().min(1),
  keepLastAmount: z.number().int().positive(),
});

const SystemConfigBackupsSchema = z.object({
  database: DatabaseBackupConfigSchema,
});

const SystemConfigFFmpegSchema = z.object({
  crf: z.coerce.number().int().min(0).max(51),
  threads: z.coerce.number().int().min(0),
  preset: z.string(),
  targetVideoCodec: z.nativeEnum(VideoCodec),
  acceptedVideoCodecs: z.array(z.nativeEnum(VideoCodec)),
  targetAudioCodec: z.nativeEnum(AudioCodec),
  acceptedAudioCodecs: z.array(z.nativeEnum(AudioCodec)),
  acceptedContainers: z.array(z.nativeEnum(VideoContainer)),
  targetResolution: z.string(),
  maxBitrate: z.string(),
  bframes: z.coerce.number().int().min(-1).max(16),
  refs: z.coerce.number().int().min(0).max(6),
  gopSize: z.coerce.number().int().min(0),
  temporalAQ: coerceBool,
  cqMode: z.nativeEnum(CQMode),
  twoPass: coerceBool,
  preferredHwDevice: z.string(),
  transcode: z.nativeEnum(TranscodePolicy),
  accel: z.nativeEnum(TranscodeHardwareAcceleration),
  accelDecode: coerceBool,
  tonemap: z.nativeEnum(ToneMapping),
});

const JobSettingsSchema = z.object({
  concurrency: z.number().int().positive(),
});

const SystemConfigJobSchema = z.object({
  [QueueName.ThumbnailGeneration]: JobSettingsSchema,
  [QueueName.MetadataExtraction]: JobSettingsSchema,
  [QueueName.VideoConversion]: JobSettingsSchema,
  [QueueName.SmartSearch]: JobSettingsSchema,
  [QueueName.Migration]: JobSettingsSchema,
  [QueueName.BackgroundTask]: JobSettingsSchema,
  [QueueName.Search]: JobSettingsSchema,
  [QueueName.FaceDetection]: JobSettingsSchema,
  [QueueName.Ocr]: JobSettingsSchema,
  [QueueName.Sidecar]: JobSettingsSchema,
  [QueueName.Library]: JobSettingsSchema,
  [QueueName.Notification]: JobSettingsSchema,
  [QueueName.Workflow]: JobSettingsSchema,
  [QueueName.Editor]: JobSettingsSchema,
});

const SystemConfigLibraryScanSchema = z.object({
  enabled: coerceBool,
  cronExpression: z.string(),
});

const SystemConfigLibraryWatchSchema = z.object({
  enabled: coerceBool,
});

const SystemConfigLibrarySchema = z.object({
  scan: SystemConfigLibraryScanSchema,
  watch: SystemConfigLibraryWatchSchema,
});

const SystemConfigLoggingSchema = z.object({
  enabled: coerceBool,
  level: z.nativeEnum(LogLevel),
});

const MachineLearningAvailabilityChecksSchema = z.object({
  enabled: coerceBool,
  timeout: z.number().int(),
  interval: z.number().int(),
});

const SystemConfigMachineLearningSchema = z.object({
  enabled: coerceBool,
  urls: z.array(z.string().url()).min(1),
  availabilityChecks: MachineLearningAvailabilityChecksSchema,
  clip: z.object({ enabled: coerceBool, modelName: z.string() }).passthrough(),
  duplicateDetection: z.object({ enabled: coerceBool, maxDistance: z.number() }).passthrough(),
  facialRecognition: z.object({
    enabled: coerceBool,
    modelName: z.string(),
    minScore: z.number(),
    minFaces: z.number().int(),
    maxDistance: z.number(),
  }).passthrough(),
  ocr: z.object({ enabled: coerceBool, modelName: z.string() }).passthrough(),
});

enum MapTheme {
  LIGHT = 'light',
  DARK = 'dark',
}

export const MapThemeSchema = z.object({
  theme: z.nativeEnum(MapTheme),
});
export type MapThemeDto = z.infer<typeof MapThemeSchema>;

const SystemConfigMapSchema = z.object({
  enabled: coerceBool,
  lightStyle: z.string().url(),
  darkStyle: z.string().url(),
});

const SystemConfigNewVersionCheckSchema = z.object({
  enabled: coerceBool,
});

const SystemConfigNightlyTasksSchema = z.object({
  startTime: z.string().regex(/^\d{2}:\d{2}$/, { message: 'startTime must be in HH:mm format' }),
  databaseCleanup: coerceBool,
  missingThumbnails: coerceBool,
  clusterNewFaces: coerceBool,
  generateMemories: coerceBool,
  syncQuotaUsage: coerceBool,
});

const SystemConfigOAuthSchema = z.object({
  autoLaunch: coerceBool,
  autoRegister: coerceBool,
  buttonText: z.string(),
  clientId: z.string(),
  clientSecret: z.string(),
  tokenEndpointAuthMethod: z.nativeEnum(OAuthTokenEndpointAuthMethod),
  timeout: z.number().int().positive(),
  defaultStorageQuota: z.number().min(0).nullable(),
  enabled: coerceBool,
  issuerUrl: z.string(),
  mobileOverrideEnabled: coerceBool,
  mobileRedirectUri: z.string(),
  scope: z.string(),
  signingAlgorithm: z.string().min(1),
  profileSigningAlgorithm: z.string().min(1),
  storageLabelClaim: z.string(),
  storageQuotaClaim: z.string(),
  roleClaim: z.string(),
});

const SystemConfigPasswordLoginSchema = z.object({
  enabled: coerceBool,
});

const SystemConfigReverseGeocodingSchema = z.object({
  enabled: coerceBool,
});

const SystemConfigFacesSchema = z.object({
  import: coerceBool,
});

const SystemConfigMetadataSchema = z.object({
  faces: SystemConfigFacesSchema,
});

const SystemConfigServerSchema = z.object({
  externalDomain: z.string(),
  loginPageMessage: z.string(),
  publicUsers: coerceBool,
});

const SystemConfigSmtpTransportSchema = z.object({
  ignoreCert: coerceBool,
  host: z.string().min(1),
  port: z.number().min(0).max(65535),
  secure: coerceBool,
  username: z.string(),
  password: z.string(),
});

const SystemConfigSmtpSchema = z.object({
  enabled: coerceBool,
  from: z.string(),
  replyTo: z.string(),
  transport: SystemConfigSmtpTransportSchema,
});

const SystemConfigNotificationsSchema = z.object({
  smtp: SystemConfigSmtpSchema,
});

const SystemConfigTemplateEmailsSchema = z.object({
  albumInviteTemplate: z.string(),
  welcomeTemplate: z.string(),
  albumUpdateTemplate: z.string(),
});

const SystemConfigTemplatesSchema = z.object({
  email: SystemConfigTemplateEmailsSchema,
});

const SystemConfigStorageTemplateSchema = z.object({
  enabled: coerceBool,
  hashVerificationEnabled: coerceBool,
  template: z.string().min(1),
});

const SystemConfigGeneratedImageSchema = z.object({
  format: z.nativeEnum(ImageFormat),
  quality: z.coerce.number().int().min(1).max(100),
  size: z.coerce.number().int().min(1),
  progressive: coerceBool.optional(),
});

const SystemConfigGeneratedFullsizeImageSchema = z.object({
  enabled: coerceBool,
  format: z.nativeEnum(ImageFormat),
  quality: z.coerce.number().int().min(1).max(100),
  progressive: coerceBool.optional(),
});

const SystemConfigImageSchema = z.object({
  thumbnail: SystemConfigGeneratedImageSchema,
  preview: SystemConfigGeneratedImageSchema,
  fullsize: SystemConfigGeneratedFullsizeImageSchema,
  colorspace: z.nativeEnum(Colorspace),
  extractEmbedded: coerceBool,
});

const SystemConfigTrashSchema = z.object({
  enabled: coerceBool,
  days: z.coerce.number().int().min(0),
});

export const SystemConfigThemeSchema = z.object({
  customCss: z.string(),
});
export type SystemConfigThemeDto = z.infer<typeof SystemConfigThemeSchema>;

// Keep as class for compatibility with ServerThemeDto extends
export class SystemConfigThemeDtoClass {
  customCss!: string;
}
// Re-export the class as SystemConfigThemeDto for server.dto.ts compatibility
export { SystemConfigThemeDtoClass as SystemConfigThemeDtoCompat };

const SystemConfigUserSchema = z.object({
  deleteDelay: z.coerce.number().int().min(1),
});

// --- Main System Config Schema ---

export const SystemConfigSchema = z.object({
  backup: SystemConfigBackupsSchema,
  ffmpeg: SystemConfigFFmpegSchema,
  logging: SystemConfigLoggingSchema,
  machineLearning: SystemConfigMachineLearningSchema,
  map: SystemConfigMapSchema,
  newVersionCheck: SystemConfigNewVersionCheckSchema,
  nightlyTasks: SystemConfigNightlyTasksSchema,
  oauth: SystemConfigOAuthSchema,
  passwordLogin: SystemConfigPasswordLoginSchema,
  reverseGeocoding: SystemConfigReverseGeocodingSchema,
  metadata: SystemConfigMetadataSchema,
  storageTemplate: SystemConfigStorageTemplateSchema,
  job: SystemConfigJobSchema,
  image: SystemConfigImageSchema,
  trash: SystemConfigTrashSchema,
  theme: SystemConfigThemeSchema,
  library: SystemConfigLibrarySchema,
  notifications: SystemConfigNotificationsSchema,
  templates: SystemConfigTemplatesSchema,
  server: SystemConfigServerSchema,
  user: SystemConfigUserSchema,
});
export type SystemConfigDto = z.infer<typeof SystemConfigSchema>;

// --- Response DTOs (plain interfaces) ---

export interface SystemConfigTemplateStorageOptionDto {
  yearOptions: string[];
  monthOptions: string[];
  weekOptions: string[];
  dayOptions: string[];
  hourOptions: string[];
  minuteOptions: string[];
  secondOptions: string[];
  presetOptions: string[];
}

// --- Mapper ---

export function mapConfig(config: SystemConfig): SystemConfigDto {
  return config as unknown as SystemConfigDto;
}
