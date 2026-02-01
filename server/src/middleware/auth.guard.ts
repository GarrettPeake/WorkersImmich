/**
 * Stub auth guard module for Cloudflare Workers conversion.
 *
 * The original NestJS auth guard has been replaced by Hono middleware
 * (see src/middleware/auth.ts). This file provides no-op stubs so that
 * legacy NestJS controllers can compile without errors.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import type { AuthDto } from 'src/dtos/auth.dto';

export type AuthRequest = {
  user?: AuthDto;
  body?: any;
};

export type LoginDetails = {
  clientIp: string;
  isSecure: boolean;
  deviceType: string;
  deviceOS: string;
};

export function Auth(): ParameterDecorator {
  return () => {};
}

export function Authenticated(_opts?: any): MethodDecorator & ClassDecorator {
  return () => {};
}

export function FileResponse(): MethodDecorator {
  return () => {};
}

export function GetLoginDetails(): ParameterDecorator {
  return () => {};
}
