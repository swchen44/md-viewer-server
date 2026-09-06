import { describe, it, expect, beforeEach } from 'vitest'
import { initAuthFromUrl, getStoredToken } from '../../src/frontend/auth.js'

describe('initAuthFromUrl', () => {
  beforeEach(() => {
    sessionStorage.clear()
    window.history.replaceState(null, '', '/')
  })

  it('reads token from URL, stores it, and clears the URL', () => {
    window.history.replaceState(null, '', '/?token=1234')
    const token = initAuthFromUrl()
    expect(token).toBe('1234')
    expect(sessionStorage.getItem('mvs-token')).toBe('1234')
    expect(window.location.search).toBe('')
  })

  it('preserves other query params while removing only token', () => {
    window.history.replaceState(null, '', '/?token=1234&foo=bar')
    initAuthFromUrl()
    expect(window.location.search).toBe('?foo=bar')
  })

  it('prefers an existing sessionStorage token over a URL token', () => {
    sessionStorage.setItem('mvs-token', '9999')
    window.history.replaceState(null, '', '/?token=1234')
    const token = initAuthFromUrl()
    expect(token).toBe('9999')
  })

  it('returns null when there is no token anywhere', () => {
    expect(initAuthFromUrl()).toBeNull()
  })
})

describe('getStoredToken', () => {
  beforeEach(() => sessionStorage.clear())

  it('returns null when nothing is stored', () => {
    expect(getStoredToken()).toBeNull()
  })

  it('returns the stored token', () => {
    sessionStorage.setItem('mvs-token', '5678')
    expect(getStoredToken()).toBe('5678')
  })
})
