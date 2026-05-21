/**
 * Thrown by the application / domain layer for business rule violations.
 * The global error handler in app.ts maps this to an HTTP response using
 * statusCode and code, so route handlers can throw freely without touching
 * reply directly.
 */
export class DomainException extends Error {
  constructor(
    message: string,
    public readonly code: string = 'DOMAIN_ERROR',
    public readonly statusCode: number = 422,
  ) {
    super(message)
    this.name = 'DomainException'
    // Restore prototype chain so instanceof checks work after transpilation
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
