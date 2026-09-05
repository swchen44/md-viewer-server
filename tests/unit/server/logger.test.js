import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createLogger } from '../../../src/server/logger.js'

describe('createLogger', () => {
  let dir
  let logFilePath

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'))
    logFilePath = path.join(dir, 'server.log')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('writes JSON lines with the message and level', () => {
    const logger = createLogger({ logFilePath, level: 'info' })
    logger.info({ requestId: 'abc123' }, 'server started')
    const lines = fs.readFileSync(logFilePath, 'utf8').trim().split('\n')
    const entry = JSON.parse(lines[0])
    expect(entry.msg).toBe('server started')
    expect(entry.requestId).toBe('abc123')
    expect(entry.level).toBe(30)
  })

  it('redacts the token field instead of logging it in plain text', () => {
    const logger = createLogger({ logFilePath, level: 'info' })
    logger.info({ token: '1234' }, 'auth attempt')
    const lines = fs.readFileSync(logFilePath, 'utf8').trim().split('\n')
    const entry = JSON.parse(lines[0])
    expect(entry.token).toBe('***')
  })

  it('does not write debug logs when level is info', () => {
    const logger = createLogger({ logFilePath, level: 'info' })
    logger.debug('should not appear')
    const content = fs.readFileSync(logFilePath, 'utf8')
    expect(content).toBe('')
  })
})
