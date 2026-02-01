import { UploadFieldName } from 'src/dtos/asset-media.dto';

// --- Request DTO ---

export interface CreateProfileImageDto {
  [UploadFieldName.PROFILE_DATA]: File;
}

// --- Response DTO ---

export interface CreateProfileImageResponseDto {
  userId: string;
  profileChangedAt: Date;
  profileImagePath: string;
}
