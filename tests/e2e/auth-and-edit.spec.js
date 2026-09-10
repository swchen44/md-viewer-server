import fs from 'node:fs'
import path from 'node:path'
import { api, expect, getRootPath, openApp, openFile, resetFixture, test } from './fixtures.js'

let rootPath

test.beforeEach(async ({ request }) => {
  rootPath = await getRootPath(request)
  await resetFixture(request, rootPath)
})

test('loads the shell with the CLI token and removes it from the address bar', async ({ page, request }) => {
  await openApp(page)

  expect(new URL(page.url()).searchParams.has('token')).toBe(false)

  const response = await request.get('/api/roots')
  expect(response.status()).toBe(401)
})

test('opens a Markdown file, edits it, and persists Ctrl+S', async ({ page, request }) => {
  const marker = `E2E saved marker ${Date.now()}`

  await openApp(page)
  await openFile(page, 'README.md')
  await expect(page.getByRole('heading', { name: 'E2E Fixture Heading' })).toBeVisible()

  await page.getByTestId('mode-edit').click()
  await page.locator('textarea').fill(`# ${marker}\n`)

  const saveResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return response.request().method() === 'PUT' && url.pathname === '/api/file' && url.searchParams.get('path') === 'README.md'
  })
  await page.locator('textarea').press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+S`)
  await expect((await saveResponse).ok()).toBe(true)

  const response = await api(request, '/api/file?root=0&path=README.md')
  expect(response.ok()).toBe(true)
  await expect(response.json()).resolves.toMatchObject({ content: `# ${marker}\n` })
})

test('shows a conflict dialog when disk content changes during an edit', async ({ page, request }) => {
  const marker = `E2E conflict marker ${Date.now()}`

  await openApp(page)
  await openFile(page, 'README.md')
  await page.getByTestId('mode-edit').click()
  await page.locator('textarea').fill(`# ${marker}\n`)
  fs.writeFileSync(path.join(rootPath, 'README.md'), '# Disk edit\n')

  const conflictResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      response.request().method() === 'PUT' &&
      response.status() === 409 &&
      url.pathname === '/api/file' &&
      url.searchParams.get('path') === 'README.md'
    )
  })
  await page.locator('textarea').press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+S`)
  await conflictResponse

  const dialog = page.getByRole('dialog', { name: 'File conflict' })
  await expect(dialog).toBeVisible()

  const forceSaveResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      response.request().method() === 'PUT' &&
      response.request().postDataJSON().force === true &&
      response.ok() &&
      url.pathname === '/api/file' &&
      url.searchParams.get('path') === 'README.md'
    )
  })
  await dialog.getByRole('button', { name: 'Keep mine and overwrite' }).click()
  await forceSaveResponse

  const response = await api(request, '/api/file?root=0&path=README.md')
  expect(response.ok()).toBe(true)
  await expect(response.json()).resolves.toMatchObject({ content: `# ${marker}\n` })
})
