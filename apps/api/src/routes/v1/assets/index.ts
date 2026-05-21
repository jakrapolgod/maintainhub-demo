/**
 * Asset routes — CQRS-backed implementation.
 *
 * Mounts sub-plugins in strict order so static paths (/tree, /attention,
 * /search, /by-location, /import, /export, /labels/bulk) are matched before
 * the dynamic /:id parameter routes.
 *
 * Route map
 * ─────────
 * GET  /                     ← listAssets          (all roles)
 * GET  /tree                 ← getAssetTree         (all roles, Redis cache)
 * GET  /attention            ← getAssetsAttention   (all roles)
 * GET  /search               ← searchAssets         (all roles)
 * GET  /by-location          ← getByLocation        (all roles)
 * POST /import               ← bulkImport           (MANAGER/ADMIN)
 * GET  /export               ← exportAssets         (all roles)
 * POST /labels/bulk          ← bulkLabels           (all roles)
 *
 * GET  /categories           ← listCategories       (legacy AssetService)
 * POST /categories           ← createCategory
 * PATCH /categories/:id      ← updateCategory
 * DELETE /categories/:id     ← deleteCategory
 *
 * GET  /:id                  ← getAsset             (all roles)
 * POST /                     ← createAsset          (MANAGER/ADMIN)
 * PATCH /:id                 ← updateAsset          (MANAGER/ADMIN)
 * DELETE /:id                ← deleteAsset          (ADMIN)
 * POST /:id/status           ← changeStatus         (MANAGER/ADMIN)
 * POST /:id/decommission     ← decommission         (ADMIN)
 * POST /:id/transfer         ← transfer             (MANAGER/ADMIN)
 * GET  /:id/metrics          ← getMetrics           (all roles)
 * GET  /:id/work-orders      ← getWOs               (all roles)
 * GET  /:id/pm-schedules     ← getPMSchedules       (all roles)
 * GET  /:id/documents        ← listDocuments        (all roles)
 * POST /:id/documents        ← uploadDocument       (MANAGER/ADMIN)
 * DELETE /:id/documents/:docId  ← deleteDocument    (MANAGER/ADMIN)
 * GET  /:id/qr               ← getQRCode            (all roles)
 * GET  /:id/label            ← getLabel             (all roles)
 */
import type { FastifyPluginAsync } from 'fastify'

import categoryRoutes from './categories.js'
import importExportRoutes from './import-export.js'
import qrRoutes from './qr.js'
import crudRoutes from './crud.js'
import actionRoutes from './actions.js'
import subResourceRoutes from './sub-resources.js'
import documentRoutes from './documents.js'

const assetRoutes: FastifyPluginAsync = async (fastify) => {
  // ── 1. Static-path sub-plugins (must be before /:id) ─────────────────────
  // /categories, /import, /export, /labels/bulk are all static prefixes.
  void fastify.register(categoryRoutes, { prefix: '/categories' })
  void fastify.register(importExportRoutes) // POST /import, GET /export
  void fastify.register(qrRoutes) // GET /labels/bulk (static) + /:id/qr, /:id/label

  // ── 2. CRUD + collection queries ─────────────────────────────────────────
  // GET /, POST /, GET /:id, PATCH /:id, DELETE /:id
  // GET /tree, /attention, /search, /by-location  (all static, registered first inside crudRoutes)
  void fastify.register(crudRoutes)

  // ── 3. Sub-resource plugins (all prefixed under /:id/…) ─────────────────
  void fastify.register(actionRoutes) // POST /:id/status, /decommission, /transfer
  void fastify.register(subResourceRoutes) // GET /:id/metrics, /work-orders, /pm-schedules
  void fastify.register(documentRoutes) // GET/POST/DELETE /:id/documents
}

export default assetRoutes
