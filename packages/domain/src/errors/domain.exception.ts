/**
 * Base exception for domain rule violations.
 *
 * Deliberately has no HTTP status code — that is an infrastructure concern
 * owned by the presentation layer. The `code` string is a machine-readable
 * discriminant that callers can map to whatever transport they need.
 */
export class DomainException extends Error {
  override readonly name = 'DomainException'

  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
    // Restore prototype chain so `instanceof DomainException` works after
    // transpilation to ES5 (ts-jest, older bundlers).
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
