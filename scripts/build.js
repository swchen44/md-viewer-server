import { build } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

await build({
  entryPoints: [path.join(root, 'src', 'server', 'entry.js')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: path.join(root, 'dist', 'bundle.js'),
  banner: { js: '#!/usr/bin/env node' },
  external: ['express', 'pino'],
})

console.log('Built dist/bundle.js')
