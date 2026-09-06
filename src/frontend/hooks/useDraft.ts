import { useCallback, useState } from 'react'

function draftKey(rootId: number, relPath: string): string {
  return `mvs-draft:${rootId}:${relPath}`
}

export function useDraft(rootId: number, relPath: string) {
  const key = draftKey(rootId, relPath)
  const [draft, setDraft] = useState<string | null>(() => localStorage.getItem(key))

  const saveDraft = useCallback(
    (content: string) => {
      localStorage.setItem(key, content)
      setDraft(content)
    },
    [key]
  )

  const clearDraft = useCallback(() => {
    localStorage.removeItem(key)
    setDraft(null)
  }, [key])

  return { draft, saveDraft, clearDraft }
}
