import { describe, it, expect, vi } from 'vitest'
import { createAuthMiddleware } from '../../../src/server/auth-middleware.js'

function buildReqRes(headerValue) {
  const req = { header: (name) => (name === 'X-Auth-Token' ? headerValue : undefined) }
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
  return { req, res }
}

describe('createAuthMiddleware', () => {
  it('calls next() when the token matches', () => {
    const middleware = createAuthMiddleware({ token: '1234' })
    const { req, res } = buildReqRes('1234')
    const next = vi.fn()
    middleware(req, res, next)
    expect(next).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(200)
  })

  it('rejects with 401 when the token does not match', () => {
    const middleware = createAuthMiddleware({ token: '1234' })
    const { req, res } = buildReqRes('wrong')
    const next = vi.fn()
    middleware(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ errorCode: 'UNAUTHORIZED' })
  })

  it('rejects with 401 when the header is missing', () => {
    const middleware = createAuthMiddleware({ token: '1234' })
    const { req, res } = buildReqRes(undefined)
    const next = vi.fn()
    middleware(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
  })
})
