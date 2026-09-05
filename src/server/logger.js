import pino from 'pino'
import { createRotatingStream } from './log-rotation.js'

export function createLogger({ logFilePath, level = 'info' }) {
  const stream = createRotatingStream(logFilePath)
  return pino(
    {
      level,
      redact: {
        paths: ['token'],
        censor: '***',
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    stream
  )
}
