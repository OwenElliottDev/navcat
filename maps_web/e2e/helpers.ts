import type { Page } from '@playwright/test'
import { expect } from './mockStack'

/** Opens the app and waits for the categories under the search bar (the backend answered). */
export async function openApp(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.getByRole('group', { name: 'Browse nearby' })).toBeVisible()
}

/** Types into a place box and picks the suggestion with this name. */
export async function pickSuggestion(page: Page, box: string, text: string, option = text) {
  const input = page.getByRole('combobox', { name: box })
  await input.fill(text)
  await page.getByRole('option', { name: option }).first().click()
}

/** Searches for a place and opens its card. */
export async function openPlace(page: Page, text: string, name: string) {
  await pickSuggestion(page, 'Search places', text, name)
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
}

/**
 * Plans a route from Flinders Street Station to Queen Victoria Market, from the place card.
 * Routes start on foot, the first travel mode.
 */
export async function planRoute(page: Page) {
  await openPlace(page, 'Queen Vic', 'Queen Victoria Market')
  await page.getByRole('button', { name: 'Directions', exact: true }).last().click()
  await expect(page.getByRole('combobox', { name: 'Destination' })).toHaveValue(
    'Queen Victoria Market',
  )
  await pickSuggestion(page, 'Start', 'Flinders', 'Flinders Street Station')
}

/**
 * Clicks a category chip once the map has loaded (browsing needs the map's visible area,
 * and does nothing until then).
 */
export async function browseCategory(page: Page, label: string) {
  const chip = page
    .getByRole('group', { name: 'Browse nearby' })
    .getByRole('button', { name: label })
  await expect(async () => {
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true', { timeout: 500 })
  }).toPass()
}
