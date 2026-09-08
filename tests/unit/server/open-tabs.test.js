import { describe, it, expect } from 'vitest'
import { createOpenTabsRegistry } from '../../../src/server/open-tabs.js'

describe('createOpenTabsRegistry', () => {
  it('starts empty', () => {
    expect(createOpenTabsRegistry().list()).toEqual([])
  })

  it('open adds an entry; list reflects it', () => {
    const registry = createOpenTabsRegistry()
    registry.open(0, 'a.md')
    expect(registry.list()).toEqual([{ rootId: 0, relPath: 'a.md' }])
  })

  it('open is idempotent (no duplicate entries)', () => {
    const registry = createOpenTabsRegistry()
    registry.open(0, 'a.md')
    registry.open(0, 'a.md')
    expect(registry.list()).toHaveLength(1)
  })

  it('close removes an entry', () => {
    const registry = createOpenTabsRegistry()
    registry.open(0, 'a.md')
    registry.close(0, 'a.md')
    expect(registry.list()).toEqual([])
  })

  it('close on a non-existent entry is a no-op, not an error', () => {
    const registry = createOpenTabsRegistry()
    expect(() => registry.close(0, 'nope.md')).not.toThrow()
  })

  it('distinguishes entries by both rootId and relPath', () => {
    const registry = createOpenTabsRegistry()
    registry.open(0, 'a.md')
    registry.open(1, 'a.md')
    expect(registry.list()).toHaveLength(2)
  })
})
