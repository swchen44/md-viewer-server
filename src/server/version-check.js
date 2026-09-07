const REGISTRY_URL = 'https://registry.npmjs.org/md-viewer-server/latest'
const TIMEOUT_MS = 3000

// Minimal SemVer parser: major.minor.patch with an optional -prerelease
// suffix (build metadata after "+" is ignored, matching SemVer's own rule
// that it has no bearing on precedence). Returns null for anything that
// doesn't match, so callers can treat an invalid version as a failed check
// rather than silently miscomparing it.
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

function parseSemver(v) {
  const match = typeof v === 'string' ? SEMVER_RE.exec(v) : null
  if (!match) return null
  const [, major, minor, patch, prerelease] = match
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: prerelease ?? null,
  }
}

// Per SemVer precedence rules: compare major.minor.patch numerically first;
// if those are equal, a version WITHOUT a prerelease tag outranks one WITH a
// prerelease tag (1.2.3 > 1.2.3-beta.1); if both have prerelease tags, fall
// back to a plain string comparison of the prerelease (good enough for the
// common "-beta.N" style without needing full dot-separated-identifier
// SemVer comparison).
function isNewerVersion(latest, current) {
  const l = parseSemver(latest)
  const c = parseSemver(current)
  if (l.major !== c.major) return l.major > c.major
  if (l.minor !== c.minor) return l.minor > c.minor
  if (l.patch !== c.patch) return l.patch > c.patch
  if (l.prerelease === c.prerelease) return false
  if (l.prerelease === null) return true
  if (c.prerelease === null) return false
  return l.prerelease > c.prerelease
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
    // Guard against a malformed registry version string (or a malformed
    // currentVersion) producing a silently wrong comparison instead of a
    // clean failed-check null, per this function's own contract above.
    if (!parseSemver(body.version) || !parseSemver(currentVersion)) return null
    return {
      latestVersion: body.version,
      updateAvailable: isNewerVersion(body.version, currentVersion),
    }
  } catch {
    return null
  }
}
