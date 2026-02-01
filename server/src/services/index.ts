import { ActivityService } from 'src/services/activity.service';
import { AlbumService } from 'src/services/album.service';
import { ApiKeyService } from 'src/services/api-key.service';
import { AssetMediaService } from 'src/services/asset-media.service';
import { AssetService } from 'src/services/asset.service';
import { AuthAdminService } from 'src/services/auth-admin.service';
import { AuthService } from 'src/services/auth.service';
import { DownloadService } from 'src/services/download.service';
import { MemoryService } from 'src/services/memory.service';
import { PartnerService } from 'src/services/partner.service';
import { ServerService } from 'src/services/server.service';
import { SessionService } from 'src/services/session.service';
import { SharedLinkService } from 'src/services/shared-link.service';
import { StackService } from 'src/services/stack.service';
import { SyncService } from 'src/services/sync.service';
import { SystemConfigService } from 'src/services/system-config.service';
import { TagService } from 'src/services/tag.service';
import { TimelineService } from 'src/services/timeline.service';
import { TrashService } from 'src/services/trash.service';
import { UserAdminService } from 'src/services/user-admin.service';
import { UserService } from 'src/services/user.service';
import { ViewService } from 'src/services/view.service';

export const services = [
  ApiKeyService,
  ActivityService,
  AlbumService,
  AssetMediaService,
  AssetService,
  AuthService,
  AuthAdminService,
  DownloadService,
  MemoryService,
  PartnerService,
  ServerService,
  SessionService,
  SharedLinkService,
  StackService,
  SyncService,
  SystemConfigService,
  TagService,
  TimelineService,
  TrashService,
  UserAdminService,
  UserService,
  ViewService,
];
