import { describe, it, expect } from 'vitest'
import { parseArgs } from '../../../src/server/commands/cli-args.js'

describe('parseArgs', () => {
  it('parses the command name', () => {
    expect(parseArgs(['status']).command).toBe('status')
  })

  it('collects repeated --root flags', () => {
    const result = parseArgs(['start', '--root', '/a', '--root', '/b'])
    expect(result.roots).toEqual(['/a', '/b'])
  })

  it('parses --port as a number', () => {
    const result = parseArgs(['start', '--root', '/a', '--port', '5000'])
    expect(result.port).toBe(5000)
  })

  it('leaves port undefined when not given', () => {
    const result = parseArgs(['start', '--root', '/a'])
    expect(result.port).toBeUndefined()
  })

  it('parses --debug as a boolean flag', () => {
    expect(parseArgs(['start', '--root', '/a', '--debug']).debug).toBe(true)
    expect(parseArgs(['start', '--root', '/a']).debug).toBe(false)
  })
})
