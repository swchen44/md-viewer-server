import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import {
  EDITORIAL_CSS,
  DEVELOPER_CSS,
  resolveCustomCssChoice,
} from '../../../src/server/custom-css-presets.js'

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

describe('resolveCustomCssChoice', () => {
  it('built-in choices are readonly and return the constant CSS', () => {
    const editorial = resolveCustomCssChoice({
      customCssChoice: 'editorial',
      customCssUser1: 'ignored',
      customCssUser2: 'ignored',
    })
    expect(editorial).toEqual({ choice: 'editorial', draft: EDITORIAL_CSS, readonly: true })

    const developer = resolveCustomCssChoice({
      customCssChoice: 'developer',
      customCssUser1: '',
      customCssUser2: '',
    })
    expect(developer).toEqual({ choice: 'developer', draft: DEVELOPER_CSS, readonly: true })
  })

  it('user choices are editable and return that slot\'s stored content', () => {
    expect(
      resolveCustomCssChoice({ customCssChoice: 'user1', customCssUser1: 'one', customCssUser2: 'two' })
    ).toEqual({ choice: 'user1', draft: 'one', readonly: false })

    expect(
      resolveCustomCssChoice({ customCssChoice: 'user2', customCssUser1: 'one', customCssUser2: 'two' })
    ).toEqual({ choice: 'user2', draft: 'two', readonly: false })
  })

  it('an empty user slot resolves to an empty draft, not the built-in CSS', () => {
    expect(
      resolveCustomCssChoice({ customCssChoice: 'user1', customCssUser1: '', customCssUser2: '' })
    ).toEqual({ choice: 'user1', draft: '', readonly: false })
  })

  it('built-in preset CSS is scoped to the markdown-body container', () => {
    expect(EDITORIAL_CSS).toMatch(/\.markdown-body/)
    expect(DEVELOPER_CSS).toMatch(/\.markdown-body/)
  })
})

describe('the frontend copy of the presets stays byte-identical to the backend copy', () => {
  it('EDITORIAL_CSS is the same in src/frontend/custom-css-presets.ts', () => {
    expect(frontendPresetConstant('EDITORIAL_CSS')).toBe(EDITORIAL_CSS)
  })

  it('DEVELOPER_CSS is the same in src/frontend/custom-css-presets.ts', () => {
    expect(frontendPresetConstant('DEVELOPER_CSS')).toBe(DEVELOPER_CSS)
  })
})
