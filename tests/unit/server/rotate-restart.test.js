import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startWithRotatedToken } from '../../../src/server/commands/rotate-restart.js'

describe('startWithRotatedToken', () => {
  let realRoot

  beforeEach(() => {
    realRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rotate-root-'))
  })

  afterEach(() => {
    fs.rmSync(realRoot, { recursive: true, force: true })
  })

  function deps({ running, stop, start, rotate }) {
    return {
      stop,
      start,
      rotate,
      isDaemonRunning: vi.fn().mockResolvedValue(running),
      configDir: '/tmp/fake-config-dir',
    }
  }

  it('stops the old daemon BEFORE rotating, so the graceful API stop uses the token that daemon holds', async () => {
    const order = []
    const stop = vi.fn(async () => {
      order.push('stop')
      return { outcome: 'stopped', via: 'api' }
    })
    const rotate = vi.fn(() => {
      order.push('rotate')
      return { token: '9999' }
    })
    const start = vi.fn(async () => {
      order.push('start')
      return { outcome: 'started', port: 4173, token: '9999' }
    })

    const result = await startWithRotatedToken(
      { roots: [realRoot], port: 4173, debug: false },
      deps({ running: true, stop, start, rotate })
    )

    expect(order).toEqual(['stop', 'rotate', 'start'])
    expect(start).toHaveBeenCalledWith({ roots: [realRoot], port: 4173, debug: false })
    expect(result).toEqual({
      outcome: 'rotated',
      rotated: { token: '9999' },
      startResult: { outcome: 'started', port: 4173, token: '9999' },
      wasRunning: true,
    })
  })

  it('rotates then starts without stopping when no daemon is running', async () => {
    const stop = vi.fn()
    const rotate = vi.fn(() => ({ token: '9999' }))
    const start = vi.fn().mockResolvedValue({ outcome: 'started', port: 4173, token: '9999' })

    const result = await startWithRotatedToken(
      { roots: [realRoot], port: 4173, debug: false },
      deps({ running: false, stop, start, rotate })
    )

    expect(stop).not.toHaveBeenCalled()
    expect(rotate).toHaveBeenCalledOnce()
    expect(result.outcome).toBe('rotated')
    expect(result.wasRunning).toBe(false)
  })

  it('does not rotate or start when the old daemon could not be stopped', async () => {
    const stop = vi.fn().mockResolvedValue({ outcome: 'stop-failed' })
    const rotate = vi.fn()
    const start = vi.fn()

    const result = await startWithRotatedToken(
      { roots: [realRoot], port: 4173, debug: false },
      deps({ running: true, stop, start, rotate })
    )

    expect(rotate).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
    expect(result).toEqual({ outcome: 'stop-failed', stopResult: { outcome: 'stop-failed' } })
  })

  it('aborts on invalid roots without rotating, stopping or starting anything', async () => {
    const stop = vi.fn()
    const rotate = vi.fn()
    const start = vi.fn()
    const isDaemonRunning = vi.fn().mockResolvedValue(true)

    const result = await startWithRotatedToken(
      { roots: ['/definitely/not/a/real/path'], port: 4173, debug: false },
      { stop, start, rotate, isDaemonRunning, configDir: '/tmp/fake-config-dir' }
    )

    expect(result).toEqual({
      outcome: 'no-valid-roots',
      skippedRoots: ['/definitely/not/a/real/path'],
    })
    expect(isDaemonRunning).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
    expect(rotate).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
  })

  it('aborts when no roots were given at all', async () => {
    const stop = vi.fn()
    const rotate = vi.fn()
    const start = vi.fn()

    const result = await startWithRotatedToken(
      { roots: [], port: 4173, debug: false },
      deps({ running: true, stop, start, rotate })
    )

    expect(result.outcome).toBe('no-valid-roots')
    expect(rotate).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
  })
})
