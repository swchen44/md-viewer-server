import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Settings, CustomCssChoice } from '../../hooks/useSettings.js'
import { EDITORIAL_CSS, DEVELOPER_CSS } from '../../custom-css-presets.js'
import { applySettingsPatch } from './apply-settings-patch.js'

interface CustomCssTabProps {
  settings: Settings | null
  updateSettings: (patch: Partial<Settings>) => void | Promise<void>
}

const CHOICES: CustomCssChoice[] = ['editorial', 'developer', 'user1', 'user2']

const CHOICE_LABELS: Record<CustomCssChoice, { key: string; fallback: string }> = {
  editorial: { key: 'settings.cssChoiceEditorial', fallback: 'Editorial (readonly)' },
  developer: { key: 'settings.cssChoiceDeveloper', fallback: 'Developer (readonly)' },
  user1: { key: 'settings.cssChoiceUser1', fallback: 'User 1' },
  user2: { key: 'settings.cssChoiceUser2', fallback: 'User 2' },
}

function resolveDisplay(settings: Settings, choice: CustomCssChoice): { content: string; readonly: boolean } {
  if (choice === 'editorial') return { content: EDITORIAL_CSS, readonly: true }
  if (choice === 'developer') return { content: DEVELOPER_CSS, readonly: true }
  if (choice === 'user2') return { content: settings.customCssUser2, readonly: false }
  return { content: settings.customCssUser1, readonly: false }
}

export function CustomCssTab({ settings, updateSettings }: CustomCssTabProps) {
  const { t } = useTranslation()

  // `activeChoice` is deliberately its own local state rather than reading
  // `settings.customCssChoice` directly on every render. The four options are
  // a real single-select that must flip the instant the user clicks one —
  // per the brief, selecting user1/user2 becomes the active choice
  // immediately too, not only once the PUT round-trip that persists it
  // resolves. Deriving straight from the prop would leave the UI waiting on
  // the network for what should be instant local feedback.
  const [activeChoice, setActiveChoice] = useState<CustomCssChoice>(settings?.customCssChoice ?? 'editorial')
  // Local-only draft for whichever user slot is active — see applyDraft for
  // when it actually gets persisted.
  const [draft, setDraft] = useState<string | null>(null)

  // Adjust state during render (React's documented pattern for resetting
  // state when a prop changes, already used the same way in
  // OutlinePanel.tsx's `prevActiveTab` and SearchBar.tsx's `prevMode`)
  // rather than in a useEffect, which this repo's react-hooks/set-state-in-effect
  // lint rule flags. This keeps `activeChoice` correct for the one case the
  // local click-driven state above can't cover on its own: `settings` arriving
  // (or changing) from OUTSIDE this component — e.g. the initial `null` ->
  // loaded transition, since useState's initializer only runs once at mount.
  // A genuinely EXTERNAL change here also means it wasn't this component's own
  // in-progress edit, so any unapplied draft is discarded too — consistent
  // with the brief's "no cross-choice draft stash" rule.
  const [prevSettingsChoice, setPrevSettingsChoice] = useState<CustomCssChoice | null>(
    settings?.customCssChoice ?? null
  )
  if (settings && settings.customCssChoice !== prevSettingsChoice) {
    setPrevSettingsChoice(settings.customCssChoice)
    // "Different from the last value of the prop" is NOT the same as
    // "external": selecting a choice sets `activeChoice` locally and fires a
    // PUT, so the prop changes to that same choice a round-trip later as a
    // pure ECHO of our own click. Resetting on that echo would wipe whatever
    // the user typed in the meantime. Only when the incoming choice differs
    // from what this component already considers active did the change come
    // from somewhere else (initial load, another client, another tab of this
    // UI) and warrant resetting the local state.
    if (settings.customCssChoice !== activeChoice) {
      setActiveChoice(settings.customCssChoice)
      setDraft(null)
    }
  }

  // Drop an applied draft only once the source of truth has caught up with it.
  // `applyDraft` deliberately does NOT clear `draft` itself: the PUT is still
  // in flight at that point and `settings` still holds the pre-Apply content,
  // so clearing there would flash the textarea back to the old CSS — and, if
  // the PUT fails, would drop the user's typed CSS from the UI for good. When
  // the PUT succeeds, `settings` arrives carrying exactly what was applied and
  // the local copy is redundant, so it's released here; when it fails,
  // `settings` never matches and the draft stays visible and editable.
  if (settings && draft !== null && (activeChoice === 'user1' || activeChoice === 'user2')) {
    const stored = activeChoice === 'user2' ? settings.customCssUser2 : settings.customCssUser1
    if (stored === draft) setDraft(null)
  }

  if (!settings) return null

  const { content, readonly } = resolveDisplay(settings, activeChoice)
  const displayedValue = draft ?? content

  function selectChoice(choice: CustomCssChoice) {
    // Switching choices (built-in or user slot alike) is immediately
    // effective — see the note on `activeChoice` above — and drops any
    // unapplied draft for whichever choice was showing before (YAGNI: no
    // cross-choice draft stash).
    setActiveChoice(choice)
    setDraft(null)
    applySettingsPatch(updateSettings, { customCssChoice: choice })
  }

  function applyDraft() {
    if (draft === null) return
    if (activeChoice === 'user2') {
      applySettingsPatch(updateSettings, { customCssChoice: activeChoice, customCssUser2: draft })
    } else {
      applySettingsPatch(updateSettings, { customCssChoice: activeChoice, customCssUser1: draft })
    }
    // No `setDraft(null)` here on purpose — see the render-time sync above:
    // the draft is released only once `settings` reflects the applied value.
  }

  return (
    <div>
      <div role="group">
        {CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={activeChoice === choice}
            onClick={() => selectChoice(choice)}
          >
            {t(CHOICE_LABELS[choice].key, CHOICE_LABELS[choice].fallback)}
          </button>
        ))}
      </div>
      {readonly && (
        <p>
          {t(
            'settings.cssReadonlyHint',
            'Built-in presets are readonly. Select User 1 or User 2 to write your own CSS.'
          )}
        </p>
      )}
      <textarea
        value={displayedValue}
        readOnly={readonly}
        onChange={(e) => {
          if (!readonly) setDraft(e.target.value)
        }}
        rows={12}
      />
      {!readonly && <button type="button" onClick={applyDraft}>{t('settings.cssApply', 'Apply')}</button>}
    </div>
  )
}
