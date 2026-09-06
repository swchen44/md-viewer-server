import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api-client.js'

export type CustomCssChoice = 'editorial' | 'developer' | 'user1' | 'user2'

export interface Settings {
  plantumlServerUrl: string
  sendToPlantUmlServer: boolean
  privacyMode: boolean
  blockRemoteContent: boolean
  allowHtmlScripts: boolean
  bakOnSave: boolean
  customCssChoice: CustomCssChoice
  customCssUser1: string
  customCssUser2: string
  effective: {
    blockRemoteContent: boolean
    sendToPlantUmlServer: boolean
    allowHtmlScripts: boolean
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Same `cancelled` guard as OutlinePanel's mount-time fetch: this component
  // could unmount (or, in a future task, this hook could be called from a
  // component that unmounts) before the response arrives, and setting state
  // after that point is both a React warning and pointless work.
  useEffect(() => {
    let cancelled = false
    apiFetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setSettings(data)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const res = await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.errorCode ?? 'UNKNOWN_ERROR')
      return
    }
    setError(null)
    setSettings(data)
  }, [])

  return { settings, updateSettings, error }
}
