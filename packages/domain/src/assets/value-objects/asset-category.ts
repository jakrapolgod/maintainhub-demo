import { DomainException } from '../../errors/domain.exception.js'

/**
 * AssetCategory — a read-model value object representing a node in the
 * category hierarchy (e.g. Equipment → Rotating Equipment → Pump).
 *
 * Categories form a tree: each node has an optional parent, enabling
 * UI components to render a cascading selector and analytics to group
 * assets by broad or narrow categories.
 *
 * This is intentionally a thin value object — category CRUD belongs to a
 * separate AssetCategory aggregate root, not the Asset.  The Asset stores
 * only the `categoryId` foreign key; this VO is used for enriched projections.
 */
export class AssetCategory {
  readonly id: string

  readonly name: string

  readonly parentCategoryId: string | undefined

  constructor(opts: { id: string; name: string; parentCategoryId?: string }) {
    if (!opts.id.trim()) {
      throw new DomainException('AssetCategory id must not be empty', 'INVALID_CATEGORY_ID')
    }
    if (!opts.name.trim()) {
      throw new DomainException('AssetCategory name must not be empty', 'INVALID_CATEGORY_NAME')
    }
    this.id = opts.id.trim()
    this.name = opts.name.trim()
    this.parentCategoryId = opts.parentCategoryId?.trim() || undefined
    Object.freeze(this)
  }

  /** True for top-level categories (no parent). */
  isRoot(): boolean {
    return this.parentCategoryId === undefined
  }

  equals(other: AssetCategory): boolean {
    return this.id === other.id
  }

  toString(): string {
    return this.name
  }
}
