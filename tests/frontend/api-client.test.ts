import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { apiFetch } from '../../src/frontend/api-client.js'

describe('apiFetch', () => {
  beforeEach(() => {
    sessionStorage.setItem('mvs-token', 'abc123')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('adds the X-Auth-Token header from sessionStorage', async () => {
    await apiFetch('/api/roots')
    expect(fetch).toHaveBeenCalledWith(
      '/api/roots',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Auth-Token': 'abc123' }),
      })
    )
  })

  it('merges caller-provided headers with the auth header', async () => {
    await apiFetch('/api/file', { headers: { 'Content-Type': 'application/json' } })
    expect(fetch).toHaveBeenCalledWith(
      '/api/file',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Auth-Token': 'abc123',
          'Content-Type': 'application/json',
        }),
      })
    )
  })

  it('works with no token stored (sends empty header rather than throwing)', async () => {
    sessionStorage.clear()
    await expect(apiFetch('/api/roots')).resolves.toBeDefined()
  })
})
