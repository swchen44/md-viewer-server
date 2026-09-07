import { describe, it, expect, vi } from 'vitest'
import { checkLatestVersion } from '../../../src/server/version-check.js'

describe('checkLatestVersion', () => {
  it('returns updateAvailable: true when the registry reports a newer version', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '9.9.9' }),
    })
    const result = await checkLatestVersion({ currentVersion: '0.1.0', fetchImpl })
    expect(result).toEqual({ latestVersion: '9.9.9', updateAvailable: true })
  })

  it('returns updateAvailable: false when already on the latest version', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '0.1.0' }),
    })
    const result = await checkLatestVersion({ currentVersion: '0.1.0', fetchImpl })
    expect(result).toEqual({ latestVersion: '0.1.0', updateAvailable: false })
  })

  it('returns null (does not throw) when the registry is unreachable', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network error'))
    const result = await checkLatestVersion({ currentVersion: '0.1.0', fetchImpl })
    expect(result).toBeNull()
  })

  it('returns null when the registry responds with a non-200 status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    const result = await checkLatestVersion({ currentVersion: '0.1.0', fetchImpl })
    expect(result).toBeNull()
  })

  it('returns null when the response body has no usable version field', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    const result = await checkLatestVersion({ currentVersion: '0.1.0', fetchImpl })
    expect(result).toBeNull()
  })

  it('reports an update available for a prerelease current version behind a plain latest version', async () => {
    // Repro from the Codex review: naive `.split('.').map(Number)` turns
    // '1.2.3-beta.1'.split('.') into ['1','2','3-beta','1'], and
    // Number('3-beta') is NaN, silently breaking the comparison.
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.2.4' }),
    })
    const result = await checkLatestVersion({ currentVersion: '1.2.3-beta.1', fetchImpl })
    expect(result).toEqual({ latestVersion: '1.2.4', updateAvailable: true })
  })

  it('treats a plain version as newer than the same major.minor.patch with a prerelease tag', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.2.3' }),
    })
    const result = await checkLatestVersion({ currentVersion: '1.2.3-beta.1', fetchImpl })
    expect(result).toEqual({ latestVersion: '1.2.3', updateAvailable: true })
  })

  it('reports no update available when versions (including equal prerelease tags) are equal', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.2.3-beta.1' }),
    })
    const result = await checkLatestVersion({ currentVersion: '1.2.3-beta.1', fetchImpl })
    expect(result).toEqual({ latestVersion: '1.2.3-beta.1', updateAvailable: false })
  })

  it('returns null when the registry version string is not valid SemVer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: 'not-a-version' }),
    })
    const result = await checkLatestVersion({ currentVersion: '0.1.0', fetchImpl })
    expect(result).toBeNull()
  })
})
