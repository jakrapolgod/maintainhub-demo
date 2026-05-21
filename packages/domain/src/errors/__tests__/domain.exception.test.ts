import { DomainException } from '../domain.exception'

describe('DomainException', () => {
  it('is an instance of Error', () => {
    expect(new DomainException('oops', 'SOME_CODE')).toBeInstanceOf(Error)
  })

  it('exposes the message', () => {
    expect(new DomainException('something went wrong', 'CODE').message).toBe('something went wrong')
  })

  it('exposes the code', () => {
    expect(new DomainException('msg', 'MY_CODE').code).toBe('MY_CODE')
  })

  it('name is "DomainException"', () => {
    expect(new DomainException('msg', 'CODE').name).toBe('DomainException')
  })

  it('instanceof check works after transpilation', () => {
    const err = new DomainException('msg', 'CODE')
    expect(err instanceof DomainException).toBe(true)
  })

  it('can be caught as DomainException', () => {
    let caught: unknown
    try {
      throw new DomainException('thrown', 'THROWN')
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(DomainException)
    expect((caught as DomainException).code).toBe('THROWN')
  })
})
