import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Settings } from '../hooks/useSettings.js'
import { DEFAULT_LOCAL_PREFS, type LocalPrefs } from '../hooks/useLocalPrefs.js'
import { GeneralTab } from './settings/GeneralTab.js'

type Category = 'general' | 'appearance' | 'customCss'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  settings?: Settings | null
  updateSettings?: (patch: Partial<Settings>) => void | Promise<void>
  prefs?: LocalPrefs
  setPref?: <K extends keyof LocalPrefs>(key: K, value: LocalPrefs[K]) => void
}

export function SettingsModal({
  open,
  onClose,
  settings = null,
  updateSettings = () => {},
  prefs = DEFAULT_LOCAL_PREFS,
  setPref = () => {},
}: SettingsModalProps) {
  const { t } = useTranslation()
  const [category, setCategory] = useState<Category>('general')

  if (!open) return null

  return (
    <div role="dialog" aria-label={t('settings.dialogTitle', 'Settings')} style={{ display: 'flex' }}>
      <nav>
        <button aria-pressed={category === 'general'} onClick={() => setCategory('general')}>
          {t('settings.generalTab', 'General')}
        </button>
        <button aria-pressed={category === 'appearance'} onClick={() => setCategory('appearance')}>
          {t('settings.appearanceTab', 'Appearance')}
        </button>
        <button aria-pressed={category === 'customCss'} onClick={() => setCategory('customCss')}>
          {t('settings.customCssTab', 'Custom CSS')}
        </button>
      </nav>
      <div data-testid="settings-tab-content">
        {category === 'general' && (
          <GeneralTab settings={settings} updateSettings={updateSettings} prefs={prefs} setPref={setPref} />
        )}
        {/* Task 7/8 replace this with AppearanceTab/CustomCssTab based on `category` */}
      </div>
      <button aria-label="close" onClick={onClose}>
        ×
      </button>
    </div>
  )
}
