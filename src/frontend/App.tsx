import { useEffect, useState } from 'react'
import { apiFetch } from './api-client.js'
import { TopBar } from './components/TopBar.js'
import { TabBar, type Tab } from './components/TabBar.js'
import { Sidebar, type SidebarMode } from './components/Sidebar.js'
import { FileTreePanel } from './components/FileTreePanel.js'
import { OutlinePanel } from './components/OutlinePanel.js'

export function App() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('files')
  const [roots, setRoots] = useState<Array<{ id: number; name: string }>>([])

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

  return (
    <div data-testid="app-shell" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar mode={sidebarMode} onModeChange={setSidebarMode}>
          {sidebarMode === 'files' && <FileTreePanel roots={roots} onOpenFile={openFile} />}
          {sidebarMode === 'outline' && (
            <OutlinePanel
              activeTab={activeTab ? { rootId: activeTab.rootId, relPath: activeTab.relPath } : null}
              onJumpToHeading={handleJumpToHeading}
            />
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
