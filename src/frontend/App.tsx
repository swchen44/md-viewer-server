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
import { SettingsModal } from './components/SettingsModal.js'
import { useDraft } from './hooks/useDraft.js'

interface Conflict {
  tabId: string
  currentContent: string
  currentMtimeMs: number
}

interface SaveError {
  tabId: string
  message: string
}

// Matches SearchBar.tsx's established 300ms debounce convention — see
// handleChange below for what this actually debounces (only the localStorage
// write, not the in-memory content update).
const DRAFT_SAVE_DEBOUNCE_MS = 300

export function App() {
  const { t } = useTranslation()
  const [tabs, setTabs] = useState<Tab[]>([])
  // handleSave needs to check, once its PUT response comes back, whether the
  // tab's content is still what was actually sent — but by then the `tabs`
  // closed over at the top of handleSave (captured when the save started) is
  // stale if the user kept typing in the meantime. A setTabs *updater*
  // callback would see fresh state, but React doesn't run it synchronously,
  // so a variable assigned inside one can't be read right after the
  // setTabs(...) call either. Mirror `tabs` into a ref (kept current via
  // effect, not during render — see react-hooks/refs) so handleSave can read
  // the true latest content synchronously at any time.
  const tabsRef = useRef<Tab[]>(tabs)
  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('files')
  const [roots, setRoots] = useState<Array<{ id: number; name: string }>>([])
  const [rootsError, setRootsError] = useState<string | null>(null)
  const [fileSearchResults, setFileSearchResults] = useState<FileSearchResults | null>(null)
  const [outlineSearchFilter, setOutlineSearchFilter] = useState<HeadingFilter | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [saveError, setSaveError] = useState<SaveError | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
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
    // A pending conflict belongs to the save attempt that raised it, not to
    // "a tab with this id is currently open." Left uncleared, reopening the
    // SAME file — tab ids are deterministic (`${rootId}:${relPath}`), so a
    // reopen reuses the exact id the stale conflict is keyed on — resurrects
    // the OLD dialog showing OLD `currentContent`, and clicking "Keep Mine"
    // there force-PUTs the just-reloaded content over whatever's on disk now,
    // discarding an external edit the user never even triggered a save
    // against in this session. Closing the tab is the clearest signal the
    // user is abandoning that unresolved decision, so end it here.
    //
    // Deliberately NOT done on a plain tab *switch*: the ConflictDialog only
    // renders while `conflict.tabId === activeTab.id` (see the render below),
    // so switching away already hides it without discarding the pending
    // decision, and switching back correctly re-shows the SAME dialog —
    // nothing about briefly looking at another tab means the user resolved
    // it. Only closing the tab, or explicitly clicking Keep Mine / Discard
    // Mine, should end a pending conflict.
    setConflict((prev) => (prev?.tabId === id ? null : prev))
    // Same staleness risk applies to a save-error indicator (Bug 2): closing
    // the tab it was about should not let it resurface against a same-id
    // reopen.
    setSaveError((prev) => (prev?.tabId === id ? null : prev))
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

  // handleChange (below) debounces the localStorage write only — the
  // in-memory content/dirty update stays synchronous so typing feels
  // responsive. `save` captures whichever `saveDraft` closure was current
  // when the timer was scheduled, so a flush always writes to the correct
  // rootId/relPath key even if the active tab has since changed.
  const pendingDraftRef = useRef<{
    tabId: string
    timeoutId: ReturnType<typeof setTimeout>
    value: string
    save: (value: string) => void
  } | null>(null)

  // Cancels the pending debounce timer (if any) and performs its localStorage
  // write immediately. Used wherever silently losing the last keystroke(s) to
  // a crash would be surprising: right before a save (so a later clearDraft()
  // on success can't be undone by a debounce timer that fires afterwards and
  // resurrects a stale draft), and whenever the user stops looking at this
  // tab (switched away, closed it, or the app unmounted).
  function flushPendingDraft() {
    const pending = pendingDraftRef.current
    if (!pending) return
    clearTimeout(pending.timeoutId)
    pending.save(pending.value)
    pendingDraftRef.current = null
  }

  // Same timer-clearing mechanism as flushPendingDraft, but WITHOUT writing
  // the pending value first. Used by handleDiscardMine: the user is
  // explicitly discarding their local edits, so writing the about-to-be-
  // discarded content to localStorage only to immediately clearDraft() it
  // would be pointless — and racy, if the two ever landed in the wrong order.
  function cancelPendingDraft() {
    const pending = pendingDraftRef.current
    if (!pending) return
    clearTimeout(pending.timeoutId)
    pendingDraftRef.current = null
  }

  // Flushes on every "stopped looking at this tab" transition: switching the
  // active tab (activeTabId changes), closing the active tab (closeTab clears
  // activeTabId too, which is the same transition), and unmounting. The draft
  // is only a crash-recovery safety net, not authoritative state, but it
  // should still reflect keystrokes typed in the last <300ms before any of
  // these, not silently drop them.
  useEffect(() => {
    return () => {
      flushPendingDraft()
    }
  }, [activeTabId])

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
    // Debounce only the localStorage persistence (a JSON-stringify + disk
    // write per keystroke is wasteful for larger files) — the in-memory
    // update above already happened synchronously.
    if (pendingDraftRef.current) {
      clearTimeout(pendingDraftRef.current.timeoutId)
    }
    const timeoutId = setTimeout(() => {
      saveDraft(value)
      pendingDraftRef.current = null
    }, DRAFT_SAVE_DEBOUNCE_MS)
    pendingDraftRef.current = { tabId, timeoutId, value, save: saveDraft }
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

  // Both handleSave and handleKeepMine issue a PUT and, once it resolves,
  // need to know whether the tab's content is still what was actually sent —
  // the user may have kept typing during the round-trip. Compare against
  // tabsRef (the true latest content), not a `tab`/`tabs` snapshot captured
  // when the PUT started, which goes stale the moment the user edits again.
  function contentUnchangedSince(tabId: string, contentAtPutTime: string | null): boolean {
    const currentTab = tabsRef.current.find((t) => t.id === tabId)
    return currentTab?.content === contentAtPutTime
  }

  async function handleSave(tabId: string) {
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab) return
    // A pending debounced draft write (see handleChange) must not still be
    // sitting in a timer when this save starts — if it fired *after* the
    // success branch below calls clearDraft(), it would silently resurrect a
    // stale draft in localStorage for a file that was just successfully
    // saved. Flushing synchronously first guarantees clearDraft() genuinely
    // has the last word.
    if (pendingDraftRef.current?.tabId === tabId) {
      flushPendingDraft()
    }
    const contentAtSaveTime = tab.content
    try {
      const res = await putFile(tab, false)
      if (res.ok) {
        const data = await res.json()
        // If content changed during the save, this is a legitimate race: only
        // the mtimeMs is safe to adopt from the response. Marking dirty:false
        // or clearing the draft here would falsely report the newer,
        // still-unsaved edits as saved and delete their only recovery copy.
        const unchanged = contentUnchangedSince(tabId, contentAtSaveTime)
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId
              ? unchanged
                ? { ...t, mtimeMs: data.mtimeMs, dirty: false }
                : { ...t, mtimeMs: data.mtimeMs }
              : t
          )
        )
        if (unchanged) {
          clearDraft()
        }
        setSaveError(null)
        return
      }
      if (res.status === 409) {
        const data = await res.json()
        setConflict({ tabId, currentContent: data.currentContent, currentMtimeMs: data.currentMtimeMs })
        setSaveError(null)
        return
      }
      console.error('Failed to save file', res.status)
      setSaveError({ tabId, message: t('app.saveError', 'Failed to save the file. Your edits are kept.') })
    } catch (err) {
      // Covers a dropped connection, a 401 after --rotate-token invalidates
      // the cached token, a 500, and a non-JSON error body making res.json()
      // itself throw (including for the 409 branch above) — anything that
      // would otherwise be an unhandled promise rejection with no user
      // feedback beyond a console.error. Draft/dirty state is left exactly as
      // it was: the only place either is cleared is the `unchanged` branch
      // above, which never runs when this catch fires.
      console.error('Failed to save file', err)
      setSaveError({ tabId, message: t('app.saveError', 'Failed to save the file. Your edits are kept.') })
    }
  }

  async function handleKeepMine() {
    if (!conflict) return
    // Same guard as handleSave: the non-modal ConflictDialog leaves the
    // editor interactive, so the user may have typed a new edit (scheduling a
    // pending debounced localStorage write) after the dialog opened but
    // before clicking Keep Mine. A force-save should still commit whatever
    // was most recently typed as the authoritative draft state before
    // clearing it on success below — flush it now so a later clearDraft()
    // genuinely has the last word.
    if (pendingDraftRef.current?.tabId === conflict.tabId) {
      flushPendingDraft()
    }
    const tab = tabs.find((t) => t.id === conflict.tabId)
    if (tab) {
      const contentAtForceSaveTime = tab.content
      const res = await putFile(tab, true)
      if (res.ok) {
        const data = await res.json()
        // Same race as handleSave: the non-modal ConflictDialog leaves the
        // editor interactive, so the user may keep typing while this
        // force-save PUT is in flight. Only clear dirty/draft if nothing
        // changed since the force-save was sent.
        const unchanged = contentUnchangedSince(tab.id, contentAtForceSaveTime)
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tab.id
              ? unchanged
                ? { ...t, mtimeMs: data.mtimeMs, dirty: false }
                : { ...t, mtimeMs: data.mtimeMs }
              : t
          )
        )
        if (unchanged) {
          clearDraft()
        }
      } else {
        console.error('Failed to force-save file', res.status)
      }
    }
    setConflict(null)
  }

  function handleDiscardMine() {
    if (!conflict) return
    // Same race as handleKeepMine/handleSave, but the resolution differs: the
    // user is explicitly discarding their local edits, so a pending debounced
    // write scheduled while the dialog was open must be CANCELLED rather than
    // flushed — writing the about-to-be-discarded content to localStorage
    // first, only to immediately clearDraft() it below, would be pointless
    // and racy (a stale timer firing after clearDraft() would otherwise
    // silently resurrect the just-discarded edit).
    if (pendingDraftRef.current?.tabId === conflict.tabId) {
      cancelPendingDraft()
    }
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
      <TopBar onOpenSettings={() => setSettingsOpen(true)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
                {saveError && saveError.tabId === activeTab.id && (
                  <div data-testid="save-error" role="alert" style={{ padding: '4px 12px', color: '#b00020' }}>
                    {saveError.message}
                  </div>
                )}
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
