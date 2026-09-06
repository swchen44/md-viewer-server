import { describe, it, expect, vi } from 'vitest'
import { restartForRotatedToken } from '../../../src/server/commands/rotate-restart.js'

describe('restartForRotatedToken', () => {
  it('starts a fresh daemon when the old one stopped successfully', async () => {
    const stop = vi.fn().mockResolvedValue({ outcome: 'stopped', via: 'api' })
    const start = vi.fn().mockResolvedValue({ outcome: 'started', port: 4173, token: 'abc' })

    const result = await restartForRotatedToken(
      { roots: ['/tmp/a'], port: 4173, debug: false },
      { stop, start }
    )

    expect(stop).toHaveBeenCalledOnce()
    expect(start).toHaveBeenCalledWith({ roots: ['/tmp/a'], port: 4173, debug: false })
    expect(result).toEqual({
      outcome: 'restarted',
      startResult: { outcome: 'started', port: 4173, token: 'abc' },
    })
  })

  it('reports stop-failed and does not start a new daemon when the old one could not be stopped', async () => {
    const stop = vi.fn().mockResolvedValue({ outcome: 'stop-failed' })
    const start = vi.fn()

    const result = await restartForRotatedToken(
      { roots: ['/tmp/a'], port: 4173, debug: false },
      { stop, start }
    )

    expect(stop).toHaveBeenCalledOnce()
    expect(start).not.toHaveBeenCalled()
    expect(result).toEqual({ outcome: 'stop-failed', stopResult: { outcome: 'stop-failed' } })
  })

  it('treats any non-stopped outcome (e.g. not-running) as a failure to restart', async () => {
    const stop = vi.fn().mockResolvedValue({ outcome: 'not-running' })
    const start = vi.fn()

    const result = await restartForRotatedToken(
      { roots: ['/tmp/a'], port: 4173, debug: false },
      { stop, start }
    )

    expect(start).not.toHaveBeenCalled()
    expect(result.outcome).toBe('stop-failed')
  })
})
