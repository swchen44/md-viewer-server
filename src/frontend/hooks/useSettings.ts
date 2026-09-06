import { useCallback, useEffect, useRef, useState } from 'react'
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

  // Single "am I still mounted" flag shared by the mount-time fetch effect
  // below AND `updateSettings`. An effect-local `cancelled` flag (as
  // OutlinePanel's mount-time fetch uses) only covers that one effect's
  // lifetime; `updateSettings` is a callback that can be invoked on demand,
  // possibly many times, and can still be in flight after this hook's
  // component has unmounted (its cleanup already ran), so it needs a flag
  // that outlives any single effect. Set once on unmount, checked before
  // every `setSettings`/`setError` call everywhere in this hook.
  const mountedRef = useRef(true)
  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    apiFetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (!mountedRef.current) return
        setSettings(data)
      })
  }, [])

  // Guards against two races on `updateSettings`:
  //  - unmount: the hook's component can unmount while a PUT is in flight
  //    (see mountedRef above).
  //  - out-of-order responses: rapid successive calls (e.g. toggling two
  //    settings back to back) can have their PUT responses arrive out of
  //    order, so a stale response must not clobber a newer call's result.
  //    Same "ignore stale responses via an issue-order sequence number"
  //    idiom as App.tsx's `fileSearchSeqRef` guarding /api/search.
  const requestSeqRef = useRef(0)

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const seq = ++requestSeqRef.current
    const res = await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = await res.json()
    if (!mountedRef.current || seq !== requestSeqRef.current) return
    if (!res.ok) {
      setError(data.errorCode ?? 'UNKNOWN_ERROR')
      return
    }
    setError(null)
    setSettings(data)
  }, [])

  return { settings, updateSettings, error }
}
