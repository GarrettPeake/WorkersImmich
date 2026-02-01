/**
 * Request utility functions for Cloudflare Workers.
 * No Node.js imports -- works with standard Headers.
 */

export const fromChecksum = (checksum: string): Uint8Array => {
  if (checksum.length === 28) {
    // base64
    const binaryString = atob(checksum);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
  // hex
  const bytes = new Uint8Array(checksum.length / 2);
  for (let i = 0; i < checksum.length; i += 2) {
    bytes[i / 2] = Number.parseInt(checksum.slice(i, i + 2), 16);
  }
  return bytes;
};

export const fromMaybeArray = <T>(param: T | T[]) => (Array.isArray(param) ? param[0] : param);

const getAppVersionFromUA = (ua: string) =>
  ua.match(/^Immich_(?:Android|iOS)_(?<appVersion>.+)$/)?.groups?.appVersion ?? null;

/**
 * Extract user-agent details from headers.
 * Accepts either a standard Headers object or a plain Record<string, string>.
 */
export const getUserAgentDetails = (headers: Headers | Record<string, string | undefined>) => {
  let userAgent: string;
  let deviceModel: string;
  let deviceType: string;

  if (headers instanceof Headers) {
    userAgent = headers.get('user-agent') || '';
    deviceModel = headers.get('devicemodel') || '';
    deviceType = headers.get('devicetype') || '';
  } else {
    userAgent = headers['user-agent'] || '';
    deviceModel = headers['devicemodel'] || '';
    deviceType = headers['devicetype'] || '';
  }

  const appVersion = getAppVersionFromUA(userAgent);

  // Simple UA parsing without ua-parser-js (not needed in Workers)
  // Extract browser name from common UA patterns
  let browserName = '';
  if (userAgent.includes('Chrome/')) {
    browserName = 'Chrome';
  } else if (userAgent.includes('Firefox/')) {
    browserName = 'Firefox';
  } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) {
    browserName = 'Safari';
  } else if (userAgent.includes('Immich')) {
    browserName = 'Immich';
  }

  // Extract OS from UA
  let osName = '';
  if (userAgent.includes('Android')) {
    osName = 'Android';
  } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
    osName = 'iOS';
  } else if (userAgent.includes('Windows')) {
    osName = 'Windows';
  } else if (userAgent.includes('Mac OS')) {
    osName = 'Mac OS';
  } else if (userAgent.includes('Linux')) {
    osName = 'Linux';
  }

  return {
    deviceType: browserName || deviceModel || '',
    deviceOS: osName || deviceType || '',
    appVersion,
  };
};
