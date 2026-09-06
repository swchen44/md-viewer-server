import { useCallback, useState } from 'react'

function draftKey(rootId: number, relPath: string): string {
  return `mvs-draft:${rootId}:${relPath}`
}

function loadDraft(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    // localStorage can throw (private browsing, quota exceeded, storage
    // disabled by browser settings) — treat that as "no draft" rather than
    // crashing the tab that's about to render.
    return null
  }
}

export function useDraft(rootId: number, relPath: string) {
  const key = draftKey(rootId, relPath)
  const [draft, setDraft] = useState<string | null>(() => loadDraft(key))

  // A consumer (e.g. TabContent, in a later task) can be rerendered in place
  // for a different rootId/relPath rather than remounted — same pattern as
  // useSearchHistory's `prevMode` handling. Adjust state during render
  // (rather than in a useEffect, which this repo's react-hooks/set-state-in-
  // effect lint rule flags) so the previous file's draft is gone before this
  // render commits, instead of only once a later effect runs.
  const [prevKey, setPrevKey] = useState(key)
  if (prevKey !== key) {
    setPrevKey(key)
    setDraft(loadDraft(key))
  }

  const saveDraft = useCallback(
    (content: string) => {
      try {
        localStorage.setItem(key, content)
      } catch {
        // Persistence is best-effort: the in-memory state must still update
        // even if the write to disk fails, degrading to "the draft doesn't
        // survive a reload" rather than breaking editing.
      }
      setDraft(content)
    },
    [key]
  )

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(key)
    } catch {
      // See saveDraft's comment above.
    }
    setDraft(null)
  }, [key])

  return { draft, saveDraft, clearDraft }
}
