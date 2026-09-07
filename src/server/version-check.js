const REGISTRY_URL = 'https://registry.npmjs.org/md-viewer-server/latest'
const TIMEOUT_MS = 3000

function isNewerVersion(latest, current) {
  const toParts = (v) => v.split('.').map(Number)
  const [lMaj, lMin, lPatch] = toParts(latest)
  const [cMaj, cMin, cPatch] = toParts(current)
  if (lMaj !== cMaj) return lMaj > cMaj
  if (lMin !== cMin) return lMin > cMin
  return lPatch > cPatch
}

// Never throws: every failure mode (unreachable registry, timeout, non-200,
// malformed body) collapses to null so the caller (the /api/version-check
// route) can always respond 200 rather than surfacing a transient registry
// hiccup as a server error for a purely informational, opt-in feature.
export async function checkLatestVersion({
  currentVersion,
  fetchImpl = fetch,
  registryUrl = REGISTRY_URL,
  timeoutMs = TIMEOUT_MS,
}) {
  try {
    const res = await fetchImpl(registryUrl, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    const body = await res.json()
    if (typeof body.version !== 'string') return null
    return {
      latestVersion: body.version,
      updateAvailable: isNewerVersion(body.version, currentVersion),
    }
  } catch {
    return null
  }
}
