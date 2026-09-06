import { describe, it, expect } from 'vitest'
import {
  EDITORIAL_CSS,
  DEVELOPER_CSS,
  resolveCustomCssChoice,
} from '../../../src/server/custom-css-presets.js'

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
