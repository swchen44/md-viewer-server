import { useTranslation } from 'react-i18next'
import type { Settings } from '../../hooks/useSettings.js'
import type { LocalPrefs } from '../../hooks/useLocalPrefs.js'

interface GeneralTabProps {
  settings: Settings | null
  updateSettings: (patch: Partial<Settings>) => void | Promise<void>
  prefs: LocalPrefs
  setPref: <K extends keyof LocalPrefs>(key: K, value: LocalPrefs[K]) => void
}

export function GeneralTab({ settings, updateSettings, prefs, setPref }: GeneralTabProps) {
  const { t, i18n } = useTranslation()
  const locked = settings?.privacyMode ?? false

  // While privacy mode is on, the server forces blockRemoteContent /
  // sendToPlantUmlServer / allowHtmlScripts to safe values (settings.effective)
  // and every consumer honours those, but the user's own stored preference is
  // kept untouched so unlocking restores it. These checkboxes therefore show
  // the EFFECTIVE value while locked — showing the raw one would claim e.g.
  // "HTML scripts allowed" while the server is refusing to allow them — and
  // the raw one once unlocked, where it is what actually applies again.
  // Display only: nothing here rewrites the stored value.

  // updateSettings (useSettings.ts) does its own PUT and does not itself
  // catch a network-level fetch rejection — it's a fire-and-forget call from
  // these onChange handlers (nothing here awaits it, matching how a simple
  // checkbox toggle is handled elsewhere in this codebase), so a dropped
  // connection must not surface as an unhandled promise rejection. The
  // hook already tracks/exposes its own `error` state for a real failure;
  // this swallow only prevents the rejection from going unhandled.
  function applySetting(patch: Partial<Settings>) {
    Promise.resolve(updateSettings(patch)).catch(() => {})
  }

  return (
    <div>
      <label>
        {t('settings.language', 'Language')}
        <select value={i18n.language} onChange={(e) => i18n.changeLanguage(e.target.value)}>
          <option value="en">English</option>
          <option value="zh-TW">繁體中文</option>
          <option value="zh-CN">简体中文</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
        </select>
      </label>

      <label>
        <input
          type="checkbox"
          checked={prefs.renderTxtAsMarkdown}
          onChange={(e) => setPref('renderTxtAsMarkdown', e.target.checked)}
        />
        {t('settings.renderTxtAsMarkdown', 'Render .txt files as Markdown')}
      </label>
      <label>
        <input
          type="checkbox"
          checked={prefs.showHiddenFiles}
          onChange={(e) => setPref('showHiddenFiles', e.target.checked)}
        />
        {t('settings.showHiddenFiles', 'Show hidden files')}
      </label>
      <label>
        <input
          type="checkbox"
          checked={prefs.outlineDefaultCollapsed}
          onChange={(e) => setPref('outlineDefaultCollapsed', e.target.checked)}
        />
        {t('settings.outlineCollapsed', 'Outline panel collapsed by default')}
      </label>
      <label>
        <input
          type="checkbox"
          checked={prefs.charsetCompatMode}
          onChange={(e) => setPref('charsetCompatMode', e.target.checked)}
        />
        {t('settings.charsetCompatMode', 'Charset compatibility mode (force UTF-8 redecoding)')}
      </label>
      <label>
        <input
          type="checkbox"
          checked={prefs.autoReloadViewingTabs}
          onChange={(e) => setPref('autoReloadViewingTabs', e.target.checked)}
        />
        {t('settings.autoReload', 'Auto-reload viewing tabs on file change')}
      </label>

      {settings && (
        <>
          <label>
            <input
              type="checkbox"
              checked={settings.bakOnSave}
              onChange={(e) => applySetting({ bakOnSave: e.target.checked })}
            />
            {t('settings.bakOnSave', 'Create .bak backup on save')}
          </label>

          <fieldset>
            <legend>{t('settings.privacyModeLabel', 'Privacy mode')}</legend>
            <label>
              <input
                type="checkbox"
                checked={settings.privacyMode}
                onChange={(e) => applySetting({ privacyMode: e.target.checked })}
              />
              {t('settings.privacyModeLabel', 'Privacy mode')}
            </label>
            <label>
              <input
                type="checkbox"
                disabled={locked}
                checked={locked ? settings.effective.blockRemoteContent : settings.blockRemoteContent}
                onChange={(e) => applySetting({ blockRemoteContent: e.target.checked })}
              />
              {t('settings.blockRemoteContent', 'Block remote images/videos/iframes in documents')}
            </label>
            <label>
              {t('settings.plantumlServerUrl', 'PlantUML server URL')}
              <input
                type="text"
                value={settings.plantumlServerUrl}
                onChange={(e) => applySetting({ plantumlServerUrl: e.target.value })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                disabled={locked}
                checked={
                  locked ? settings.effective.sendToPlantUmlServer : settings.sendToPlantUmlServer
                }
                onChange={(e) => applySetting({ sendToPlantUmlServer: e.target.checked })}
              />
              {t('settings.sendToPlantUmlServer', 'Send diagram source to PlantUML server')}
            </label>
            <label>
              <input
                type="checkbox"
                disabled={locked}
                checked={locked ? settings.effective.allowHtmlScripts : settings.allowHtmlScripts}
                onChange={(e) => applySetting({ allowHtmlScripts: e.target.checked })}
              />
              {t('settings.allowHtmlScripts', 'Allow HTML files to execute scripts')}
            </label>
          </fieldset>
        </>
      )}
    </div>
  )
}
