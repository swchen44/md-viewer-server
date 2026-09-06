import { useState } from 'react'
import { TopBar } from './components/TopBar.js'
import { TabBar, type Tab } from './components/TabBar.js'
import { Sidebar, type SidebarMode } from './components/Sidebar.js'

export function App() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('files')

  function closeTab(id: string) {
    setTabs((prev) => prev.filter((t) => t.id !== id))
    setActiveTabId((prev) => (prev === id ? null : prev))
  }

  return (
    <div data-testid="app-shell" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar mode={sidebarMode} onModeChange={setSidebarMode} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <TabBar tabs={tabs} activeTabId={activeTabId} onSelect={setActiveTabId} onClose={closeTab} />
          <div style={{ flex: 1, overflow: 'auto' }}>{/* main content area: later plan */}</div>
        </div>
      </div>
    </div>
  )
}
