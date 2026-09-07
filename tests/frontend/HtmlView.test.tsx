import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HtmlView } from '../../src/frontend/components/HtmlView.js'

describe('HtmlView', () => {
  it('renders an iframe with no sandbox permissions when allowScripts is false', () => {
    render(<HtmlView content="<p>hi</p>" allowScripts={false} blockRemoteContent={false} />)
    const iframe = screen.getByTitle('html-preview')
    expect(iframe.getAttribute('sandbox')).toBe('')
  })

  it('renders an iframe with allow-scripts but never allow-same-origin when allowScripts is true', () => {
    render(
      <HtmlView content="<script>alert(1)</script>" allowScripts={true} blockRemoteContent={false} />
    )
    const iframe = screen.getByTitle('html-preview')
    const sandbox = iframe.getAttribute('sandbox') ?? ''
    expect(sandbox).toContain('allow-scripts')
    expect(sandbox).not.toContain('allow-same-origin')
  })

  it('uses the srcdoc attribute to inject content (not src, which would need a real URL)', () => {
    render(<HtmlView content="<p>hello world</p>" allowScripts={false} blockRemoteContent={false} />)
    const iframe = screen.getByTitle('html-preview')
    expect(iframe.getAttribute('srcdoc')).toBe('<p>hello world</p>')
  })

  describe('blockRemoteContent', () => {
    it('injects no CSP meta tag when the flag is off', () => {
      render(<HtmlView content="<p>hi</p>" allowScripts={false} blockRemoteContent={false} />)
      const srcdoc = screen.getByTitle('html-preview').getAttribute('srcdoc') ?? ''
      expect(srcdoc).not.toContain('Content-Security-Policy')
    })

    it('injects a subresource-blocking CSP meta tag when the flag is on', () => {
      render(<HtmlView content="<p>hi</p>" allowScripts={false} blockRemoteContent={true} />)
      const srcdoc = screen.getByTitle('html-preview').getAttribute('srcdoc') ?? ''
      expect(srcdoc).toContain('http-equiv="Content-Security-Policy"')
      expect(srcdoc).toContain("img-src 'self' data:")
      expect(srcdoc).toContain("media-src 'self'")
      expect(srcdoc).toContain("frame-src 'none'")
      expect(srcdoc).toContain("connect-src 'self'")
      expect(srcdoc).toContain('<p>hi</p>')
    })

    it('places the CSP meta ahead of any resource in the document', () => {
      render(
        <HtmlView
          content={'<html><head><title>t</title></head><body><img src="https://x/y.png"></body></html>'}
          allowScripts={false}
          blockRemoteContent={true}
        />
      )
      const srcdoc = screen.getByTitle('html-preview').getAttribute('srcdoc') ?? ''
      const metaIndex = srcdoc.indexOf('Content-Security-Policy')
      expect(metaIndex).toBeGreaterThan(-1)
      expect(metaIndex).toBeLessThan(srcdoc.indexOf('<title>'))
      expect(metaIndex).toBeLessThan(srcdoc.indexOf('<img'))
    })

    it('preserves a leading doctype ahead of the CSP meta, so the document stays in standards mode', () => {
      render(
        <HtmlView
          content={'<!DOCTYPE html><html><body>hi</body></html>'}
          allowScripts={false}
          blockRemoteContent={true}
        />
      )
      const srcdoc = screen.getByTitle('html-preview').getAttribute('srcdoc') ?? ''
      expect(srcdoc.indexOf('<!DOCTYPE html>')).toBe(0)
      expect(srcdoc.indexOf('Content-Security-Policy')).toBeGreaterThan(0)
      expect(srcdoc.indexOf('Content-Security-Policy')).toBeLessThan(srcdoc.indexOf('<body>'))
    })

    it('is not defeated by a fake <head> planted in a comment before the real one', () => {
      render(
        <HtmlView
          content={
            '<!-- <head> --><html><head></head><body><img src="https://evil.example/pixel.png"></body></html>'
          }
          allowScripts={false}
          blockRemoteContent={true}
        />
      )
      const srcdoc = screen.getByTitle('html-preview').getAttribute('srcdoc') ?? ''
      const metaIndex = srcdoc.indexOf('Content-Security-Policy')
      expect(metaIndex).toBeGreaterThan(-1)
      // The policy must land outside the comment, or the browser never parses it.
      expect(srcdoc.indexOf('<!--')).toBeGreaterThan(metaIndex)
      expect(metaIndex).toBeLessThan(srcdoc.indexOf('<img'))
    })

    it('is not defeated by a fake <head> planted inside a <script> string', () => {
      render(
        <HtmlView
          content={
            '<script>var s = "<head>"</script><img src="https://evil.example/pixel.png">'
          }
          allowScripts={true}
          blockRemoteContent={true}
        />
      )
      const srcdoc = screen.getByTitle('html-preview').getAttribute('srcdoc') ?? ''
      const metaIndex = srcdoc.indexOf('Content-Security-Policy')
      expect(metaIndex).toBeGreaterThan(-1)
      expect(metaIndex).toBeLessThan(srcdoc.indexOf('<script>'))
    })
  })
})
