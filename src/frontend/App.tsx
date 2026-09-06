import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from './api-client.js'
import { TopBar } from './components/TopBar.js'
import { TabBar } from './components/TabBar.js'
import type { Tab } from './types.js'
import { Sidebar, type SidebarMode } from './components/Sidebar.js'
import { FileTreePanel, type FileSearchResults } from './components/FileTreePanel.js'
import { OutlinePanel, type HeadingFilter } from './components/OutlinePanel.js'
import { SearchBar, type FilesSearchOptions, type OutlineSearchOptions } from './components/SearchBar.js'
import { TabContent } from './components/TabContent.js'
import { ConflictDialog } from './components/ConflictDialog.js'
import { useDraft } from './hooks/useDraft.js'

interface Conflict {
  tabId: string
  currentContent: string
  currentMtimeMs: number
}

export function App() {
  const { t } = useTranslation()
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('files')
  const [roots, setRoots] = useState<Array<{ id: number; name: string }>>([])
  const [rootsError, setRootsError] = useState<string | null>(null)
  const [fileSearchResults, setFileSearchResults] = useState<FileSearchResults | null>(null)
  const [outlineSearchFilter, setOutlineSearchFilter] = useState<HeadingFilter | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  // Guards against a stale /api/search response (issued per-root, then merged)
  // overwriting newer state if the user changes/clears the query before an
  // earlier request finishes — only the most recently issued search may apply.
  const fileSearchSeqRef = useRef(0)

  useEffect(() => {
    apiFetch('/api/roots')
      .then(async (res) => {
        if (!res.ok) {
          // A non-ok response here (401 UNAUTHORIZED on first load, on a manually
          // navigated URL with no/stale token, or after --rotate-token leaves the
          // browser holding an old token) must NOT be treated as the roots array —
          // doing so used to crash the whole app: `roots` became the error body
          // object, and FileTreePanel's `roots.map(...)` threw with no Error
          // Boundary in place to contain it. Keep roots empty (same safe/renderable
          // state as a fresh install with zero configured roots) and surface a
          // visible, testable indicator instead.
          let errorCode: string | undefined
          try {
            const body = await res.json()
            errorCode = body?.errorCode
          } catch {
            // Non-JSON body — fall through with errorCode left undefined.
          }
          console.error('Failed to load /api/roots', res.status, errorCode)
          setRoots([])
          setRootsError(
            errorCode === 'UNAUTHORIZED'
              ? 'Not authorized — check your access token.'
              : 'Failed to load folders.'
          )
          return
        }
        const data = await res.json()
        setRoots(data)
        setRootsError(null)
      })
      .catch((err) => {
        console.error('Failed to load /api/roots', err)
        setRoots([])
        setRootsError('Failed to load folders.')
      })
  }, [])

  function closeTab(id: string) {
    setTabs((prev) => prev.filter((t) => t.id !== id))
    setActiveTabId((prev) => (prev === id ? null : prev))
  }

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null
  // OutlinePanel's fetch effect depends on `activeTab` by reference. Without this,
  // every outlineSearchFilter update (i.e. every debounced keystroke) re-renders
  // App and creates a brand-new {rootId, relPath} literal, re-triggering a
  // GET /api/outline fetch on every search keystroke instead of just re-filtering
  // the already-loaded headings in memory. Memoize on the actual identifying
  // values so the reference only changes when the active tab itself changes.
  const activeOutlineTab = useMemo(
    () => (activeTab ? { rootId: activeTab.rootId, relPath: activeTab.relPath } : null),
    // Deliberately keyed on the primitive id/path values rather than `activeTab`
    // itself — that's the whole point of the memo (see comment above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTab?.rootId, activeTab?.relPath]
  )

  // useDraft must be called unconditionally on every render (rules of hooks), but
  // its whole point is per-file draft state — so it's called here with whichever
  // tab is currently active, falling back to sentinel values (0, '') when there is
  // none. useDraft's own key-reset-on-rerender behavior (see its Task 1 fix) means
  // this is safe even though `activeTab` changes identity across renders: the hook
  // treats a change to (rootId, relPath) as "load the draft for the new key," not
  // as a fresh mount. handleContentLoaded/handleChange/handleSave below are plain
  // functions redefined every render, so they always close over the `draft`/
  // `saveDraft`/`clearDraft` that correspond to the SAME render's `activeTab` —
  // that pairing is what keeps a save/draft operation from ever acting on the
  // wrong file, even if the active tab changes before an async call resolves.
  const { draft, saveDraft, clearDraft } = useDraft(activeTab?.rootId ?? 0, activeTab?.relPath ?? '')

  function handleContentLoaded(tabId: string, content: string, mtimeMs: number, encoding: 'utf-8' | 'unknown') {
    // A crash-recovered draft (saved to localStorage but never successfully
    // sent to the server) must win over the just-fetched server content —
    // otherwise reopening the file after a crash silently throws the draft
    // away. mtimeMs/encoding still come from the server response regardless,
    // since future save/conflict checks must compare against the real file.
    const hasDraft = draft !== null
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId
          ? { ...t, content: hasDraft ? (draft as string) : content, mtimeMs, encoding, dirty: hasDraft ? true : t.dirty }
          : t
      )
    )
  }

  function handleChange(tabId: string, value: string) {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, content: value, dirty: true } : t)))
    saveDraft(value)
  }

  function handleModeChange(tabId: string, mode: Tab['mode']) {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, mode } : t)))
  }

  async function putFile(tab: Tab, force: boolean): Promise<Response> {
    return apiFetch(`/api/file?root=${tab.rootId}&path=${encodeURIComponent(tab.relPath)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: tab.content, mtimeMs: tab.mtimeMs, ...(force ? { force: true } : {}) }),
    })
  }

  async function handleSave(tabId: string) {
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab) return
    const res = await putFile(tab, false)
    if (res.ok) {
      const data = await res.json()
      setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, mtimeMs: data.mtimeMs, dirty: false } : t)))
      clearDraft()
      return
    }
    if (res.status === 409) {
      const data = await res.json()
      setConflict({ tabId, currentContent: data.currentContent, currentMtimeMs: data.currentMtimeMs })
      return
    }
    console.error('Failed to save file', res.status)
  }

  async function handleKeepMine() {
    if (!conflict) return
    const tab = tabs.find((t) => t.id === conflict.tabId)
    if (tab) {
      const res = await putFile(tab, true)
      if (res.ok) {
        const data = await res.json()
        setTabs((prev) => prev.map((t) => (t.id === tab.id ? { ...t, mtimeMs: data.mtimeMs, dirty: false } : t)))
        clearDraft()
      } else {
        console.error('Failed to force-save file', res.status)
      }
    }
    setConflict(null)
  }

  function handleDiscardMine() {
    if (!conflict) return
    setTabs((prev) =>
      prev.map((t) =>
        t.id === conflict.tabId
          ? { ...t, content: conflict.currentContent, mtimeMs: conflict.currentMtimeMs, dirty: false }
          : t
      )
    )
    clearDraft()
    setConflict(null)
  }

  function handleJumpToHeading(line: number) {
    // Scrolling to the heading's line is the main-content-view plan's job —
    // no rendered document content exists yet to scroll within.
    console.log('jump to heading', line)
  }

  function openFile(rootId: number, relPath: string) {
    const existing = tabs.find((t) => t.rootId === rootId && t.relPath === relPath)
    if (existing) {
      setActiveTabId(existing.id)
      return
    }
    const id = `${rootId}:${relPath}`
    const title = relPath.split('/').pop() ?? relPath
    setTabs((prev) => [
      ...prev,
      { id, rootId, relPath, title, dirty: false, content: null, mtimeMs: null, encoding: 'utf-8', mode: 'view' },
    ])
    setActiveTabId(id)
  }

  async function handleFileSearch(query: string, options: FilesSearchOptions) {
    const seq = ++fileSearchSeqRef.current

    if (!query.trim()) {
      setFileSearchResults(null)
      return
    }

    const perRootResults = await Promise.all(
      roots.map(async (root) => {
        const params = new URLSearchParams({
          root: String(root.id),
          q: query,
          target: options.target,
          scope: options.scope,
          regex: String(options.regex),
        })
        if (options.scope === 'open') {
          // POSIX filenames can legally contain a literal comma, so joining
          // relPaths into one comma-separated value (and having the backend
          // split on ',') is ambiguous/corrupting. Send each open tab as its
          // own repeated `openPaths` param instead — URLSearchParams.append
          // handles this natively, and Express's default query parser turns
          // repeated keys back into an array on the backend.
          tabs
            .filter((t) => t.rootId === root.id)
            .forEach((t) => params.append('openPaths', t.relPath))
        }

        try {
          const res = await apiFetch(`/api/search?${params.toString()}`)
          if (!res.ok) {
            // A pathological regex can time out server-side (400 REGEX_TIMEOUT) or
            // fail syntax validation (400 INVALID_REGEX) — treat either as "this
            // root contributed no matches" rather than crashing the search UI.
            return { fileMatches: [], contentMatches: [] }
          }
          const data = await res.json()
          return {
            fileMatches: (data.fileMatches ?? []).map(
              (f: { relPath: string; size: number; mtimeMs: number }) => ({
                ...f,
                rootId: root.id,
              })
            ),
            contentMatches: (data.contentMatches ?? []).map(
              (c: { relPath: string; matches?: { line: number; text: string }[]; skipped?: boolean }) => ({
                ...c,
                rootId: root.id,
              })
            ),
          }
        } catch {
          return { fileMatches: [], contentMatches: [] }
        }
      })
    )

    // A newer search (or a clear) may have started while these per-root
    // requests were in flight — only the latest request may commit state.
    if (seq !== fileSearchSeqRef.current) return

    setFileSearchResults({
      fileMatches: perRootResults.flatMap((r) => r.fileMatches),
      contentMatches: perRootResults.flatMap((r) => r.contentMatches),
    })
  }

  function handleOutlineSearch(query: string, options: OutlineSearchOptions) {
    // Outline search scope is always "the current tab's already-loaded headings" —
    // OutlinePanel filters client-side, so no API call is made here.
    setOutlineSearchFilter(query.trim() ? { query, regex: options.regex } : null)
  }

  return (
    <div data-testid="app-shell" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar />
      {rootsError && (
        <div data-testid="roots-error" role="alert" style={{ padding: '4px 12px', color: '#b00020' }}>
          {rootsError}
        </div>
      )}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar mode={sidebarMode} onModeChange={setSidebarMode}>
          {sidebarMode === 'files' && (
            <>
              <SearchBar mode="files" onSearch={handleFileSearch} />
              <FileTreePanel roots={roots} onOpenFile={openFile} searchResults={fileSearchResults} />
            </>
          )}
          {sidebarMode === 'outline' && (
            <>
              <SearchBar mode="outline" onSearch={handleOutlineSearch} />
              <OutlinePanel
                activeTab={activeOutlineTab}
                onJumpToHeading={handleJumpToHeading}
                headingFilter={outlineSearchFilter}
              />
            </>
          )}
        </Sidebar>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <TabBar tabs={tabs} activeTabId={activeTabId} onSelect={setActiveTabId} onClose={closeTab} />
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            {activeTab && (
              <>
                <div data-testid="mode-toggle" style={{ display: 'flex', gap: 4, padding: '4px 12px' }}>
                  <button
                    data-testid="mode-view"
                    aria-pressed={activeTab.mode === 'view'}
                    onClick={() => handleModeChange(activeTab.id, 'view')}
                  >
                    {t('modeToggle.view', 'View')}
                  </button>
                  {activeTab.encoding !== 'unknown' && (
                    <>
                      <button
                        data-testid="mode-edit"
                        aria-pressed={activeTab.mode === 'edit'}
                        onClick={() => handleModeChange(activeTab.id, 'edit')}
                      >
                        {t('modeToggle.edit', 'Edit')}
                      </button>
                      <button
                        data-testid="mode-split"
                        aria-pressed={activeTab.mode === 'split'}
                        onClick={() => handleModeChange(activeTab.id, 'split')}
                      >
                        {t('modeToggle.split', 'Split')}
                      </button>
                    </>
                  )}
                </div>
                <div style={{ flex: 1, overflow: 'auto' }}>
                  <TabContent
                    tab={activeTab}
                    onContentLoaded={(content, mtimeMs, encoding) =>
                      handleContentLoaded(activeTab.id, content, mtimeMs, encoding)
                    }
                    onChange={(value) => handleChange(activeTab.id, value)}
                    onSave={() => handleSave(activeTab.id)}
                    allowHtmlScripts={false}
                  />
                </div>
                {conflict && conflict.tabId === activeTab.id && (
                  <ConflictDialog
                    currentContent={conflict.currentContent}
                    onKeepMine={handleKeepMine}
                    onDiscardMine={handleDiscardMine}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
