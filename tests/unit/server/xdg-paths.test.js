import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { getConfigDir, getStateDir } from '../../../src/server/xdg-paths.js'

describe('getConfigDir', () => {
  it('uses XDG_CONFIG_HOME when set', () => {
    const dir = getConfigDir({ XDG_CONFIG_HOME: '/custom/config' }, '/home/user')
    expect(dir).toBe(path.join('/custom/config', 'md-viewer-server'))
  })

  it('falls back to ~/.config when XDG_CONFIG_HOME is not set', () => {
    const dir = getConfigDir({}, '/home/user')
    expect(dir).toBe(path.join('/home/user', '.config', 'md-viewer-server'))
  })
})

describe('getStateDir', () => {
  it('uses XDG_STATE_HOME when set', () => {
    const dir = getStateDir({ XDG_STATE_HOME: '/custom/state' }, '/home/user')
    expect(dir).toBe(path.join('/custom/state', 'md-viewer-server'))
  })

  it('falls back to ~/.local/state when XDG_STATE_HOME is not set', () => {
    const dir = getStateDir({}, '/home/user')
    expect(dir).toBe(path.join('/home/user', '.local', 'state', 'md-viewer-server'))
  })
})
