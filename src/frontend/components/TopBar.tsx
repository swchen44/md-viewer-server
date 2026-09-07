import { useTranslation } from 'react-i18next'

interface TopBarProps {
  onOpenSettings: () => void
  onFullscreen: () => void
  onShowPath: () => void
  onPrint: () => void
  updateAvailable?: { latestVersion: string } | null
}

export function TopBar({
  onOpenSettings,
  onFullscreen,
  onShowPath,
  onPrint,
  updateAvailable,
}: TopBarProps) {
  const { t } = useTranslation()
  return (
    <header
      data-testid="top-bar"
      style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px' }}
    >
      <span>MD Viewer Server</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {updateAvailable && (
          <span>
            {
              // react-i18next's `t()` only interpolates {{version}} when a real
              // i18next instance is initialized (this app's tests deliberately
              // never do that for isolated component tests — see
              // ConflictDialog.test.tsx/TabContent.test.tsx, which compare
              // literal default strings against en.json instead). When no
              // instance exists, `t()` falls back to returning the default
              // string verbatim, options ignored entirely, leaving the literal
              // "{{version}}" placeholder in place. The explicit .replace()
              // below is a no-op once real i18next has already substituted the
              // value (nothing left to match), so this line is correct in both
              // modes without depending on which one is active.
              t('topBar.updateAvailable', 'Update available: {{version}}', {
                version: updateAvailable.latestVersion,
              }).replace('{{version}}', updateAvailable.latestVersion)
            }
          </span>
        )}
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
