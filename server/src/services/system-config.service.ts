/**
 * System config service -- Workers-compatible version.
 *
 * Uses the config system from CP-3 (KV-cached, D1-backed).
 * No NestJS, no events, no config file support.
 */

import type { SystemConfig } from 'src/config';
import { defaults, getConfig, updateConfig } from 'src/config';
import type { ServiceContext } from 'src/context';

export class SystemConfigService {
  constructor(private ctx: ServiceContext) {}

  async getSystemConfig(): Promise<SystemConfig> {
    return getConfig(this.ctx.env);
  }

  getDefaults(): SystemConfig {
    return { ...defaults };
  }

  async updateSystemConfig(dto: Partial<SystemConfig>): Promise<SystemConfig> {
    return updateConfig(this.ctx.env, dto);
  }

  async getCustomCss(): Promise<string> {
    const config = await getConfig(this.ctx.env);
    return config.theme.customCss;
  }
}
