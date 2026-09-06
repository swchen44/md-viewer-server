import { useEffect } from 'react'
import type { Tab } from '../types.js'
import { apiFetch } from '../api-client.js'
import { MarkdownView } from './MarkdownView.js'
import { MarkdownEditor } from './MarkdownEditor.js'
import { SplitView } from './SplitView.js'
import { HtmlView } from './HtmlView.js'

interface TabContentProps {
  tab: Tab
  onContentLoaded: (content: string, mtimeMs: number, encoding: 'utf-8' | 'unknown') => void
  onChange: (value: string) => void
  onSave: () => void
  allowHtmlScripts: boolean
}

export function TabContent({ tab, onContentLoaded, onChange, onSave, allowHtmlScripts }: TabContentProps) {
  // Fetches once per tab, guarded by tab.content === null. The `cancelled`
  // flag is scoped per effect invocation (a fresh closure each time the
  // effect re-runs), so if `tab` changes to a different file before this
  // fetch resolves, React runs this cleanup first — setting this closure's
  // `cancelled` to true — before starting the next effect for the new tab.
  // A late response from an abandoned fetch can therefore never reach
  // onContentLoaded for the wrong tab, even though onContentLoaded itself
  // carries no tab identifier: correctness here comes from the guard
  // suppressing stale deliveries, not from the parent disambiguating them.
  // Unlike OutlinePanel/MermaidBlock, TabContent holds no local state
  // derived from the fetch (the loaded content lives in the parent's Tab,
  // reported upward via onContentLoaded), so there is no on-screen state to
  // reset during render while a new fetch is in flight — the "Loading..."
  // fallback below is driven directly by the current tab.content prop.
  useEffect(() => {
    if (tab.content !== null) return
    let cancelled = false
    apiFetch(`/api/file?root=${tab.rootId}&path=${encodeURIComponent(tab.relPath)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) onContentLoaded(data.content, data.mtimeMs, data.encoding)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.rootId, tab.relPath, tab.content])

  if (tab.content === null) {
    return <div>Loading...</div>
  }

  const isHtml = tab.relPath.endsWith('.html')
  if (isHtml) {
    return <HtmlView content={tab.content} allowScripts={allowHtmlScripts} />
  }

  const effectiveMode = tab.encoding === 'unknown' ? 'view' : tab.mode

  if (effectiveMode === 'edit') {
    return <MarkdownEditor value={tab.content} onChange={onChange} onSave={onSave} />
  }
  if (effectiveMode === 'split') {
    return <SplitView value={tab.content} onChange={onChange} onSave={onSave} />
  }
  return <MarkdownView content={tab.content} />
}
