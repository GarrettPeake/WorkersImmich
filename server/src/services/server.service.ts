/**
 * Server service -- Workers-compatible version.
 *
 * Server info, features, config, statistics, media types, licensing.
 * No NestJS decorators, no BaseService, no job queues.
 */

import type { ServiceContext } from 'src/context';
import { UserRepository } from 'src/repositories/user.repository';

const SERVER_VERSION = { major: 2, minor: 52, patch: 0 };

export class ServerService {
  private userRepository: UserRepository;

  private get db() {
    return this.ctx.db;
  }

  constructor(private ctx: ServiceContext) {
    this.userRepository = new UserRepository(ctx.db);
  }

  async getAboutInfo() {
    const version = `v${SERVER_VERSION.major}.${SERVER_VERSION.minor}.${SERVER_VERSION.patch}`;
    return {
      version,
      versionUrl: `https://github.com/immich-app/immich/releases/tag/${version}`,
      licensed: false,
    };
  }

  getApkLinks() {
    const version = `${SERVER_VERSION.major}.${SERVER_VERSION.minor}.${SERVER_VERSION.patch}`;
    const baseUrl = `https://github.com/immich-app/immich/releases/download/v${version}`;
    return {
      arm64v8a: `${baseUrl}/app-arm64-v8a-release.apk`,
      armeabiv7a: `${baseUrl}/app-armeabi-v7a-release.apk`,
      universal: `${baseUrl}/app-release.apk`,
      x86_64: `${baseUrl}/app-x86_64-release.apk`,
    };
  }

  async getStorage() {
    const diskSizeRaw = 1_000_000_000_000; // 1 TB
    const stats = await this.getStatistics();
    const diskUseRaw = stats.usage;
    const diskAvailableRaw = diskSizeRaw - diskUseRaw;
    const diskUsagePercentage = diskSizeRaw > 0 ? Math.round((diskUseRaw / diskSizeRaw) * 100) : 0;

    return {
      diskAvailable: this.formatBytes(diskAvailableRaw),
      diskSize: this.formatBytes(diskSizeRaw),
      diskUse: this.formatBytes(diskUseRaw),
      diskAvailableRaw,
      diskSizeRaw,
      diskUseRaw,
      diskUsagePercentage,
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  ping() {
    return { res: 'pong' };
  }

  getVersion() {
    return SERVER_VERSION;
  }

  async getVersionHistory() {
    const rows = await this.db
      .selectFrom('version_history')
      .selectAll()
      .orderBy('createdAt', 'desc')
      .execute();
    return rows;
  }

  async getFeatures() {
    return {
      smartSearch: false,
      facialRecognition: false,
      duplicateDetection: false,
      map: false,
      reverseGeocoding: false,
      importFaces: false,
      sidecar: true,
      search: false,
      trash: true,
      oauth: false,
      oauthAutoLaunch: false,
      ocr: false,
      passwordLogin: true,
      configFile: false,
      email: false,
    };
  }

  async getTheme() {
    return { customCss: '' };
  }

  async getSystemConfig() {
    const hasAdmin = await this.userRepository.hasAdmin();
    const onboarding = await this.db
      .selectFrom('system_metadata')
      .select('value')
      .where('key', '=', 'admin-onboarding')
      .executeTakeFirst();

    const isOnboarded = onboarding
      ? (typeof onboarding.value === 'string' ? JSON.parse(onboarding.value) : onboarding.value).isOnboarded
      : false;

    return {
      loginPageMessage: "Garrett Peake's immich",
      trashDays: 30,
      userDeleteDelay: 7,
      oauthButtonText: 'OAuth Not Supported',
      isInitialized: hasAdmin,
      isOnboarded,
      externalDomain: '',
      publicUsers: true,
      mapDarkStyleUrl: '',
      mapLightStyleUrl: '',
      maintenanceMode: false,
    };
  }

  async getStatistics() {
    const userStats = await this.userRepository.getUserStats();
    const serverStats = {
      photos: 0,
      videos: 0,
      usage: 0,
      usagePhotos: 0,
      usageVideos: 0,
      usageByUser: [] as any[],
    };

    for (const user of userStats) {
      serverStats.photos += user.photos || 0;
      serverStats.videos += user.videos || 0;
      serverStats.usage += user.usage || 0;
      serverStats.usagePhotos += user.usagePhotos || 0;
      serverStats.usageVideos += user.usageVideos || 0;
      serverStats.usageByUser.push(user);
    }

    return serverStats;
  }

  getSupportedMediaTypes() {
    return {
      video: ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v', '.3gp'],
      image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.tiff', '.tif', '.bmp', '.avif', '.raw', '.cr2', '.nef', '.arw', '.dng', '.raf', '.orf', '.rw2', '.srw', '.pef'],
      sidecar: ['.xmp'],
    };
  }

  async deleteLicense(): Promise<void> {
    await this.db
      .deleteFrom('system_metadata')
      .where('key', '=', 'license')
      .execute();
  }

  async getLicense() {
    const row = await this.db
      .selectFrom('system_metadata')
      .select('value')
      .where('key', '=', 'license')
      .executeTakeFirst();

    if (!row) {
      throw new Error('License not found');
    }

    return typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
  }

  async setLicense(dto: any) {
    if (!dto.licenseKey.startsWith('IMSV-')) {
      throw new Error('Invalid license key');
    }

    const licenseData = { ...dto, activatedAt: new Date().toISOString() };

    // Upsert system metadata
    const existing = await this.db
      .selectFrom('system_metadata')
      .select('key')
      .where('key', '=', 'license')
      .executeTakeFirst();

    if (existing) {
      await this.db
        .updateTable('system_metadata')
        .set({ value: JSON.stringify(licenseData) })
        .where('key', '=', 'license')
        .execute();
    } else {
      await this.db
        .insertInto('system_metadata')
        .values({ key: 'license', value: JSON.stringify(licenseData) })
        .execute();
    }

    return licenseData;
  }

  async getVersionCheck() {
    const row = await this.db
      .selectFrom('system_metadata')
      .select('value')
      .where('key', '=', 'version-check-state')
      .executeTakeFirst();

    if (!row) {
      return { checkedAt: null, releaseVersion: null };
    }

    return typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
  }
}
