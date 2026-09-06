import { useEffect, useState } from 'react'
import { apiFetch } from './api-client.js'
import { TopBar } from './components/TopBar.js'
import { TabBar, type Tab } from './components/TabBar.js'
import { Sidebar, type SidebarMode } from './components/Sidebar.js'
import { FileTreePanel, type FileSearchResults } from './components/FileTreePanel.js'
import { OutlinePanel, type HeadingFilter } from './components/OutlinePanel.js'
import { SearchBar, type FilesSearchOptions, type OutlineSearchOptions } from './components/SearchBar.js'

export function App() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('files')
  const [roots, setRoots] = useState<Array<{ id: number; name: string }>>([])
  const [fileSearchResults, setFileSearchResults] = useState<FileSearchResults | null>(null)
  const [outlineSearchFilter, setOutlineSearchFilter] = useState<HeadingFilter | null>(null)

  useEffect(() => {
    apiFetch('/api/roots')
      .then((res) => res.json())
      .then(setRoots)
  }, [])

  function closeTab(id: string) {
    setTabs((prev) => prev.filter((t) => t.id !== id))
    setActiveTabId((prev) => (prev === id ? null : prev))
  }

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

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
    setTabs((prev) => [...prev, { id, rootId, relPath, title, dirty: false }])
    setActiveTabId(id)
  }

  async function handleFileSearch(query: string, options: FilesSearchOptions) {
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
          const openPaths = tabs
            .filter((t) => t.rootId === root.id)
            .map((t) => t.relPath)
            .join(',')
          params.set('openPaths', openPaths)
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
                activeTab={activeTab ? { rootId: activeTab.rootId, relPath: activeTab.relPath } : null}
                onJumpToHeading={handleJumpToHeading}
                headingFilter={outlineSearchFilter}
              />
            </>
          )}
        </Sidebar>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <TabBar tabs={tabs} activeTabId={activeTabId} onSelect={setActiveTabId} onClose={closeTab} />
          <div style={{ flex: 1, overflow: 'auto' }}>{/* main content area: later plan */}</div>
        </div>
      </div>
    </div>
  )
}
