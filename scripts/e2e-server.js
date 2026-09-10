import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const bundlePath = path.join(projectRoot, 'dist', 'bundle.js')
const frontendPath = path.join(projectRoot, 'dist', 'frontend', 'index.html')

const seedFiles = {
  'README.md': `# E2E Fixture Heading\n\nThis is a deterministic Markdown fixture.\n\n## Setup\n\ninstall dependencies\n`,
  'notes.md': `# Notes\n\nDeterministic fixture notes.\n`,
  'sandbox.html': `<!doctype html>\n<html lang="en">\n  <body>\n    <h1>Sandbox fixture</h1>\n    <script>document.body.dataset.fixture = 'sandbox'</script>\n  </body>\n</html>\n`,
}

function parsePort(argv) {
  const portFlagIndex = argv.indexOf('--port')
  const value = argv[portFlagIndex + 1]
  const port = Number(value)

  if (
    portFlagIndex === -1 ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535
  ) {
    throw new Error('Expected a numeric --port value between 1 and 65535.')
  }

  return port
}

function assertBuildOutput() {
  const missingPaths = [bundlePath, frontendPath].filter((filePath) => !fs.existsSync(filePath))
  if (missingPaths.length > 0) {
    throw new Error(`E2E build output is missing: ${missingPaths.join(', ')}. Run npm run build first.`)
  }
}

function createFixture(port) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-viewer-server-e2e-'))
  const configHome = path.join(tempDir, 'config')
  const stateHome = path.join(tempDir, 'state')
  const rootPath = path.join(tempDir, 'root')
  const configDir = path.join(configHome, 'md-viewer-server')

  fs.mkdirSync(configDir, { recursive: true })
  fs.mkdirSync(stateHome, { recursive: true })
  fs.mkdirSync(rootPath, { recursive: true })

  fs.writeFileSync(
    path.join(configDir, 'config.json'),
    JSON.stringify(
      {
        token: '1234',
        port,
        roots: [rootPath],
        plantumlServerUrl: 'https://www.plantuml.com/plantuml',
        privacyMode: false,
        blockRemoteContent: false,
        sendToPlantUmlServer: false,
        allowHtmlScripts: false,
        bakOnSave: false,
        customCssChoice: 'user1',
        customCssUser1: '',
        customCssUser2: '',
        checkForUpdates: false,
      },
      null,
      2
    )
  )

  for (const [relPath, content] of Object.entries(seedFiles)) {
    fs.writeFileSync(path.join(rootPath, relPath), content)
  }

  return { tempDir, configHome, stateHome }
}

function main() {
  let port
  try {
    port = parsePort(process.argv.slice(2))
    assertBuildOutput()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
    return
  }

  const fixture = createFixture(port)
  const child = spawn(process.execPath, [bundlePath], {
    env: {
      ...process.env,
      XDG_CONFIG_HOME: fixture.configHome,
      XDG_STATE_HOME: fixture.stateHome,
    },
    stdio: 'inherit',
  })

  let stopping = false
  function stop(signal) {
    if (stopping) return
    stopping = true
    child.kill(signal)
  }

  process.on('SIGTERM', () => stop('SIGTERM'))
  process.on('SIGINT', () => stop('SIGINT'))

  child.on('error', (error) => {
    console.error(`Failed to start E2E server: ${error.message}`)
  })
  child.on('exit', (code, signal) => {
    fs.rmSync(fixture.tempDir, { recursive: true, force: true })
    if (signal) {
      process.exitCode = 1
      return
    }
    process.exitCode = code ?? 1
  })
}

main()
