#!/usr/bin/env node
import { parseArgs } from '../src/server/commands/cli-args.js'
import { runStart } from '../src/server/commands/start.js'
import { runStatus } from '../src/server/commands/status.js'
import { runStop } from '../src/server/commands/stop.js'
import { restartForRotatedToken } from '../src/server/commands/rotate-restart.js'
import { runDoctor } from '../src/server/doctor.js'
import { getConfigDir, getStateDir } from '../src/server/xdg-paths.js'
import { readConfig, rotateToken } from '../src/server/config.js'
import { checkHealth } from '../src/server/daemon-utils.js'

function printLinks(ips, port, token) {
  const targets = ips.length > 0 ? ips : ['127.0.0.1']
  for (const ip of targets) {
    console.log(`  http://${ip}:${port}?token=${token}`)
  }
}

function printStartResult(result) {
  for (const root of result.skippedRoots ?? []) {
    console.warn(`Skipped root (not found or not readable): ${root}`)
  }

  if (result.outcome === 'no-valid-roots') {
    console.error('No valid roots to serve. Aborting.')
    process.exitCode = 1
  } else if (result.outcome === 'already-running') {
    console.log(`Already running on port ${result.port} (uptime ${result.uptime}s).`)
    printLinks(result.ips, result.port, result.token)
  } else if (result.outcome === 'start-failed') {
    console.error('Server did not become healthy after starting. Check server.log.')
    process.exitCode = 1
  } else if (result.outcome === 'started') {
    console.log('Started.')
    printLinks(result.ips, result.port, result.token)
  }
}

function printStatusResult(result) {
  if (result.outcome === 'not-configured') {
    console.log('Not configured yet. Run `md-viewer-server start --root <path>` first.')
  } else if (result.outcome === 'not-running') {
    console.log(`Not running (configured port: ${result.port}).`)
  } else if (result.outcome === 'running') {
    console.log(`Running on port ${result.port}, uptime ${result.uptime}s.`)
    console.log(`Roots: ${result.roots.join(', ')}`)
    printLinks(result.ips, result.port, result.token)
  }
}

function printStopResult(result) {
  if (result.outcome === 'not-configured') {
    console.log('Not configured; nothing to stop.')
  } else if (result.outcome === 'not-running') {
    console.log('Not running.')
  } else if (result.outcome === 'stopped') {
    console.log(`Stopped (via ${result.via}).`)
  } else if (result.outcome === 'stop-failed') {
    console.error('Failed to stop the server.')
    process.exitCode = 1
  }
}

async function main() {
  const { command, roots, port, debug, rotateToken: shouldRotateToken } = parseArgs(
    process.argv.slice(2)
  )

  if (command === 'start') {
    let wasRunningBeforeRotate = false
    if (shouldRotateToken) {
      try {
        const rotated = rotateToken(getConfigDir())
        console.log(`Token rotated: ${rotated.token}`)
        wasRunningBeforeRotate = Boolean(await checkHealth(rotated.port))
      } catch (err) {
        console.error(err.message)
        process.exitCode = 1
        return
      }
    }
    if (wasRunningBeforeRotate) {
      // The running daemon read config.json once at startup, so the
      // rotated token has no effect on it yet. Restart so the freshly
      // spawned process picks up the new token from the updated config.
      const restart = await restartForRotatedToken({ roots, port, debug })
      if (restart.outcome === 'stop-failed') {
        console.error(
          'Token rotated in config.json, but the running daemon could not be stopped to apply it.'
        )
        process.exitCode = 1
        return
      }
      console.log('Token rotated; daemon restarted to apply it.')
      printStartResult(restart.startResult)
      return
    }
    printStartResult(await runStart({ roots, port, debug }))
  } else if (command === 'status') {
    printStatusResult(await runStatus())
  } else if (command === 'stop') {
    printStopResult(await runStop())
  } else if (command === 'doctor') {
    const configDir = getConfigDir()
    const stateDir = getStateDir()
    const config = readConfig(configDir)
    const results = await runDoctor({
      configDir,
      stateDir,
      roots: config?.roots ?? [],
      port: config?.port ?? 4173,
    })
    for (const r of results) {
      const icon = r.status === 'ok' ? '✓' : r.status === 'warn' ? '⚠' : '✗'
      console.log(`${icon} ${r.name}: ${r.message}`)
    }
    if (results.some((r) => r.status === 'fail')) process.exitCode = 1
  } else {
    console.error(
      `Unknown command: ${command}\nUsage: md-viewer-server <start|stop|status|doctor> [options]`
    )
    process.exitCode = 1
  }
}

main()
