import type { Env } from './env';

const CONFIG_KEY = 'system:config';
const CONFIG_TTL = 60; // seconds

export type SystemConfig = {
  server: {
    externalDomain: string;
    loginPageMessage: string;
    publicUsers: boolean;
  };
  theme: {
    customCss: string;
  };
  user: {
    deleteDelay: number;
  };
  newVersionCheck: {
    enabled: boolean;
  };
  passwordLogin: {
    enabled: boolean;
  };
  oauth: {
    autoLaunch: boolean;
    autoRegister: boolean;
    buttonText: string;
    clientId: string;
    clientSecret: string;
    defaultStorageQuota: number | null;
    enabled: boolean;
    issuerUrl: string;
    mobileOverrideEnabled: boolean;
    mobileRedirectUri: string;
    scope: string;
    signingAlgorithm: string;
    profileSigningAlgorithm: string;
    tokenEndpointAuthMethod: string;
    timeout: number;
    storageLabelClaim: string;
    storageQuotaClaim: string;
    roleClaim: string;
  };
  trash: {
    enabled: boolean;
    days: number;
  };
  logging: {
    enabled: boolean;
    level: string;
  };
  image: {
    thumbnail: {
      format: string;
      size: number;
      quality: number;
    };
    preview: {
      format: string;
      size: number;
      quality: number;
    };
  };
  map: {
    enabled: boolean;
    lightStyle: string;
    darkStyle: string;
  };
};

export const defaults: SystemConfig = {
  server: {
    externalDomain: '',
    loginPageMessage: '',
    publicUsers: true,
  },
  theme: {
    customCss: '',
  },
  user: {
    deleteDelay: 7,
  },
  newVersionCheck: {
    enabled: true,
  },
  passwordLogin: {
    enabled: true,
  },
  oauth: {
    autoLaunch: false,
    autoRegister: true,
    buttonText: 'Login with OAuth',
    clientId: '',
    clientSecret: '',
    defaultStorageQuota: null,
    enabled: false,
    issuerUrl: '',
    mobileOverrideEnabled: false,
    mobileRedirectUri: '',
    scope: 'openid email profile',
    signingAlgorithm: 'RS256',
    profileSigningAlgorithm: 'none',
    storageLabelClaim: 'preferred_username',
    storageQuotaClaim: 'immich_quota',
    roleClaim: 'immich_role',
    tokenEndpointAuthMethod: 'client_secret_post',
    timeout: 30_000,
  },
  trash: {
    enabled: true,
    days: 30,
  },
  logging: {
    enabled: true,
    level: 'log',
  },
  image: {
    thumbnail: {
      format: 'webp',
      size: 250,
      quality: 80,
    },
    preview: {
      format: 'jpeg',
      size: 1440,
      quality: 80,
    },
  },
  map: {
    enabled: true,
    lightStyle: 'https://tiles.immich.cloud/v1/style/light.json',
    darkStyle: 'https://tiles.immich.cloud/v1/style/dark.json',
  },
};

export async function getConfig(env: Env): Promise<SystemConfig> {
  // Try KV cache first
  const cached = await env.KV.get(CONFIG_KEY, 'json');
  if (cached) return cached as SystemConfig;

  // Fall back to D1
  const config = await loadConfigFromD1(env);

  // Cache in KV
  await env.KV.put(CONFIG_KEY, JSON.stringify(config), { expirationTtl: CONFIG_TTL });

  return config;
}

export async function updateConfig(env: Env, newConfig: Partial<SystemConfig>): Promise<SystemConfig> {
  const current = await getConfig(env);
  const merged = deepMerge(current, newConfig);

  // Write to D1
  await env.DB.prepare(
    'INSERT OR REPLACE INTO system_metadata (key, value) VALUES (?, ?)',
  )
    .bind('system-config', JSON.stringify(merged))
    .run();

  // Invalidate KV cache
  await env.KV.delete(CONFIG_KEY);

  return merged;
}

async function loadConfigFromD1(env: Env): Promise<SystemConfig> {
  try {
    const result = await env.DB.prepare(
      'SELECT value FROM system_metadata WHERE key = ?',
    )
      .bind('system-config')
      .first<{ value: string }>();

    if (result?.value) {
      return deepMerge(defaults, JSON.parse(result.value));
    }
  } catch {
    // DB might not be initialized yet
  }

  return { ...defaults };
}

/** Deep merge source into target, returning a new object */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      sourceVal &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal as any, sourceVal as any);
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as T[keyof T];
    }
  }
  return result;
}
