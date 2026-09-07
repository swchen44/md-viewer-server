import { describe, it, expect, vi, afterEach } from 'vitest'
import { copyText } from '../../src/frontend/clipboard.js'

describe('copyText', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses navigator.clipboard.writeText when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await copyText('hello')
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('falls back to execCommand when navigator.clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    const execCommand = vi.fn().mockReturnValue(true)
    document.execCommand = execCommand
    await copyText('hello')
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('falls back to execCommand when navigator.clipboard.writeText throws', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const execCommand = vi.fn().mockReturnValue(true)
    document.execCommand = execCommand
    await copyText('hello')
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('throws when both the clipboard API and execCommand fail', async () => {
    vi.stubGlobal('navigator', {})
    document.execCommand = vi.fn().mockReturnValue(false)
    await expect(copyText('hello')).rejects.toThrow()
  })
})
