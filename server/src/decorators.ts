/**
 * Stub decorators module for Cloudflare Workers conversion.
 *
 * The original NestJS decorators have been removed. This file provides
 * no-op stubs so that existing code (controllers, repositories, schema tables)
 * that still references these decorators can compile without errors.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

// ---------------------------------------------------------------------------
// Controller / endpoint decorators (NestJS)
// ---------------------------------------------------------------------------

export class HistoryBuilder {
  added(_v: string) { return this; }
  beta(_v: string) { return this; }
  stable(_v: string) { return this; }
  deprecated(_v: string, _opts?: any) { return this; }
}

export function Endpoint(_opts: any): MethodDecorator {
  return () => {};
}

// ---------------------------------------------------------------------------
// SQL generation decorators (used by repositories)
// ---------------------------------------------------------------------------

export const GENERATE_SQL_KEY = Symbol('GENERATE_SQL_KEY');

export type GenerateSqlQueries = {
  name?: string;
  params: any[];
  stream?: boolean;
};

export function GenerateSql(..._args: any[]): MethodDecorator {
  return () => {};
}

export enum DummyValue {
  UUID = '00000000-0000-0000-0000-000000000000',
  STRING = '',
  NUMBER = 0,
  BOOLEAN = false,
  DATE = '2024-01-01T00:00:00.000Z',
  BUFFER = '',
}

// ---------------------------------------------------------------------------
// Telemetry decorator
// ---------------------------------------------------------------------------

export function Telemetry(_opts?: any): ClassDecorator {
  return (target) => target;
}

// ---------------------------------------------------------------------------
// Schema table decorators (sql-tools style)
// ---------------------------------------------------------------------------

export function UpdatedAtTrigger(_name: string): ClassDecorator {
  return (target) => target;
}

export function UpdateIdColumn(_opts?: any): PropertyDecorator {
  return () => {};
}

export function CreateIdColumn(_opts?: any): PropertyDecorator {
  return () => {};
}

export function PrimaryGeneratedUuidV7Column(_opts?: any): PropertyDecorator {
  return () => {};
}
