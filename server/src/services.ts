/**
 * Service registry -- creates all converted service instances from a ServiceContext.
 */

import type { ServiceContext } from './context';
import { AuthService } from './services/auth.service';
import { SessionService } from './services/session.service';
import { ApiKeyService } from './services/api-key.service';
import { AssetService } from './services/asset.service';
import { AssetMediaService } from './services/asset-media.service';
import { AlbumService } from './services/album.service';
import { ActivityService } from './services/activity.service';
import { TagService } from './services/tag.service';
import { StackService } from './services/stack.service';
import { MemoryService } from './services/memory.service';
import { PartnerService } from './services/partner.service';
import { UserService } from './services/user.service';
import { UserAdminService } from './services/user-admin.service';
import { ServerService } from './services/server.service';
import { SharedLinkService } from './services/shared-link.service';
import { TrashService } from './services/trash.service';
import { DownloadService } from './services/download.service';
import { TimelineService } from './services/timeline.service';
import { SearchService } from './services/search.service';
import { SystemConfigService } from './services/system-config.service';
import { SyncService } from './services/sync.service';
import { ViewService } from './services/view.service';
import { AuthAdminService } from './services/auth-admin.service';

// ---------------------------------------------------------------------------
// Services interface
// ---------------------------------------------------------------------------

export interface Services {
  auth: AuthService;
  session: SessionService;
  apiKey: ApiKeyService;
  asset: AssetService;
  assetMedia: AssetMediaService;
  album: AlbumService;
  activity: ActivityService;
  tag: TagService;
  stack: StackService;
  memory: MemoryService;
  partner: PartnerService;
  user: UserService;
  userAdmin: UserAdminService;
  server: ServerService;
  sharedLink: SharedLinkService;
  trash: TrashService;
  download: DownloadService;
  timeline: TimelineService;
  search: SearchService;
  systemConfig: SystemConfigService;
  sync: SyncService;
  view: ViewService;
  authAdmin: AuthAdminService;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create all service instances from a ServiceContext.
 *
 * Each service receives the full context and pulls out what it needs.
 * This is cheap -- services are plain objects with no heavy initialisation.
 */
export function createServices(ctx: ServiceContext): Services {
  return {
    auth: new AuthService(ctx),
    session: new SessionService(ctx),
    apiKey: new ApiKeyService(ctx),
    asset: new AssetService(ctx),
    assetMedia: new AssetMediaService(ctx),
    album: new AlbumService(ctx),
    activity: new ActivityService(ctx),
    tag: new TagService(ctx),
    stack: new StackService(ctx),
    memory: new MemoryService(ctx),
    partner: new PartnerService(ctx),
    user: new UserService(ctx),
    userAdmin: new UserAdminService(ctx),
    server: new ServerService(ctx),
    sharedLink: new SharedLinkService(ctx),
    trash: new TrashService(ctx),
    download: new DownloadService(ctx),
    timeline: new TimelineService(ctx),
    search: new SearchService(ctx),
    systemConfig: new SystemConfigService(ctx),
    sync: new SyncService(ctx),
    view: new ViewService(ctx),
    authAdmin: new AuthAdminService(ctx),
  };
}
