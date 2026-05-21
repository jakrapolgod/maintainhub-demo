/**
 * PM-schedule routes barrel.
 *
 * Registers:
 *   - Analytics routes (static: /calendar, /upcoming, /compliance, /cost)
 *   - Action routes   (/:id/activate, /:id/deactivate, /:id/trigger, etc.)
 *   - CRUD routes     (/, /:id — registered last)
 *
 * Static paths are registered by crud.ts BEFORE the /:id dynamic route so
 * Fastify's radix router matches them correctly.
 */
import pmCrudRoutes from './crud.js'

export default pmCrudRoutes
