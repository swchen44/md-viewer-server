import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const [loadError, setLoadError] = useState(false)

  // The tab can be swapped for a different file (different rootId/relPath)
  // while a previous tab's fetch failed and left loadError set — reset it
  // during render (the same "adjust state when a prop changes" pattern
  // already established in OutlinePanel/SearchBar/useSearchHistory/
  // useDraft), so a stale error from the OLD tab never briefly flashes for
  // the NEW one before its own fetch has even started.
  const tabKey = `${tab.rootId}:${tab.relPath}`
  const [prevTabKey, setPrevTabKey] = useState(tabKey)
  if (prevTabKey !== tabKey) {
    setPrevTabKey(tabKey)
    setLoadError(false)
  }

  // Fetches once per tab, guarded by tab.content === null. The `cancelled`
  // flag is scoped per effect invocation (a fresh closure each time the
  // effect re-runs), so if `tab` changes to a different file before this
  // fetch resolves, React runs this cleanup first — setting this closure's
  // `cancelled` to true — before starting the next effect for the new tab.
  // A late response from an abandoned fetch can therefore never reach
  // onContentLoaded for the wrong tab, even though onContentLoaded itself
  // carries no tab identifier: correctness here comes from the guard
  // suppressing stale deliveries, not from the parent disambiguating them.
  useEffect(() => {
    if (tab.content !== null) return
    let cancelled = false
    apiFetch(`/api/file?root=${tab.rootId}&path=${encodeURIComponent(tab.relPath)}`)
      .then(async (res) => {
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setLoadError(true)
          return
        }
        onContentLoaded(data.content, data.mtimeMs, data.encoding)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.rootId, tab.relPath, tab.content])

  if (loadError) {
    return <div>{t('tabContent.loadError', 'Failed to load this file')}</div>
  }

  if (tab.content === null) {
    return <div>{t('tabContent.loading', 'Loading...')}</div>
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
