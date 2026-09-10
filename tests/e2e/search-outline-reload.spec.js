import fs from 'node:fs'
import path from 'node:path'
import { expect, getRootPath, openApp, openFile, resetFixture, test } from './fixtures.js'

let rootPath

test.beforeEach(async ({ request }) => {
  rootPath = await getRootPath(request)
  await resetFixture(request, rootPath)
})

test('finds a body-only marker with file Content search', async ({ page }) => {
  await openApp(page)

  const searchBar = page.getByTestId('search-bar')
  await searchBar.getByRole('button', { name: 'Content' }).click()
  await searchBar.getByPlaceholder('Search...').fill('install dependencies')
  await searchBar.getByPlaceholder('Search...').press('Enter')

  await expect(page.getByTestId('search-results')).toContainText('README.md')
})

test('filters the outline by title, content, and both', async ({ page }) => {
  await openApp(page)
  await openFile(page, 'README.md')

  await page.getByRole('button', { name: 'Outline' }).click()
  const outline = page.getByTestId('outline-panel')
  const searchBar = page.getByTestId('search-bar')
  const query = searchBar.getByPlaceholder('Search...')

  await expect(outline).toContainText('E2E Fixture Heading')
  await expect(outline).toContainText('Setup')

  await searchBar.getByRole('button', { name: 'Title' }).click()
  await query.fill('E2E Fixture Heading')
  await query.press('Enter')
  await expect(outline).toContainText('E2E Fixture Heading')
  await expect(outline).not.toContainText('Setup')

  await query.fill('')
  await query.press('Enter')
  await searchBar.getByRole('button', { name: 'Content' }).click()
  await query.fill('install dependencies')
  await query.press('Enter')
  await expect(outline).toContainText('Setup')
  await expect(outline).not.toContainText('E2E Fixture Heading')

  await query.fill('')
  await query.press('Enter')
  await searchBar.getByRole('button', { name: 'Both' }).click()
  await query.fill('E2E Fixture Heading')
  await query.press('Enter')
  await expect(outline).toContainText('E2E Fixture Heading')
  await expect(outline).not.toContainText('Setup')
})

test('matches an outline content regex against the source line', async ({ page }) => {
  await openApp(page)
  await openFile(page, 'README.md')

  await page.getByRole('button', { name: 'Outline' }).click()
  const outline = page.getByTestId('outline-panel')
  const searchBar = page.getByTestId('search-bar')
  const query = searchBar.getByPlaceholder('Search...')

  await expect(outline).toContainText('Setup')
  await searchBar.getByRole('button', { name: 'Content' }).click()
  await searchBar.getByRole('button', { name: 'regex' }).click()
  await query.fill('^install dependencies')
  await query.press('Enter')

  await expect(outline).toContainText('Setup')
})

test('reloads a clean viewing tab after an on-disk change', async ({ page }) => {
  const webSocket = page.waitForEvent('websocket', (socket) => new URL(socket.url()).pathname === '/ws')

  await openApp(page)
  await webSocket
  await openFile(page, 'README.md')

  await expect(page.getByTestId('mode-view')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('markdown-view')).toContainText('E2E Fixture Heading')

  fs.writeFileSync(path.join(rootPath, 'README.md'), '# E2E reloaded marker\n')

  await expect(page.getByTestId('markdown-view')).toContainText('E2E reloaded marker')
})
