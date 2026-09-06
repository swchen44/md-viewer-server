const TOKEN_KEY = 'mvs-token'

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function initAuthFromUrl(): string | null {
  const existing = getStoredToken()
  const url = new URL(window.location.href)
  const urlToken = url.searchParams.get('token')

  if (urlToken) {
    url.searchParams.delete('token')
    const newSearch = url.searchParams.toString()
    window.history.replaceState(
      null,
      '',
      url.pathname + (newSearch ? `?${newSearch}` : '') + url.hash
    )
  }

  // A URL token is only ever printed deliberately by the CLI (initial start,
  // or `--rotate-token` handing out a fresh one), so it takes priority over
  // whatever may already be cached in sessionStorage from an earlier,
  // possibly now-invalid, token.
  if (urlToken) {
    sessionStorage.setItem(TOKEN_KEY, urlToken)
    return urlToken
  }

  if (existing) return existing

  return null
}
