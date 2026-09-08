import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { TabContent } from '../../src/frontend/components/TabContent.js'
import type { Tab } from '../../src/frontend/types.js'
import en from '../../src/frontend/i18n/locales/en.json'

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
        blockRemoteContent={false}
        sendToPlantUmlServer={false}
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
        blockRemoteContent={false}
        sendToPlantUmlServer={false}
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
        blockRemoteContent={false}
        sendToPlantUmlServer={false}
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
        blockRemoteContent={false}
        sendToPlantUmlServer={false}
      />
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('shows a non-UTF-8 encoding badge when tab.encoding is unknown', () => {
    render(
      <TabContent
        tab={makeTab({ content: '�', mtimeMs: 1, encoding: 'unknown' })}
        onContentLoaded={() => {}}
        onChange={() => {}}
        onSave={() => {}}
        allowHtmlScripts={false}
        blockRemoteContent={false}
        sendToPlantUmlServer={false}
      />
    )
    expect(screen.getByTestId('encoding-badge')).toHaveTextContent(en.tabContent.nonUtf8Encoding)
  })

  it('does not show the encoding badge for a normal UTF-8 file', () => {
    render(
      <TabContent
        tab={makeTab({ content: '# Hi', mtimeMs: 1, encoding: 'utf-8' })}
        onContentLoaded={() => {}}
        onChange={() => {}}
        onSave={() => {}}
        allowHtmlScripts={false}
        blockRemoteContent={false}
        sendToPlantUmlServer={false}
      />
    )
    expect(screen.queryByTestId('encoding-badge')).not.toBeInTheDocument()
  })

  describe('.puml/.plantuml dispatch', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('renders PlantUmlView for a .puml file, ignoring view/edit/split mode', () => {
      render(
        <TabContent
          tab={makeTab({
            relPath: 'diagram.puml',
            content: '@startuml\nA -> B\n@enduml',
            mtimeMs: 1,
            mode: 'edit',
          })}
          onContentLoaded={() => {}}
          onChange={() => {}}
          onSave={() => {}}
          allowHtmlScripts={false}
          blockRemoteContent={false}
          sendToPlantUmlServer={false}
        />
      )
      expect(screen.getByText(/@startuml/)).toBeInTheDocument()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('renders PlantUmlView for a .plantuml file and fetches the diagram when sendToPlantUmlServer is true', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(new Blob(['fake-png-bytes']), { headers: { 'Content-Type': 'image/png' } })
        )
      )
      render(
        <TabContent
          tab={makeTab({
            relPath: 'diagram.plantuml',
            content: '@startuml\nA -> B\n@enduml',
            mtimeMs: 1,
          })}
          onContentLoaded={() => {}}
          onChange={() => {}}
          onSave={() => {}}
          allowHtmlScripts={false}
          blockRemoteContent={false}
          sendToPlantUmlServer={true}
        />
      )
      await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument())
    })
  })

  // The setting is enforced in MarkdownView/HtmlView, so what matters here is
  // that TabContent actually hands it down to whichever view it picks —
  // without that, the toggle is inert no matter how the views behave.
  describe('blockRemoteContent reaches the view that renders the document', () => {
    it('blocks a remote markdown image in view mode', () => {
      render(
        <TabContent
          tab={makeTab({ content: '![cat](https://tracker.example.com/cat.png)', mtimeMs: 1 })}
          onContentLoaded={() => {}}
          onChange={() => {}}
          onSave={() => {}}
          allowHtmlScripts={false}
          blockRemoteContent={true}
          sendToPlantUmlServer={false}
        />
      )
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      expect(screen.getByTestId('blocked-remote-content')).toBeInTheDocument()
    })

    it('blocks a remote markdown image in the split-view preview', () => {
      render(
        <TabContent
          tab={makeTab({
            content: '![cat](https://tracker.example.com/cat.png)',
            mtimeMs: 1,
            mode: 'split',
          })}
          onContentLoaded={() => {}}
          onChange={() => {}}
          onSave={() => {}}
          allowHtmlScripts={false}
          blockRemoteContent={true}
          sendToPlantUmlServer={false}
        />
      )
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      expect(screen.getByTestId('blocked-remote-content')).toBeInTheDocument()
    })

    it('adds the CSP meta to a .html file preview', () => {
      render(
        <TabContent
          tab={makeTab({ relPath: 'a.html', content: '<p>hi</p>', mtimeMs: 1 })}
          onContentLoaded={() => {}}
          onChange={() => {}}
          onSave={() => {}}
          allowHtmlScripts={false}
          blockRemoteContent={true}
          sendToPlantUmlServer={false}
        />
      )
      expect(screen.getByTitle('html-preview').getAttribute('srcdoc')).toContain(
        'Content-Security-Policy'
      )
    })
  })

  describe('.mmd dispatch', () => {
    it('renders MermaidBlock (not MarkdownView) for a .mmd file in view mode', () => {
      render(
        <TabContent
          tab={makeTab({ relPath: 'diagram.mmd', content: 'graph TD; A-->B;', mtimeMs: 1 })}
          onContentLoaded={() => {}}
          onChange={() => {}}
          onSave={() => {}}
          allowHtmlScripts={false}
          blockRemoteContent={false}
          sendToPlantUmlServer={false}
        />
      )
      expect(screen.getByTestId('mermaid-block')).toBeInTheDocument()
      expect(screen.queryByTestId('markdown-view')).not.toBeInTheDocument()
    })

    it('renders MarkdownEditor (plain text) for a .mmd file in edit mode', () => {
      render(
        <TabContent
          tab={makeTab({
            relPath: 'diagram.mmd',
            content: 'graph TD; A-->B;',
            mtimeMs: 1,
            mode: 'edit',
          })}
          onContentLoaded={() => {}}
          onChange={() => {}}
          onSave={() => {}}
          allowHtmlScripts={false}
          blockRemoteContent={false}
          sendToPlantUmlServer={false}
        />
      )
      expect(screen.getByRole('textbox')).toHaveValue('graph TD; A-->B;')
    })

    it('degrades split mode to plain-text editing (no live diagram preview) for a .mmd file', () => {
      render(
        <TabContent
          tab={makeTab({
            relPath: 'diagram.mmd',
            content: 'graph TD; A-->B;',
            mtimeMs: 1,
            mode: 'split',
          })}
          onContentLoaded={() => {}}
          onChange={() => {}}
          onSave={() => {}}
          allowHtmlScripts={false}
          blockRemoteContent={false}
          sendToPlantUmlServer={false}
        />
      )
      expect(screen.getByRole('textbox')).toHaveValue('graph TD; A-->B;')
      expect(screen.queryByTestId('mermaid-block')).not.toBeInTheDocument()
    })
  })

  it('shows a translated loading message, not a hardcoded English literal', () => {
    // Never resolves within the test's lifetime — only the transient loading
    // state (rendered before any fetch settles) is under test here.
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    render(
      <TabContent
        tab={makeTab()}
        onContentLoaded={() => {}}
        onChange={() => {}}
        onSave={() => {}}
        allowHtmlScripts={false}
        blockRemoteContent={false}
        sendToPlantUmlServer={false}
      />
    )
    expect(screen.getByText(en.tabContent.loading)).toBeInTheDocument()
  })

  it('shows a too-large notice and renders neither MarkdownView nor MarkdownEditor when the server reports tooLarge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ content: null, mtimeMs: 123, encoding: 'unknown', tooLarge: true }))
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
        blockRemoteContent={false}
        sendToPlantUmlServer={false}
      />
    )
    await waitFor(() => expect(screen.getByText(en.tabContent.tooLarge)).toBeInTheDocument())
    expect(onContentLoaded).not.toHaveBeenCalled()
    expect(screen.queryByTestId('markdown-view')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('shows an error state instead of crashing when GET /api/file returns a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errorCode: 'FILE_NOT_FOUND' }), { status: 404 })
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
        blockRemoteContent={false}
        sendToPlantUmlServer={false}
      />
    )
    await waitFor(() => expect(screen.getByText(/failed to load/i)).toBeInTheDocument())
    expect(onContentLoaded).not.toHaveBeenCalled()
  })
})
