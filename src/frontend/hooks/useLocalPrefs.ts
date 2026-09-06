import { useCallback, useState } from 'react'

export interface LocalPrefs {
  theme: 'light' | 'dark' | 'system'
  accentColor: string
  editorFontSize: number
  editorIndentWidth: number
  showHiddenFiles: boolean
  outlineDefaultCollapsed: boolean
  charsetCompatMode: boolean
  autoReloadViewingTabs: boolean
  renderTxtAsMarkdown: boolean
}

export const DEFAULT_LOCAL_PREFS: LocalPrefs = {
  theme: 'system',
  accentColor: '#2f6fed',
  editorFontSize: 14,
  editorIndentWidth: 2,
  showHiddenFiles: false,
  outlineDefaultCollapsed: false,
  charsetCompatMode: false,
  autoReloadViewingTabs: true,
  renderTxtAsMarkdown: false,
}

const STORAGE_KEY = 'mvs-local-prefs'

function loadPrefs(): LocalPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_LOCAL_PREFS
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_LOCAL_PREFS, ...parsed }
  } catch {
    // localStorage.getItem can throw (private browsing, storage disabled by
    // browser settings) and JSON.parse can throw on corrupt/partial data —
    // either way, fall back to defaults rather than crashing the app on load.
    return DEFAULT_LOCAL_PREFS
  }
}

function persist(prefs: LocalPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // localStorage.setItem can throw (private browsing, quota exceeded,
    // storage disabled by browser settings). Persistence is best-effort: the
    // in-memory React state update must still succeed, degrading to
    // "preferences don't survive a reload" rather than breaking the UI.
  }
}

export function useLocalPrefs() {
  const [prefs, setPrefs] = useState<LocalPrefs>(loadPrefs)

  const setPref = useCallback(<K extends keyof LocalPrefs>(key: K, value: LocalPrefs[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value }
      persist(next)
      return next
    })
  }, [])

  return { prefs, setPref }
}
