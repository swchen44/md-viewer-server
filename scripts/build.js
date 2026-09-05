import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

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

console.log('Built dist/bundle.js')
