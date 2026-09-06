export interface Tab {
  id: string
  rootId: number
  relPath: string
  title: string
  dirty: boolean
}

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
}

export function TabBar({ tabs, activeTabId, onSelect, onClose }: TabBarProps) {
  return (
    <div data-testid="tab-bar" style={{ display: 'flex' }}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          style={{ fontWeight: tab.id === activeTabId ? 'bold' : 'normal' }}
        >
          {tab.dirty ? '● ' : ''}
          {tab.title}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose(tab.id)
            }}
            aria-label={`close ${tab.title}`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
