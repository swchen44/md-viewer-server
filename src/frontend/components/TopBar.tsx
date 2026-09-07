import { useTranslation } from 'react-i18next'

interface TopBarProps {
  onOpenSettings: () => void
  onFullscreen: () => void
  onShowPath: () => void
  onPrint: () => void
}

export function TopBar({ onOpenSettings, onFullscreen, onShowPath, onPrint }: TopBarProps) {
  const { t } = useTranslation()
  return (
    <header
      data-testid="top-bar"
      style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px' }}
    >
      <span>MD Viewer Server</span>
      <div>
        <button aria-label={t('topBar.fullscreenLabel', 'Fullscreen')} onClick={onFullscreen}>
          ⛶
        </button>
        <button aria-label={t('topBar.showPathLabel', 'Show path')} onClick={onShowPath}>
          🔗
        </button>
        <button aria-label={t('topBar.printLabel', 'Print')} onClick={onPrint}>
          🖨
        </button>
        <button aria-label={t('topBar.settingsLabel', 'Settings')} onClick={onOpenSettings}>
          ⚙
        </button>
      </div>
    </header>
  )
}
