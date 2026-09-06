import { useTranslation } from 'react-i18next'

interface TopBarProps {
  onOpenSettings: () => void
}

export function TopBar({ onOpenSettings }: TopBarProps) {
  const { t } = useTranslation()
  return (
    <header
      data-testid="top-bar"
      style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px' }}
    >
      <span>MD Viewer Server</span>
      <div>
        <button aria-label={t('topBar.settingsLabel', 'Settings')} onClick={onOpenSettings}>
          ⚙
        </button>
      </div>
    </header>
  )
}
