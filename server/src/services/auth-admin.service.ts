/**
 * Auth admin service -- Workers-compatible version.
 *
 * Admin-only auth operations like unlinking all OAuth accounts.
 * No NestJS, no BaseService.
 */

import type { AuthDto } from 'src/dtos/auth.dto';
import type { ServiceContext } from 'src/context';

export class AuthAdminService {
  private get db() {
    return this.ctx.db;
  }

  constructor(private ctx: ServiceContext) {}

  async unlinkAll(_auth: AuthDto): Promise<void> {
    await this.db
      .updateTable('user')
      .set({ oauthId: '' })
      .execute();
  }
}
