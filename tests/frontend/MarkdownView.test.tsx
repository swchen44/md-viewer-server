import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownView } from '../../src/frontend/components/MarkdownView.js'

describe('MarkdownView', () => {
  it('renders a heading', () => {
    render(<MarkdownView content="# Hello" blockRemoteContent={false} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Hello' })).toBeInTheDocument()
  })

  it('renders a GFM table', () => {
    render(<MarkdownView content={'| A | B |\n|---|---|\n| 1 | 2 |'} blockRemoteContent={false} />)
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('renders a GFM task list', () => {
    render(<MarkdownView content={'- [x] done\n- [ ] pending'} blockRemoteContent={false} />)
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)
    expect(checkboxes[0]).toBeChecked()
    expect(checkboxes[1]).not.toBeChecked()
  })

  it('renders a mermaid code fence as a mermaid block, not a plain code block', () => {
    render(<MarkdownView content={'```mermaid\ngraph TD; A-->B;\n```'} blockRemoteContent={false} />)
    expect(screen.getByTestId('mermaid-block')).toBeInTheDocument()
  })

  describe('blockRemoteContent', () => {
    const remoteImage = '![cat](https://tracker.example.com/cat.png)'
    const localImage = '![local](./assets/local.png)'
    const apiImage = '![api](/api/asset?root=0&path=pic.png)'

    it('passes a remote image through untouched when the flag is off', () => {
      render(<MarkdownView content={remoteImage} blockRemoteContent={false} />)
      const img = screen.getByRole('img', { name: 'cat' })
      expect(img).toHaveAttribute('src', 'https://tracker.example.com/cat.png')
    })

    it('does not render a remote image with its remote src when the flag is on', () => {
      const { container } = render(<MarkdownView content={remoteImage} blockRemoteContent={true} />)
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      expect(container.querySelector('[src="https://tracker.example.com/cat.png"]')).toBeNull()
      // The alt text stands in for the blocked image so the document still
      // reads sensibly instead of silently losing content.
      expect(screen.getByTestId('blocked-remote-content')).toHaveTextContent('cat')
    })

    it('blocks a protocol-relative image URL when the flag is on', () => {
      const { container } = render(
        <MarkdownView content={'![x](//tracker.example.com/cat.png)'} blockRemoteContent={true} />
      )
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      expect(container.querySelector('[src="//tracker.example.com/cat.png"]')).toBeNull()
    })

    it('leaves relative and /api asset images untouched when the flag is on', () => {
      render(<MarkdownView content={`${localImage}\n\n${apiImage}`} blockRemoteContent={true} />)
      expect(screen.getByRole('img', { name: 'local' })).toHaveAttribute('src', './assets/local.png')
      expect(screen.getByRole('img', { name: 'api' })).toHaveAttribute(
        'src',
        '/api/asset?root=0&path=pic.png'
      )
      expect(screen.queryByTestId('blocked-remote-content')).not.toBeInTheDocument()
    })

    // Documents pre-existing react-markdown behavior this fix relies on rather
    // than duplicating: its default urlTransform already strips data: URIs, so
    // a data: image never reaches the browser as a src at all and the
    // remote-content check has nothing to do for it. It is deliberately NOT
    // reported as blocked remote content — it was never a network fetch.
    it('does not treat an inline data: image as remote (react-markdown already strips it)', () => {
      const dataUri =
        'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
      render(<MarkdownView content={`![inline](${dataUri})`} blockRemoteContent={true} />)
      expect(screen.getByRole('img', { name: 'inline' }).getAttribute('src')).toBeNull()
      expect(screen.queryByTestId('blocked-remote-content')).not.toBeInTheDocument()
    })

    it('still renders a remote link (a click, not an automatic fetch)', () => {
      render(
        <MarkdownView content={'[site](https://example.com)'} blockRemoteContent={true} />
      )
      expect(screen.getByRole('link', { name: 'site' })).toHaveAttribute(
        'href',
        'https://example.com'
      )
    })
  })
})
