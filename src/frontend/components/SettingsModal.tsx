import { useState } from 'react'
import { useTranslation } from 'react-i18next'

type Category = 'general' | 'appearance' | 'customCss'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
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
        {/* Task 6/7/8 replace this with GeneralTab/AppearanceTab/CustomCssTab based on `category` */}
      </div>
      <button aria-label="close" onClick={onClose}>
        ×
      </button>
    </div>
  )
}
