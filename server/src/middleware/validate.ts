import { zValidator } from '@hono/zod-validator';

/**
 * Re-export the Hono Zod validator for use in route definitions.
 * Usage: app.get('/path', validate('query', MySchema), handler)
 */
export { zValidator as validate };
