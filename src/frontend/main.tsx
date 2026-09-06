import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { initAuthFromUrl } from './auth.js'
import './i18n/index.js'
import './styles/global.css'

// Must run before the first render: App's effects call apiFetch() on mount,
// and apiFetch() reads the token out of sessionStorage. Without this, opening
// the CLI's printed first-connection link (?token=xxxx) never moves the token
// out of the URL, so every API call goes out with an empty X-Auth-Token header.
initAuthFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
