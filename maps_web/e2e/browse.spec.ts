import { browseCategory, openApp } from './helpers'
import { expect, test } from './mockStack'

test('a category chip lists places in view, nearest first', async ({ page, stack }) => {
  await openApp(page)
  await browseCategory(page, 'Cafes')

  await expect(page.getByRole('heading', { name: 'Cafes' })).toBeVisible()
  const items = page.locator('.browse-item')
  await expect(items).toHaveCount(3)
  await expect(items.nth(0)).toContainText('Laneway Espresso')
  await expect(items.nth(0)).toContainText('120 m')
  await expect(items.nth(0)).toContainText('Cafe · Bourke Street')
  // An unnamed cafe is called by its category
  await expect(items.nth(2)).toContainText('Cafe')
  await expect(page.getByRole('combobox', { name: 'Search places' })).toHaveValue('Cafes')

  // The visible part of the map, as west,south,east,north and a lng,lat to sort by
  const params = stack.requestsTo('/api/browse').at(-1)!.params
  expect(params.get('category')).toBe('cafe')
  expect(params.get('bbox')).toMatch(/^-?\d+\.\d{5}(,-?\d+\.\d{5}){3}$/)
  expect(params.get('near')).toMatch(/^-?\d+\.\d{5},-?\d+\.\d{5}$/)
})

test('a result opens its card, and Results goes back to the list', async ({ page }) => {
  await openApp(page)
  await browseCategory(page, 'Cafes')
  await page.getByRole('button', { name: /Little Bourke Coffee/ }).click()

  await expect(page.getByRole('heading', { level: 2, name: 'Little Bourke Coffee' })).toBeVisible()
  await page.getByRole('button', { name: 'Results' }).click()
  await expect(page.locator('.browse-item')).toHaveCount(3)
})

test('an empty category says to zoom out', async ({ page }) => {
  await openApp(page)
  await browseCategory(page, 'Pharmacies')
  await expect(page.getByText('No pharmacies in this area. Try zooming out.')).toBeVisible()
})

test('typing a category word suggests the category', async ({ page, stack }) => {
  await openApp(page)
  await page.getByRole('combobox', { name: 'Search places' }).fill('coffee')
  await expect(async () => {
    await page.getByRole('option', { name: /Cafes.*Search this area/ }).click()
    await expect(page.locator('.browse-item').first()).toBeVisible({ timeout: 1000 })
  }).toPass()
  expect(stack.requestsTo('/api/browse').at(-1)!.params.get('category')).toBe('cafe')
})

test('closing the results clears the search', async ({ page }) => {
  await openApp(page)
  await browseCategory(page, 'Cafes')
  await page.getByRole('button', { name: 'Close results' }).click()
  await expect(page.getByRole('heading', { name: 'Cafes' })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Search places' })).toHaveValue('')
})

test('the backend being down says which container to check', async ({ page }) => {
  await openApp(page)
  await page.route('**/api/browse?*', (route) => route.fulfill({ status: 502 }))
  await browseCategory(page, 'Cafes')
  await expect(
    page.getByText("Browse isn't responding. Check that the backend container is running."),
  ).toBeVisible()
})
