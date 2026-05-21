/**
 * Jest CJS mock for the `meilisearch` ESM-only package.
 *
 * The Meilisearch client is stateless — it just makes HTTP calls.
 * In the test environment we stub it so the Fastify app can boot
 * without a live Meilisearch server.
 *
 * Tests that exercise search functionality should mock the
 * SearchAssetsHandler / AssetSearchSyncService directly.
 */

const indexStub = {
  search: jest.fn().mockResolvedValue({ hits: [], estimatedTotalHits: 0, processingTimeMs: 0 }),
  addDocuments: jest.fn().mockResolvedValue({}),
  deleteDocument: jest.fn().mockResolvedValue({}),
  updateFilterableAttributes: jest.fn().mockResolvedValue({}),
  updateSortableAttributes: jest.fn().mockResolvedValue({}),
  updateSearchableAttributes: jest.fn().mockResolvedValue({}),
}

export class Meilisearch {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor, @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
  constructor(_opts?: unknown) {}

  // eslint-disable-next-line class-methods-use-this
  index(_name: string) {
    return indexStub
  }

  // eslint-disable-next-line class-methods-use-this
  createIndex(_name: string, _opts?: unknown) {
    return Promise.resolve({})
  }
}

export default Meilisearch
