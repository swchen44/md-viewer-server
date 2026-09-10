import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

export { expect, test }

export const TOKEN = '1234'
export const AUTH_HEADERS = { 'X-Auth-Token': TOKEN }

const seedFiles = {
  'README.md': `# E2E Fixture Heading\n\nThis is a deterministic Markdown fixture.\n\n## Setup\n\ninstall dependencies\n`,
  'notes.md': `# Notes\n\nDeterministic fixture notes.\n`,
  'sandbox.html': `<!doctype html>\n<html lang="en">\n  <body>\n    <h1>Sandbox fixture</h1>\n    <script>document.body.dataset.fixture = 'sandbox'</script>\n  </body>\n</html>\n`,
}

const baselineSettings = {
  plantumlServerUrl: 'https://www.plantuml.com/plantuml',
  privacyMode: false,
  blockRemoteContent: false,
  sendToPlantUmlServer: false,
  allowHtmlScripts: false,
  bakOnSave: false,
  customCssChoice: 'user1',
  customCssUser1: '',
  customCssUser2: '',
  checkForUpdates: false,
}

export function api(request, endpoint, options = {}) {
  return request.fetch(endpoint, {
    ...options,
    headers: {
      ...AUTH_HEADERS,
      ...options.headers,
    },
  })
}

export async function getRootPath(request) {
  const response = await request.get('/api/health')
  if (!response.ok()) {
    throw new Error(`Could not get E2E root path: ${response.status()}`)
  }
  const { roots } = await response.json()
  if (!Array.isArray(roots) || typeof roots[0] !== 'string') {
    throw new Error('E2E health response did not include a root path.')
  }
  return roots[0]
}

export async function resetFixture(request, rootPath) {
  for (const [relPath, content] of Object.entries(seedFiles)) {
    fs.writeFileSync(path.join(rootPath, relPath), content)
  }

  const settingsResponse = await api(request, '/api/settings', {
    method: 'PUT',
    data: baselineSettings,
  })
  if (!settingsResponse.ok()) {
    throw new Error(`Could not reset E2E settings: ${settingsResponse.status()}`)
  }

  for (const relPath of Object.keys(seedFiles)) {
    const tabResponse = await api(request, '/api/tabs', {
      method: 'DELETE',
      data: { root: 0, path: relPath },
    })
    if (!tabResponse.ok()) {
      throw new Error(`Could not close E2E tab ${relPath}: ${tabResponse.status()}`)
    }
  }
}

export async function openApp(page) {
  await page.goto(`/?token=${TOKEN}`)
  await expect(page.getByTestId('app-shell')).toBeVisible()
}

export async function openFile(page, relPath) {
  const fileResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      url.pathname === '/api/file' &&
      url.searchParams.get('path') === relPath &&
      response.ok()
    )
  })

  await page.getByTestId('file-tree-panel').getByText(relPath, { exact: true }).click()
  await fileResponse
}
