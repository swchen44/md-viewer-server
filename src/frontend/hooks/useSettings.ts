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
  checkForUpdates: boolean
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

  const reloadSettings = useCallback(async () => {
    try {
      const res = await apiFetch('/api/settings')
      if (!res.ok) {
        // A non-ok body (401 UNAUTHORIZED on a stale token after
        // --rotate-token, 500, an HTML error page from something upstream)
        // must NOT become the settings object. Doing so is worse than
        // useless for the privacy-lock UI: GeneralTab derives
        // `locked = settings?.privacyMode ?? false` and each checkbox from
        // these fields, so an error body silently paints every privacy
        // control as unlocked/off while the server may in fact have privacy
        // mode ON. Keeping `settings` null instead makes the tab render its
        // loading state (no controls at all), which is honest. Mirrors
        // App.tsx's /api/roots mount effect.
        let errorCode: string | undefined
        try {
          const body = await res.json()
          errorCode = body?.errorCode
        } catch {
          // Non-JSON body — fall through with errorCode left undefined.
        }
        console.error('Failed to load /api/settings', res.status, errorCode)
        if (!mountedRef.current) return
        setError(errorCode ?? 'UNKNOWN_ERROR')
        return
      }
      const data = await res.json()
      if (!mountedRef.current) return
      setError(null)
      setSettings(data)
    } catch (err) {
        // Network-level failure (daemon stopped, connection dropped). Without
        // this the rejection is unhandled and `settings` stays null with no
        // error ever surfaced.
        console.error('Failed to load /api/settings', err)
        if (!mountedRef.current) return
        setError('UNKNOWN_ERROR')
    }
  }, [])

  useEffect(() => {
    void reloadSettings()
  }, [reloadSettings])

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

  return { settings, updateSettings, reloadSettings, error }
}
