import type { Settings } from '../../hooks/useSettings.js'

// Shared by every settings tab that fires a fire-and-forget PUT from an
// onChange/onBlur/onClick handler (GeneralTab's checkboxes and PlantUML URL
// field, CustomCssTab's choice buttons and Apply button). `updateSettings`
// (useSettings.ts) does its own PUT and does not itself catch a
// network-level fetch rejection, and none of these call sites await it —
// they need the UI to feel instant, not wait on a round-trip — so a dropped
// connection must not surface as an unhandled promise rejection. The hook
// already tracks/exposes its own `error` state for a real failure; this
// swallow only prevents the rejection from going unhandled.
export function applySettingsPatch(
  updateSettings: (patch: Partial<Settings>) => void | Promise<void>,
  patch: Partial<Settings>
) {
  Promise.resolve(updateSettings(patch)).catch(() => {})
}
