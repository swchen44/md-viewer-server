import { runStop } from './stop.js'
import { runStart } from './start.js'

/**
 * Restarts the daemon after a token rotation so the freshly spawned process
 * picks up the new token from config.json. The running daemon only read
 * config.json once at startup, so rotating the file on disk has no effect on
 * it until it's restarted.
 *
 * Stops the old daemon first. If that fails, refuses to start a new one:
 * the old process would still be alive, so `runStart`'s health check would
 * detect it and report "already running" alongside the freshly rotated
 * token, while the still-live old process actually only accepts the old
 * token — a false success.
 *
 * `stop`/`start` are injectable so unit tests can drive the stop-failed path
 * without a real spawned process.
 */
export async function restartForRotatedToken(
  { roots, port, debug },
  { stop = runStop, start = runStart } = {}
) {
  const stopResult = await stop()
  if (stopResult.outcome !== 'stopped') {
    return { outcome: 'stop-failed', stopResult }
  }
  const startResult = await start({ roots, port, debug })
  return { outcome: 'restarted', startResult }
}
