import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { EDITORIAL_CSS, DEVELOPER_CSS } from '../../../src/server/custom-css-presets.js'

// The frontend keeps its own copy of these two constants (separate bundles, no
// shared-module mechanism). It is a .ts file, and this node-environment unit
// suite cannot import it (no TS/JSX-aware resolution here — a plain import of
// `src/frontend/custom-css-presets.js` fails to resolve), so the copy is read
// as source text and its template literals are extracted for comparison. The
// constants are plain backtick literals with no `${}` interpolation and no
// backticks or escapes in the CSS itself, which is what makes this cheap
// extraction exact.
const FRONTEND_PRESETS_PATH = fileURLToPath(
  new URL('../../../src/frontend/custom-css-presets.ts', import.meta.url)
)

function frontendPresetConstant(name) {
  const source = readFileSync(FRONTEND_PRESETS_PATH, 'utf8')
  const match = source.match(new RegExp('export const ' + name + ' = `([^`]*)`'))
  if (!match) {
    throw new Error(
      `Could not find a backtick-literal "export const ${name}" in ${FRONTEND_PRESETS_PATH}. ` +
        'If that constant was renamed or reformatted, update this cross-copy lock test too.'
    )
  }
  return match[1]
}

describe('the frontend copy of the presets stays byte-identical to the backend copy', () => {
  it('EDITORIAL_CSS is the same in src/frontend/custom-css-presets.ts', () => {
    expect(frontendPresetConstant('EDITORIAL_CSS')).toBe(EDITORIAL_CSS)
  })

  it('DEVELOPER_CSS is the same in src/frontend/custom-css-presets.ts', () => {
    expect(frontendPresetConstant('DEVELOPER_CSS')).toBe(DEVELOPER_CSS)
  })
})
