import { runStop } from './stop.js'
import { runStart, validateRoots } from './start.js'
import { readConfig, rotateToken } from '../config.js'
import { getConfigDir } from '../xdg-paths.js'
import { checkHealth } from '../daemon-utils.js'

async function defaultIsDaemonRunning(configDir) {
  const config = readConfig(configDir)
  if (!config?.port) return false
  return Boolean(await checkHealth(config.port))
}

/**
 * Runs `start --rotate-token` as one ordered transaction:
 *
 *   1. validate roots  — an unserveable request must abort before anything is
 *      mutated. Rotating and stopping first (the old order) left the user with
 *      a destroyed daemon, a changed token and a "restarted" success message
 *      when `--root` was missing or unreadable.
 *   2. stop the old daemon (only if one is running) — *before* rotating, so
 *      `runStop` authenticates to /api/shutdown with the token that daemon
 *      actually holds. Rotating first guaranteed a 401 and silently demoted
 *      every rotation to the SIGTERM/pid-file fallback, which `doctor` itself
 *      treats as unreliable.
 *   3. rotate the token in config.json.
 *   4. start a fresh daemon, which reads the rotated token.
 *
 * If the stop fails, nothing is rotated and no daemon is started: the old
 * process is still alive holding the old token, so both a rotation and a
 * `runStart` (which would report "already running" next to a new token) would
 * be lies.
 *
 * Collaborators are injectable so unit tests can drive each branch without a
 * real spawned process.
 *
 * Outcomes:
 *   - `{outcome: 'no-valid-roots', skippedRoots}`  nothing touched
 *   - `{outcome: 'stop-failed', stopResult}`       nothing rotated, nothing started
 *   - `{outcome: 'rotated', rotated, startResult, wasRunning}`
 */
export async function startWithRotatedToken(
  { roots, port, debug },
  {
    stop = runStop,
    start = runStart,
    rotate = rotateToken,
    isDaemonRunning = defaultIsDaemonRunning,
    configDir = getConfigDir(),
  } = {}
) {
  const { validRoots, skippedRoots } = validateRoots(roots)
  if (validRoots.length === 0) {
    return { outcome: 'no-valid-roots', skippedRoots }
  }

  const wasRunning = await isDaemonRunning(configDir)

  if (wasRunning) {
    const stopResult = await stop()
    if (stopResult.outcome !== 'stopped') {
      return { outcome: 'stop-failed', stopResult }
    }
  }

  const rotated = rotate(configDir)
  const startResult = await start({ roots, port, debug })
  return { outcome: 'rotated', rotated, startResult, wasRunning }
}
