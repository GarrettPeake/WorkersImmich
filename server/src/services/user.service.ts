/**
 * User service -- Workers-compatible version.
 *
 * Core business logic for user endpoints.
 * No NestJS decorators, no BaseService, no job queues.
 */

import type { AuthDto } from 'src/dtos/auth.dto';
import type { ServiceContext } from 'src/context';
import { mapPreferences } from 'src/dtos/user-preferences.dto';
import { mapUser, mapUserAdmin } from 'src/dtos/user.dto';
import { UserMetadataKey } from 'src/enum';
import { UserRepository } from 'src/repositories/user.repository';
import { getPreferences, mergePreferences } from 'src/utils/preferences';

export class UserService {
  private userRepository: UserRepository;

  private get db() {
    return this.ctx.db;
  }

  constructor(private ctx: ServiceContext) {
    this.userRepository = new UserRepository(ctx.db);
  }

  async search(auth: AuthDto) {
    // For Workers, return all non-deleted users (simplified -- config check omitted)
    const users = await this.userRepository.getList({ withDeleted: false });
    return users.map((user: any) => mapUser(user));
  }

  async getMe(auth: AuthDto) {
    const user = await this.userRepository.get(auth.user.id, {});
    if (!user) {
      throw new Error('User not found');
    }
    return mapUserAdmin(user as any);
  }

  async updateMe(auth: AuthDto, dto: any) {
    if (dto.email) {
      const duplicate = await this.userRepository.getByEmail(dto.email);
      if (duplicate && duplicate.id !== auth.user.id) {
        throw new Error('Email already in use by another account');
      }
    }

    const update: any = {
      email: dto.email,
      name: dto.name,
      avatarColor: dto.avatarColor,
    };

    if (dto.password) {
      const hashedPassword = await this.ctx.crypto.hashBcrypt(dto.password, 10);
      update.password = hashedPassword;
      update.shouldChangePassword = 0;
    }

    await this.userRepository.update(auth.user.id, update);
    const updatedUser = await this.userRepository.get(auth.user.id, {});
    return mapUserAdmin(updatedUser as any);
  }

  async getMyPreferences(auth: AuthDto) {
    const metadata = await this.userRepository.getMetadata(auth.user.id);
    const items = metadata.map((m: any) => ({
      key: m.key as UserMetadataKey,
      value: typeof m.value === 'string' ? JSON.parse(m.value) : m.value,
    }));
    return mapPreferences(getPreferences(items));
  }

  async updateMyPreferences(auth: AuthDto, dto: any) {
    const metadata = await this.userRepository.getMetadata(auth.user.id);
    const items = metadata.map((m: any) => ({
      key: m.key as UserMetadataKey,
      value: typeof m.value === 'string' ? JSON.parse(m.value) : m.value,
    }));
    const preferences = mergePreferences(getPreferences(items), dto);

    await this.userRepository.upsertMetadata(auth.user.id, {
      key: UserMetadataKey.Preferences,
      value: JSON.stringify(preferences),
    });

    return mapPreferences(preferences);
  }

  async get(id: string) {
    const user = await this.userRepository.get(id, { withDeleted: false });
    if (!user) {
      throw new Error('User not found');
    }
    return mapUser(user as any);
  }

  async createProfileImage(auth: AuthDto, fileData: ArrayBuffer, fileName: string) {
    const key = `profile/${auth.user.id}/${fileName}`;
    await this.ctx.bucket.put(key, fileData);

    const user = await this.userRepository.update(auth.user.id, {
      profileImagePath: key,
      profileChangedAt: new Date().toISOString(),
    });

    return {
      userId: user.id,
      profileImagePath: user.profileImagePath,
      profileChangedAt: user.profileChangedAt,
    };
  }

  async deleteProfileImage(auth: AuthDto): Promise<void> {
    const user = await this.userRepository.get(auth.user.id, { withDeleted: false });
    if (!user) {
      throw new Error('User not found');
    }
    if (!user.profileImagePath || user.profileImagePath === '') {
      throw new Error("Can't delete a missing profile image");
    }

    // Delete from R2
    await this.ctx.bucket.delete(user.profileImagePath);
    await this.userRepository.update(auth.user.id, {
      profileImagePath: '',
      profileChangedAt: new Date().toISOString(),
    });
  }

  async getProfileImage(id: string) {
    const user = await this.userRepository.get(id, {});
    if (!user || !user.profileImagePath) {
      throw new Error('User does not have a profile image');
    }

    const object = await this.ctx.bucket.get(user.profileImagePath);
    if (!object) {
      return { body: null, contentType: 'image/jpeg', size: 0 };
    }

    return {
      body: (object as R2ObjectBody).body,
      contentType: 'image/jpeg',
      size: object.size,
    };
  }

  async getLicense(auth: AuthDto) {
    const metadata = await this.userRepository.getMetadata(auth.user.id);
    const license = metadata.find((m: any) => m.key === 'license');
    if (!license) {
      throw new Error('License not found');
    }
    const value = typeof license.value === 'string' ? JSON.parse(license.value) : license.value;
    return { ...value, activatedAt: new Date(value.activatedAt) };
  }

  async deleteLicense(auth: AuthDto): Promise<void> {
    await this.userRepository.deleteMetadata(auth.user.id, 'license');
  }

  async setLicense(auth: AuthDto, license: any) {
    if (!license.licenseKey.startsWith('IMCL-') && !license.licenseKey.startsWith('IMSV-')) {
      throw new Error('Invalid license key');
    }

    const activatedAt = new Date();
    await this.userRepository.upsertMetadata(auth.user.id, {
      key: 'license',
      value: JSON.stringify({ ...license, activatedAt: activatedAt.toISOString() }),
    });

    return { ...license, activatedAt };
  }

  async getOnboarding(auth: AuthDto) {
    const metadata = await this.userRepository.getMetadata(auth.user.id);
    const onboarding = metadata.find((m: any) => m.key === 'onboarding');
    if (!onboarding) {
      return { isOnboarded: false };
    }
    const value = typeof onboarding.value === 'string' ? JSON.parse(onboarding.value) : onboarding.value;
    return { isOnboarded: value.isOnboarded };
  }

  async deleteOnboarding(auth: AuthDto): Promise<void> {
    await this.userRepository.deleteMetadata(auth.user.id, 'onboarding');
  }

  async setOnboarding(auth: AuthDto, dto: any) {
    await this.userRepository.upsertMetadata(auth.user.id, {
      key: 'onboarding',
      value: JSON.stringify({ isOnboarded: dto.isOnboarded }),
    });
    return { isOnboarded: dto.isOnboarded };
  }
}
