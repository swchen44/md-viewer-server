import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HtmlView } from '../../src/frontend/components/HtmlView.js'

describe('HtmlView', () => {
  it('renders an iframe with no sandbox permissions when allowScripts is false', () => {
    render(<HtmlView content="<p>hi</p>" allowScripts={false} />)
    const iframe = screen.getByTitle('html-preview')
    expect(iframe.getAttribute('sandbox')).toBe('')
  })

  it('renders an iframe with allow-scripts but never allow-same-origin when allowScripts is true', () => {
    render(<HtmlView content="<script>alert(1)</script>" allowScripts={true} />)
    const iframe = screen.getByTitle('html-preview')
    const sandbox = iframe.getAttribute('sandbox') ?? ''
    expect(sandbox).toContain('allow-scripts')
    expect(sandbox).not.toContain('allow-same-origin')
  })

  it('uses the srcdoc attribute to inject content (not src, which would need a real URL)', () => {
    render(<HtmlView content="<p>hello world</p>" allowScripts={false} />)
    const iframe = screen.getByTitle('html-preview')
    expect(iframe.getAttribute('srcdoc')).toBe('<p>hello world</p>')
  })
})
