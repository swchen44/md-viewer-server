import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export type SidebarMode = 'files' | 'outline'

interface SidebarProps {
  mode: SidebarMode
  onModeChange: (mode: SidebarMode) => void
  children?: ReactNode
}

export function Sidebar({ mode, onModeChange, children }: SidebarProps) {
  const { t } = useTranslation()
  return (
    <aside
      data-testid="sidebar"
      data-mode={mode}
      style={{ width: 240, display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex' }}>
        <button aria-pressed={mode === 'files'} onClick={() => onModeChange('files')}>
          {t('sidebar.filesTab')}
        </button>
        <button aria-pressed={mode === 'outline'} onClick={() => onModeChange('outline')}>
          {t('sidebar.outlineTab')}
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>{children}</div>
    </aside>
  )
}
