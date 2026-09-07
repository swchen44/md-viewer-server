import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Settings } from '../../hooks/useSettings.js'
import type { LocalPrefs } from '../../hooks/useLocalPrefs.js'
import { applySettingsPatch } from './apply-settings-patch.js'

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

  // Fire-and-forget PUT wrapper — see apply-settings-patch.ts for why this is
  // needed (shared with CustomCssTab.tsx).
  function applySetting(patch: Partial<Settings>) {
    applySettingsPatch(updateSettings, patch)
  }

  // The PlantUML server URL field is free text, so every keystroke can be an
  // incomplete/invalid URL (e.g. "https://" while typing the host). Committing
  // on every onChange would fire a PUT per keystroke, each one liable to fail
  // `assertValidPlantUmlServerUrl` server-side and write config.json for
  // nothing. So the visible value is local state, and only onBlur commits it.
  //
  // Adjust state during render (React's documented pattern for resetting
  // state when a prop changes, used the same way in OutlinePanel.tsx's
  // `prevActiveTab` and CustomCssTab.tsx's `prevSettingsChoice`) rather than
  // in a useEffect, which this repo's react-hooks/set-state-in-effect lint
  // rule flags. This keeps the field in sync with `settings.plantumlServerUrl`
  // when it changes from OUTSIDE this component (initial null -> loaded
  // transition, or a genuinely external change), without clobbering what the
  // user is actively typing on every render.
  const [plantumlUrlDraft, setPlantumlUrlDraft] = useState(settings?.plantumlServerUrl ?? '')
  const [prevSettingsUrl, setPrevSettingsUrl] = useState<string | null>(
    settings?.plantumlServerUrl ?? null
  )
  if (settings && settings.plantumlServerUrl !== prevSettingsUrl) {
    setPrevSettingsUrl(settings.plantumlServerUrl)
    setPlantumlUrlDraft(settings.plantumlServerUrl)
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
                value={plantumlUrlDraft}
                onChange={(e) => setPlantumlUrlDraft(e.target.value)}
                onBlur={() => applySetting({ plantumlServerUrl: plantumlUrlDraft })}
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
