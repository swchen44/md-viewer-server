import { getStoredToken } from './auth.js'

export function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getStoredToken() ?? ''
  const headers = {
    ...options.headers,
    'X-Auth-Token': token,
  }
  return fetch(path, { ...options, headers })
}
