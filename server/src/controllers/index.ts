import { ActivityController } from 'src/controllers/activity.controller';
import { AlbumController } from 'src/controllers/album.controller';
import { ApiKeyController } from 'src/controllers/api-key.controller';
import { AppController } from 'src/controllers/app.controller';
import { AssetMediaController } from 'src/controllers/asset-media.controller';
import { AssetController } from 'src/controllers/asset.controller';
import { AuthAdminController } from 'src/controllers/auth-admin.controller';
import { AuthController } from 'src/controllers/auth.controller';
import { DownloadController } from 'src/controllers/download.controller';
import { MemoryController } from 'src/controllers/memory.controller';
import { PartnerController } from 'src/controllers/partner.controller';
import { SearchController } from 'src/controllers/search.controller';
import { ServerController } from 'src/controllers/server.controller';
import { SessionController } from 'src/controllers/session.controller';
import { SharedLinkController } from 'src/controllers/shared-link.controller';
import { StackController } from 'src/controllers/stack.controller';
import { SyncController } from 'src/controllers/sync.controller';
import { SystemConfigController } from 'src/controllers/system-config.controller';
import { TagController } from 'src/controllers/tag.controller';
import { TimelineController } from 'src/controllers/timeline.controller';
import { TrashController } from 'src/controllers/trash.controller';
import { UserAdminController } from 'src/controllers/user-admin.controller';
import { UserController } from 'src/controllers/user.controller';
import { ViewController } from 'src/controllers/view.controller';

export const controllers = [
  ApiKeyController,
  ActivityController,
  AlbumController,
  AppController,
  AssetController,
  AssetMediaController,
  AuthController,
  AuthAdminController,
  DownloadController,
  MemoryController,
  PartnerController,
  SearchController,
  ServerController,
  SessionController,
  SharedLinkController,
  StackController,
  SyncController,
  SystemConfigController,
  TagController,
  TimelineController,
  TrashController,
  UserAdminController,
  UserController,
  ViewController,
];
