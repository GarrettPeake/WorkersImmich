import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { SALT_ROUNDS } from 'src/constants';

/**
 * Workers-compatible crypto repository.
 * Replaces Node.js crypto, bcrypt, and jsonwebtoken with:
 * - Web Crypto API (crypto.randomUUID, crypto.getRandomValues, crypto.subtle)
 * - bcryptjs (pure JS bcrypt)
 * - jose (Workers-compatible JWT library)
 */
export class CryptoRepository {
  randomUUID(): string {
    return crypto.randomUUID();
  }

  randomBytes(size: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(size));
  }

  async hashBcrypt(data: string, saltOrRounds: string | number = SALT_ROUNDS): Promise<string> {
    if (typeof saltOrRounds === 'number') {
      return bcrypt.hash(data, saltOrRounds);
    }
    return bcrypt.hash(data, saltOrRounds);
  }

  compareBcrypt(data: string, encrypted: string): boolean {
    return bcrypt.compareSync(data, encrypted);
  }

  /**
   * Hash a string with SHA-256, returning base64.
   * NOTE: This is async in Workers (was sync in Node.js). Callers must await.
   */
  async hashSha256(value: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
  }

  async verifySha256(value: string, encryptedValue: string, publicKey: string): Promise<boolean> {
    try {
      // The original uses Node.js createVerify with SHA256 + RSA public key verification.
      // In Workers, we use the Web Crypto API to verify the signature.
      const publicKeyBuffer = this._base64ToArrayBuffer(publicKey);

      // Import the public key using Web Crypto API
      const cryptoKey = await crypto.subtle.importKey(
        'spki',
        publicKeyBuffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      );

      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(value);
      const signatureBuffer = this._base64ToArrayBuffer(encryptedValue);

      return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signatureBuffer, dataBuffer);
    } catch {
      return false;
    }
  }

  async hashSha1(value: string | Uint8Array): Promise<Uint8Array> {
    let data: Uint8Array;
    if (typeof value === 'string') {
      data = new TextEncoder().encode(value);
    } else {
      data = value;
    }
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    return new Uint8Array(hashBuffer);
  }

  async hashFile(data: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
    // In Workers there is no filesystem, so hashFile operates on data directly
    // instead of reading from a file path. Callers should pass the file content.
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    return new Uint8Array(hashBuffer);
  }

  randomBytesAsText(bytes: number): string {
    const randomData = crypto.getRandomValues(new Uint8Array(bytes));
    // Convert to base64 and strip non-alphanumeric characters
    return btoa(String.fromCharCode(...randomData)).replaceAll(/\W/g, '');
  }

  async signJwt(
    payload: Record<string, unknown>,
    secret: string,
    options?: { expiresIn?: string | number },
  ): Promise<string> {
    const secretKey = new TextEncoder().encode(secret);
    let builder = new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt();

    if (options?.expiresIn) {
      if (typeof options.expiresIn === 'number') {
        // Treat as seconds
        builder = builder.setExpirationTime(Math.floor(Date.now() / 1000) + options.expiresIn);
      } else {
        builder = builder.setExpirationTime(options.expiresIn);
      }
    }

    return builder.sign(secretKey);
  }

  async verifyJwt<T = Record<string, unknown>>(token: string, secret: string): Promise<T> {
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ['HS256'] });
    return payload as T;
  }

  /**
   * Convert a base64 string to an ArrayBuffer
   */
  private _base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
