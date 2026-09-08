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
import { PathModal } from './components/PathModal.js'
import { useDraft } from './hooks/useDraft.js'
import { useSettings } from './hooks/useSettings.js'
import { useLocalPrefs } from './hooks/useLocalPrefs.js'
import { useFileWatcher } from './hooks/useFileWatcher.js'
import { resolveEffectiveCustomCss } from './custom-css-presets.js'

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
  const [pathModalOpen, setPathModalOpen] = useState(false)
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState<{ latestVersion: string } | null>(null)
  // Tab ids whose on-disk file changed (per the daemon's `file-changed` WS
  // event — see useFileWatcher) while either the tab was dirty (an unsaved
  // edit in progress) or autoReloadViewingTabs is off. Either way the tab's
  // in-memory content is deliberately left untouched — see handleFileChanged
  // below — this is only a passive "heads up" indicator, not stored on the
  // Tab itself (kept as separate App-level state) since it's ephemeral UI
  // state, not something that needs to round-trip through useDraft/tabs.
  const [externallyModifiedTabIds, setExternallyModifiedTabIds] = useState<Set<string>>(new Set())
  const { settings, updateSettings } = useSettings()
  const { prefs, setPref } = useLocalPrefs()
  // The effective CSS content is derived straight from backend-persisted
  // `settings` (customCssChoice/customCssUser1/customCssUser2) rather than a
  // localStorage-based draft — Task 8 moved Custom CSS choice/content
  // storage server-side, so there's nothing left for App.tsx to stage itself.
  const effectiveCustomCss = resolveEffectiveCustomCss(settings)

  // 'system' removes the attribute entirely so the existing
  // prefers-color-scheme CSS media query decides; 'light'/'dark' set it
  // explicitly to override that media query with the user's choice.
  useEffect(() => {
    if (prefs.theme === 'system') {
      delete document.documentElement.dataset.theme
    } else {
      document.documentElement.dataset.theme = prefs.theme
    }
  }, [prefs.theme])

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

  // One-shot, opt-in version check (checkForUpdates setting; see version-check.js
  // on the backend). GET /api/version-check itself is quiet when the setting is
  // off ({enabled: false}, no outbound request made server-side), and any
  // failure here (network error, non-JSON body) is swallowed silently — a
  // failed update check must never surface as an error to the user, it should
  // just mean no hint is shown.
  useEffect(() => {
    apiFetch('/api/version-check')
      .then((res) => res.json())
      .then((data) => {
        if (data.enabled && data.updateAvailable && data.latestVersion) {
          setUpdateAvailable({ latestVersion: data.latestVersion })
        }
      })
      .catch(() => {
        // Quiet by default — see comment above.
      })
  }, [])

  // Best-effort mirror of a local tab open/close into the daemon's shared
  // open-tabs registry (src/server/open-tabs.js), so `mvs tabs` / `mvs close`
  // and any other connected browser can see what this one has open.
  //
  // Deliberately fire-and-forget: the local tab list updates immediately and
  // never waits on this round-trip, because a slow or dead daemon connection
  // must not make clicking a file in the sidebar feel laggy. A failure is a
  // loss of CLI visibility, not of the user's work, so it is logged and
  // otherwise ignored — no error banner, unlike the save flow.
  function syncTabToDaemon(method: 'POST' | 'DELETE', rootId: number, relPath: string) {
    apiFetch('/api/tabs', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root: rootId, path: relPath }),
    })
      .then((res) => {
        if (!res.ok) console.warn('Tab sync rejected by the daemon', method, res.status)
      })
      .catch((err) => {
        console.warn('Failed to sync tab state to the daemon', err)
      })
  }

  // `syncToDaemon` distinguishes a LOCAL user action (default: tell the daemon,
  // so other clients learn about it) from applying a tab-closed event that
  // ALREADY came from the daemon. Without that distinction the DELETE issued
  // here would make the daemon broadcast tab-closed again to every client
  // including this one, which would apply it and DELETE again — an endless
  // echo loop off a single click. Same reasoning as openFile below.
  function closeTab(id: string, syncToDaemon = true) {
    // Read from tabsRef, not `tabs`: this also runs from the long-lived
    // WebSocket handler, where the captured `tabs` may be a stale render's.
    const closing = tabsRef.current.find((t) => t.id === id)
    if (syncToDaemon && closing) {
      syncTabToDaemon('DELETE', closing.rootId, closing.relPath)
    }
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
    // And again for the "externally modified" flag (see useFileWatcher wiring
    // below): reopening the same file (same deterministic id) should start
    // from a clean slate, not resurrect a notice about a disk change that may
    // no longer even be true by the time it's reopened.
    clearExternallyModified(id)
  }

  // Removes tabId from externallyModifiedTabIds if present, otherwise leaves
  // the Set reference untouched so callers can call this unconditionally
  // (e.g. on every successful save) without forcing an extra re-render.
  function clearExternallyModified(tabId: string) {
    setExternallyModifiedTabIds((prev) => {
      if (!prev.has(tabId)) return prev
      const next = new Set(prev)
      next.delete(tabId)
      return next
    })
  }

  // Mirrors clearExternallyModified above: only creates a new Set when tabId
  // isn't already flagged.
  function markExternallyModified(tabId: string) {
    setExternallyModifiedTabIds((prev) => {
      if (prev.has(tabId)) return prev
      const next = new Set(prev)
      next.add(tabId)
      return next
    })
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
          // A successful, non-stale save means whatever on-disk change
          // previously flagged this tab (if any) is now superseded by what
          // was just written — the 409 branch just below is what would have
          // fired instead if the on-disk content actually still conflicted.
          clearExternallyModified(tabId)
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
          clearExternallyModified(tab.id)
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
    // handleDiscardMine already adopts conflict.currentContent (the on-disk
    // content) as the tab's new content above, which IS the acknowledgment of
    // whatever external change triggered the flag — nothing left to warn
    // about.
    clearExternallyModified(conflict.tabId)
    setConflict(null)
  }

  function handleJumpToHeading(line: number) {
    // Scrolling to the heading's line is the main-content-view plan's job —
    // no rendered document content exists yet to scroll within.
    console.log('jump to heading', line)
  }

  // `syncToDaemon` marks who triggered this open. A local user action (the
  // default — clicking a file in the sidebar) POSTs to /api/tabs so the CLI
  // and other browsers see the tab. Applying an incoming tab-opened event
  // passes false: that event IS the daemon's broadcast of an open, so POSTing
  // in response would have the daemon broadcast tab-opened again to every
  // client including this one, which would open it again and POST again —
  // a broadcast echo loop. Only a genuinely local action may talk to the API.
  function openFile(rootId: number, relPath: string, syncToDaemon = true) {
    // Tab ids are deterministic (`${rootId}:${relPath}`), so "is this file
    // already open" is an id lookup. tabsRef rather than `tabs` for the same
    // reason as closeTab: this also runs from the WebSocket handler.
    const id = `${rootId}:${relPath}`
    const alreadyOpen = tabsRef.current.some((t) => t.id === id)
    if (!alreadyOpen) {
      const title = relPath.split('/').pop() ?? relPath
      // The duplicate check is repeated inside the updater because two events
      // for the same file can arrive in one tick, before tabsRef has caught
      // up with a re-render — appending twice would produce two tabs sharing
      // one id (duplicate React keys, and a close that only closes one).
      setTabs((prev) =>
        prev.some((t) => t.id === id)
          ? prev
          : [
              ...prev,
              { id, rootId, relPath, title, dirty: false, content: null, mtimeMs: null, encoding: 'utf-8', mode: 'view' },
            ]
      )
      if (syncToDaemon) syncTabToDaemon('POST', rootId, relPath)
    }
    // Focus the tab either way — for a remote open this is the visible effect
    // of `mvs open`, and for a local click on an already-open file it is the
    // pre-existing behavior. An already-open file is deliberately NOT re-POSTed:
    // the daemon already has it, and re-broadcasting would pull every other
    // client's focus around just because this user clicked a tab.
    setActiveTabId(id)
  }

  // Re-fetches this tab's content straight from the server and replaces it in
  // place — used when a live file-changed event arrives for a tab that's safe
  // to auto-refresh (see handleFileChanged below: not dirty, and
  // autoReloadViewingTabs is on). Deliberately independent of TabContent's own
  // load-on-null-content effect (TabContent only fetches once, when
  // tab.content is still null) since this needs to re-fetch content that's
  // already loaded.
  async function reloadTabContent(tabId: string, rootId: number, relPath: string) {
    try {
      const res = await apiFetch(`/api/file?root=${rootId}&path=${encodeURIComponent(relPath)}`)
      if (!res.ok) return
      const data = await res.json()
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId ? { ...t, content: data.content, mtimeMs: data.mtimeMs, encoding: data.encoding } : t
        )
      )
      clearExternallyModified(tabId)
    } catch {
      // Network hiccup mid-reload — leave the tab's previous content in
      // place rather than surfacing an error for what's just a best-effort
      // live-update; the next file-changed event (or a manual reopen) can
      // retry.
    }
  }

  // Forces FileTreePanel to refetch every root's file list: its own fetch
  // effect (src/frontend/components/FileTreePanel.tsx) is keyed on the
  // identity of the `roots` array, so handing it a new array (same root
  // objects, new outer reference) re-triggers that effect without needing to
  // change FileTreePanel's props/interface at all. This refreshes ALL roots
  // rather than just the one a file-added/file-removed event named — a
  // deliberately blunt approach per the task brief (YAGNI: a precise
  // per-root/partial-tree update is a performance optimization, not a
  // correctness requirement).
  function refreshFileTree() {
    setRoots((prev) => [...prev])
  }

  // file-changed event handler for useFileWatcher (see below). Only acts on
  // files that are actually open as a tab; other files changing on disk have
  // nothing in the UI to update yet (FileTreePanel doesn't show mtimes).
  function handleFileChanged(rootId: number, relPath: string) {
    // tabsRef, not `tabs`: this callback is handed to useFileWatcher once and
    // then called from a long-lived WebSocket message handler, potentially
    // long after the render that created this closure — see tabsRef's own
    // comment near the top of this component for why the ref (not the `tabs`
    // this closure captured) is the one guaranteed to be current.
    const tab = tabsRef.current.find((t) => t.rootId === rootId && t.relPath === relPath)
    if (!tab) return
    // A dirty tab can NEVER be silently overwritten here, regardless of
    // autoReloadViewingTabs — that pref only controls how eagerly a clean
    // tab picks up external changes, not whether an in-progress edit is safe
    // to discard. This is the first line of defense against silently losing
    // unsaved work; the real conflict check still happens at save time via
    // the existing PUT /api/file 409 flow (see handleSave/putFile above) —
    // this only prevents the softer, sneakier case of the *displayed*
    // content changing out from under someone who hasn't tried to save yet.
    if (tab.dirty || !prefs.autoReloadViewingTabs) {
      markExternallyModified(tab.id)
      return
    }
    reloadTabContent(tab.id, rootId, relPath)
  }

  // file-removed handler. Beyond refreshing the tree, a tab still showing the
  // deleted file must stop offering Edit/Split: saving would silently recreate
  // a file that was deliberately deleted (by a `rm`, a branch switch, another
  // tool), from content that is by then arbitrarily stale. The tab stays open
  // with its last-loaded content on purpose — that content may be the only
  // remaining copy in front of the user, so auto-closing would be the
  // destructive choice. This is the same "view only" posture non-UTF-8 files
  // already use (see TabContent's effectiveMode and the mode-toggle render
  // below), not a new mechanism.
  function handleFileRemoved(rootId: number, relPath: string) {
    setTabs((prev) =>
      prev.some((t) => t.rootId === rootId && t.relPath === relPath)
        ? prev.map((t) => (t.rootId === rootId && t.relPath === relPath ? { ...t, readOnly: true } : t))
        : prev
    )
    refreshFileTree()
  }

  // file-added handler. Lifts the read-only mark above when the same file
  // comes back: editors that save atomically (write a temp file, rename it
  // over the target) surface as remove-then-add, so without this a single
  // external save from vim/VS Code would permanently lock an open tab into
  // view-only with no way back short of closing and reopening it.
  function handleFileAdded(rootId: number, relPath: string) {
    setTabs((prev) =>
      prev.some((t) => t.rootId === rootId && t.relPath === relPath && t.readOnly)
        ? prev.map((t) => (t.rootId === rootId && t.relPath === relPath ? { ...t, readOnly: false } : t))
        : prev
    )
    refreshFileTree()
  }

  // tab-opened handler: another client opened this file — a `mvs open` from
  // the CLI, or a second browser. Reuse the exact same local open logic, with
  // syncToDaemon=false so this does not bounce straight back to the API (see
  // openFile's comment for the loop this prevents).
  function handleTabOpened(rootId: number, relPath: string) {
    openFile(rootId, relPath, false)
  }

  // tab-closed handler, mirroring handleTabOpened. Nothing to do if this
  // client never had the tab open (e.g. it was only ever open in another
  // browser) — the id lookup keeps that a no-op instead of pointless state
  // churn.
  function handleTabClosed(rootId: number, relPath: string) {
    const tab = tabsRef.current.find((t) => t.rootId === rootId && t.relPath === relPath)
    if (!tab) return
    closeTab(tab.id, false)
  }

  // root-added handler (POST /api/roots on another client, or `mvs add-root`).
  // Appends the root the event already carries rather than refetching
  // GET /api/roots: the payload has everything FileTreePanel needs, and a
  // refetch would be a second, racing source of truth for the same change.
  // Guarded against duplicates so a replayed/echoed event can't list one root
  // twice.
  function handleRootAdded(rootId: number, name: string) {
    setRoots((prev) => (prev.some((r) => r.id === rootId) ? prev : [...prev, { id: rootId, name }]))
  }

  // Connects once to the daemon's /ws and stays connected for the app's
  // lifetime (see useFileWatcher.ts for the reconnect-on-disconnect
  // behavior). One socket, one dispatch table: file events from the watcher,
  // tab events from the open-tabs API, root events from POST /api/roots.
  useFileWatcher({
    onFileChanged: handleFileChanged,
    onFileAdded: handleFileAdded,
    onFileRemoved: handleFileRemoved,
    onTabOpened: handleTabOpened,
    onTabClosed: handleTabClosed,
    onRootAdded: handleRootAdded,
  })

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

  async function handleShowPath() {
    // No active tab means there's nothing to show a path for — TopBar's
    // onShowPath is unconditional, so the caller-side decision of "should
    // this even do anything" lives here.
    if (!activeTab) return
    const res = await apiFetch(`/api/file-path?root=${activeTab.rootId}&path=${encodeURIComponent(activeTab.relPath)}`)
    if (!res.ok) {
      console.error('Failed to load /api/file-path', res.status)
      return
    }
    const data = await res.json()
    setCurrentPath(data.absolutePath)
    setPathModalOpen(true)
  }

  function handleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen().catch(() => {
        // Fullscreen can be denied (e.g. no user gesture, or the browser/
        // embedding context disallows it) — silently ignore, there's no
        // useful recovery action to offer here.
      })
    }
  }

  function handlePrint() {
    window.print()
  }

  // Ctrl+S/Cmd+S must work no matter where focus currently is inside the
  // content area, not just inside MarkdownEditor's own <textarea> — that
  // element's own keydown listener only covers Edit/Split's editor pane, so
  // View mode (no textarea at all) and Split's preview pane previously fell
  // through to the browser's native "Save Page" dialog. A window-level
  // listener catches every focus location, including no focus at all.
  //
  // `e.defaultPrevented` is how this avoids double-saving when the keydown
  // actually originated inside MarkdownEditor's textarea: that component's
  // own handler runs first (it's an ancestor-bound React onKeyDown, which
  // fires before this native listener sees the bubbled event) and calls
  // preventDefault() itself — seeing that here means the save already
  // happened, so this listener does nothing further.
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      const isSaveShortcut = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'
      if (!isSaveShortcut || e.defaultPrevented) return
      e.preventDefault()
      if (activeTab) handleSave(activeTab.id)
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  })

  return (
    <div data-testid="app-shell" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style data-testid="custom-css-style">{effectiveCustomCss}</style>
      <TopBar
        onOpenSettings={() => setSettingsOpen(true)}
        onFullscreen={handleFullscreen}
        onShowPath={handleShowPath}
        onPrint={handlePrint}
        updateAvailable={updateAvailable}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        updateSettings={updateSettings}
        prefs={prefs}
        setPref={setPref}
      />
      <PathModal open={pathModalOpen} path={currentPath} onClose={() => setPathModalOpen(false)} />
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
                  {/* .html tabs always render via HtmlView regardless of tab.mode (see
                      TabContent) — showing Edit/Split for them would be misleading UI
                      since clicking either does nothing visible. A readOnly tab (its
                      file was deleted on disk — see handleFileRemoved) is hidden the
                      same way, for the same reason: TabContent forces view mode for it,
                      so the toggles would do nothing. */}
                  {activeTab.encoding !== 'unknown' && !activeTab.readOnly && !activeTab.relPath.endsWith('.html') && (
                    <>
                      <button
                        data-testid="mode-edit"
                        aria-pressed={activeTab.mode === 'edit'}
                        // tab.encoding defaults to 'utf-8' until GET /api/file actually
                        // resolves, so before tab.content loads this button would
                        // otherwise look clickable/selectable even though the screen is
                        // still stuck on TabContent's "Loading..." placeholder.
                        disabled={activeTab.content === null}
                        onClick={() => handleModeChange(activeTab.id, 'edit')}
                      >
                        {t('modeToggle.edit', 'Edit')}
                      </button>
                      <button
                        data-testid="mode-split"
                        aria-pressed={activeTab.mode === 'split'}
                        disabled={activeTab.content === null}
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
                    allowHtmlScripts={settings?.effective?.allowHtmlScripts ?? false}
                    // Both fall back to the SAFE posture while settings are
                    // unknown (still loading, or the fetch failed and
                    // useSettings deliberately kept settings null): scripts
                    // off, remote content blocked. For blockRemoteContent that
                    // means defaulting to `true` — a document must not get to
                    // phone home during the window where we cannot yet tell
                    // whether privacy mode is on.
                    blockRemoteContent={settings?.effective?.blockRemoteContent ?? true}
                    // Same safe-default reasoning: while settings are unknown,
                    // never let PlantUmlView call the proxy.
                    sendToPlantUmlServer={settings?.effective?.sendToPlantUmlServer ?? false}
                  />
                </div>
                {externallyModifiedTabIds.has(activeTab.id) &&
                  (!conflict || conflict.tabId !== activeTab.id) && (
                    // Passive notice only — see handleFileChanged above for why
                    // this never auto-replaces the tab's content itself. The
                    // conflict dialog (below) is a stronger, more actionable
                    // signal for the same underlying situation, so this stays
                    // hidden while that's showing for this tab rather than
                    // stacking both.
                    <div data-testid="file-updated-banner" role="status" style={{ padding: '4px 12px', color: '#8a6d00' }}>
                      {t('app.fileUpdatedExternally', 'This file changed on disk.')}
                    </div>
                  )}
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
