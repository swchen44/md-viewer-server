import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { TabContent } from '../../src/frontend/components/TabContent.js'
import type { Tab } from '../../src/frontend/types.js'

function makeTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: '0:a.md',
    rootId: 0,
    relPath: 'a.md',
    title: 'a.md',
    dirty: false,
    content: null,
    mtimeMs: null,
    encoding: 'utf-8',
    mode: 'view',
    ...overrides,
  }
}

describe('TabContent', () => {
  beforeEach(() => sessionStorage.setItem('mvs-token', 'tok'))
  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('fetches file content when not yet loaded, then calls onContentLoaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ content: '# Hi', mtimeMs: 123, encoding: 'utf-8' }))
      )
    )
    const onContentLoaded = vi.fn()
    render(
      <TabContent
        tab={makeTab()}
        onContentLoaded={onContentLoaded}
        onChange={() => {}}
        onSave={() => {}}
        allowHtmlScripts={false}
      />
    )
    await waitFor(() => expect(onContentLoaded).toHaveBeenCalledWith('# Hi', 123, 'utf-8'))
  })

  it('renders MarkdownView in view mode once content is loaded', () => {
    render(
      <TabContent
        tab={makeTab({ content: '# Hi', mtimeMs: 1 })}
        onContentLoaded={() => {}}
        onChange={() => {}}
        onSave={() => {}}
        allowHtmlScripts={false}
      />
    )
    expect(screen.getByTestId('markdown-view')).toBeInTheDocument()
  })

  it('renders HtmlView for a .html file regardless of mode', () => {
    render(
      <TabContent
        tab={makeTab({ relPath: 'a.html', content: '<p>hi</p>', mtimeMs: 1, mode: 'edit' })}
        onContentLoaded={() => {}}
        onChange={() => {}}
        onSave={() => {}}
        allowHtmlScripts={false}
      />
    )
    expect(screen.getByTitle('html-preview')).toBeInTheDocument()
  })

  it('forces view mode for non-UTF-8 files even if tab.mode is edit', () => {
    render(
      <TabContent
        tab={makeTab({ content: '�', mtimeMs: 1, encoding: 'unknown', mode: 'edit' })}
        onContentLoaded={() => {}}
        onChange={() => {}}
        onSave={() => {}}
        allowHtmlScripts={false}
      />
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
