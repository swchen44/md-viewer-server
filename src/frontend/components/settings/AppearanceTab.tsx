import { useTranslation } from 'react-i18next'
import type { LocalPrefs } from '../../hooks/useLocalPrefs.js'

interface AppearanceTabProps {
  prefs: LocalPrefs
  setPref: <K extends keyof LocalPrefs>(key: K, value: LocalPrefs[K]) => void
}

const THEME_OPTIONS = ['light', 'dark', 'system'] as const

export function AppearanceTab({ prefs, setPref }: AppearanceTabProps) {
  const { t } = useTranslation()

  return (
    <div>
      <fieldset>
        <legend>{t('settings.theme', 'Theme')}</legend>
        {THEME_OPTIONS.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name="theme"
              checked={prefs.theme === option}
              onChange={() => setPref('theme', option)}
            />
            {t(
              `settings.theme${option[0].toUpperCase()}${option.slice(1)}`,
              option[0].toUpperCase() + option.slice(1)
            )}
          </label>
        ))}
      </fieldset>

      <label>
        {t('settings.accentColor', 'Accent color')}
        <input
          type="color"
          value={prefs.accentColor}
          onChange={(e) => setPref('accentColor', e.target.value)}
        />
      </label>

      <label>
        {t('settings.editorFontSize', 'Editor font size')}
        <input
          type="number"
          value={prefs.editorFontSize}
          onChange={(e) => setPref('editorFontSize', Number(e.target.value))}
        />
      </label>

      <label>
        {t('settings.editorIndentWidth', 'Editor indent width')}
        <input
          type="number"
          value={prefs.editorIndentWidth}
          onChange={(e) => setPref('editorIndentWidth', Number(e.target.value))}
        />
      </label>
    </div>
  )
}
