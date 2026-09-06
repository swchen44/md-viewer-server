import { build } from 'esbuild'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

console.log('Building frontend...')
execSync('vite build', { cwd: root, stdio: 'inherit' })

await build({
  entryPoints: [path.join(root, 'src', 'server', 'entry.js')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: path.join(root, 'dist', 'bundle.js'),
  define: {
    __MVS_BUNDLED_VERSION__: JSON.stringify(pkg.version),
  },
  banner: {
    js: [
      '#!/usr/bin/env node',
      "import { createRequire as __mvsCreateRequire } from 'node:module';",
      'const require = __mvsCreateRequire(import.meta.url);',
    ].join('\n'),
  },
})

// regex-timeout.js spawns this script via `new Worker(path.join(__dirname, 'regex-worker.js'))`
// at runtime, using a plain string path rather than a static import — esbuild does not follow
// that reference, so it must be built as its own entry point and shipped alongside bundle.js
// (in the same directory) for the offline single-directory distribution to work.
await build({
  entryPoints: [path.join(root, 'src', 'server', 'regex-worker.js')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: path.join(root, 'dist', 'regex-worker.js'),
})

console.log('Built dist/frontend/, dist/bundle.js, and dist/regex-worker.js')
