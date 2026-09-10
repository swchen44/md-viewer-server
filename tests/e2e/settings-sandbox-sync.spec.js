import { api, expect, getRootPath, openApp, openFile, resetFixture, test } from './fixtures.js'

let rootPath

test.beforeEach(async ({ request }) => {
  rootPath = await getRootPath(request)
  await resetFixture(request, rootPath)
})

async function openAppWithWebSocket(page) {
  const webSocket = page.waitForEvent('websocket', (socket) => new URL(socket.url()).pathname === '/ws')
  await openApp(page)
  return webSocket
}

test('propagates privacy mode to a second browser page', async ({ page }) => {
  const secondPage = await page.context().newPage()

  try {
    await Promise.all([openAppWithWebSocket(page), openAppWithWebSocket(secondPage)])

    await page.getByRole('button', { name: 'Settings' }).click()
    await secondPage.getByRole('button', { name: 'Settings' }).click()

    const firstSettings = page.getByRole('dialog', { name: 'Settings' })
    const secondSettings = secondPage.getByRole('dialog', { name: 'Settings' })
    const settingsUpdate = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return response.request().method() === 'PUT' && url.pathname === '/api/settings' && response.ok()
    })
    await firstSettings.getByLabel('Privacy mode', { exact: true }).click()
    await settingsUpdate

    await expect(secondSettings.getByLabel('Privacy mode', { exact: true })).toBeChecked()
    await expect(
      secondSettings.getByLabel('Block remote images/videos/iframes in documents')
    ).toBeDisabled()
    await expect(secondSettings.getByLabel('Send diagram source to PlantUML server')).toBeDisabled()
    await expect(secondSettings.getByLabel('Allow HTML files to execute scripts')).toBeDisabled()
  } finally {
    await secondPage.close()
  }
})

test('renders HTML in a sandbox without same-origin access', async ({ page, request }) => {
  const settingsResponse = await api(request, '/api/settings', {
    method: 'PUT',
    data: { allowHtmlScripts: true },
  })
  expect(settingsResponse.ok()).toBe(true)

  await openApp(page)
  await openFile(page, 'sandbox.html')

  const iframe = page.locator('iframe[title="html-preview"]')
  await expect(iframe).toHaveAttribute('sandbox', /allow-scripts/)
  await expect(iframe).not.toHaveAttribute('sandbox', /allow-same-origin/)
})

test('synchronizes a tab opened and closed from another page', async ({ page }) => {
  const secondPage = await page.context().newPage()

  try {
    const [, secondWebSocket] = await Promise.all([
      openAppWithWebSocket(page),
      openAppWithWebSocket(secondPage),
    ])
    await Promise.all([
      expect(page.getByTestId('file-tree-panel').getByText('notes.md', { exact: true })).toBeVisible(),
      expect(secondPage.getByTestId('file-tree-panel').getByText('notes.md', { exact: true })).toBeVisible(),
    ])

    const tabOpened = secondWebSocket.waitForEvent('framereceived', (frame) => {
      const event = JSON.parse(frame.payload)
      return event.type === 'tab-opened' && event.rootId === 0 && event.relPath === 'notes.md'
    })

    await openFile(page, 'notes.md')
    await tabOpened

    const secondCloseButton = secondPage.getByRole('button', { name: 'close notes.md' })
    await expect(secondCloseButton).toBeVisible()

    const tabClosed = secondWebSocket.waitForEvent('framereceived', (frame) => {
      const event = JSON.parse(frame.payload)
      return event.type === 'tab-closed' && event.rootId === 0 && event.relPath === 'notes.md'
    })
    await page.getByRole('button', { name: 'close notes.md' }).click()
    await tabClosed
    await expect(secondCloseButton).toHaveCount(0)
  } finally {
    await secondPage.close()
  }
})
