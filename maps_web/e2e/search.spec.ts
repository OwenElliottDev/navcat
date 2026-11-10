import type { Locator, Page } from '@playwright/test'
import { CAFE_ID } from './fixtures/places'
import { directionsToMarket, openApp, openPlace } from './helpers'
import { expect, test } from './mockStack'

test.beforeEach(async ({ page }) => {
  // A Monday morning, so opening hours read the same every run
  await page.clock.setFixedTime(new Date('2026-10-12T10:00:00+11:00'))
})

test('search shows suggestions with their kind and address', async ({ page, stack }) => {
  await openApp(page)
  await page.getByRole('combobox', { name: 'Search places' }).fill('station')

  const option = page.getByRole('option', { name: /Flinders Street Station/ })
  await expect(option).toContainText('Station, Flinders Street, Melbourne, Victoria, 3000')
  expect(stack.requestsTo('/api/search').at(-1)?.params.get('q')).toBe('station')
})

test('a picked place opens its card with full details', async ({ page }) => {
  await openApp(page)
  await openPlace(page, 'laneway', 'Laneway Espresso')

  const card = page.locator('.place-card')
  await expect(card.getByText('Cafe', { exact: true })).toBeVisible()
  // From /api/places: hours, phone and website aren't in the search result
  await expect(card.getByText('Open · until 4 pm')).toBeVisible()
  await expect(card.getByRole('link', { name: '+61 3 9000 0000' })).toHaveAttribute(
    'href',
    'tel:+61390000000',
  )
  await expect(card.getByRole('link', { name: 'laneway.example' })).toBeVisible()
  await expect(card.getByText('66 Bourke Street, Melbourne, Victoria, 3000')).toBeVisible()

  // People's reviews, from /api/places/.../community
  await expect(card.locator('.place-rating')).toContainText('4.5')
  await expect(card.locator('.place-rating')).toContainText('(2 reviews)')
  const reviews = card.getByRole('region', { name: 'Reviews' })
  await expect(reviews.getByText('Best flat white in the lane.')).toBeVisible()
  await expect(reviews.getByText('20 Sept 2026')).toBeVisible()
})

/** Types into a place box and takes the top suggestion with Enter. */
async function enterSuggestion(page: Page, box: string, text: string, option: RegExp) {
  const input = page.getByRole('combobox', { name: box })
  await input.fill(text)
  await expect(page.getByRole('option', { name: option })).toBeVisible()
  await input.press('Enter')
}

const caretHidden = (input: Locator) =>
  input.evaluate((el) => getComputedStyle(el).caretColor === 'rgba(0, 0, 0, 0)')

test('picking a place on a touch screen puts the keyboard away', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch screens only')
  await openApp(page)
  const input = page.getByRole('combobox', { name: 'Search places' })

  await openPlace(page, 'laneway', 'Laneway Espresso')
  await expect(input).not.toBeFocused()

  await enterSuggestion(page, 'Search places', 'station', /Flinders Street Station/)
  await expect(
    page.getByRole('heading', { level: 2, name: 'Flinders Street Station' }),
  ).toBeVisible()
  await expect(input).not.toBeFocused()
})

test('picking a place with a keyboard keeps focus without the caret', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'keyboard and mouse only')
  await openApp(page)
  const input = page.getByRole('combobox', { name: 'Search places' })

  await enterSuggestion(page, 'Search places', 'station', /Flinders Street Station/)
  await expect(
    page.getByRole('heading', { level: 2, name: 'Flinders Street Station' }),
  ).toBeVisible()
  await expect(input).toBeFocused()
  expect(await caretHidden(input)).toBe(true)

  // Using the box again brings the caret back
  await input.press('ArrowLeft')
  expect(await caretHidden(input)).toBe(false)
})

test('Tab goes from a picked start to the destination', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard and mouse only')
  await openApp(page)
  await directionsToMarket(page)

  await enterSuggestion(page, 'Start', 'Flinders', /Flinders Street Station/)
  await expect(page.getByRole('combobox', { name: 'Start' })).toHaveValue('Flinders Street Station')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('combobox', { name: 'Destination' })).toBeFocused()
})

test('the week of opening hours expands', async ({ page }) => {
  await openApp(page)
  await openPlace(page, 'laneway', 'Laneway Espresso')

  await page.getByText('Open · until 4 pm').click()
  const week = page.locator('.hours__week')
  await expect(week.getByRole('row', { name: /Saturday/ })).toContainText('8 am – 3 pm')
  await expect(week.locator('.hours__today')).toContainText('Monday')
})

test("a place the backend doesn't have shows without an edit link", async ({ page }) => {
  await openApp(page)
  await openPlace(page, 'Flinders', 'Flinders Street Station')
  await expect(page.getByText('Station', { exact: true })).toBeVisible()
  // No /api/places details for it: no edit link, but reviews still load
  await expect(page.getByRole('button', { name: /Edit/ })).toHaveCount(0)
  await expect(page.getByText('No reviews yet.')).toBeVisible()
})

test('nothing found says so', async ({ page }) => {
  await openApp(page)
  await page.getByRole('combobox', { name: 'Search places' }).fill('zzzz')
  await expect(page.getByText('No matches. Try a street, suburb or business name.')).toBeVisible()
})

test('search being down says which container to check', async ({ page }) => {
  await openApp(page)
  await page.route('**/api/search?*', (route) => route.fulfill({ status: 502 }))
  await page.getByRole('combobox', { name: 'Search places' }).fill('laneway')
  await expect(
    page.getByText("Search isn't responding. Check that the Photon container is running."),
  ).toBeVisible()
})

test('clearing the search closes the place', async ({ page }) => {
  await openApp(page)
  await openPlace(page, 'laneway', 'Laneway Espresso')
  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(page.locator('.place-card')).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Search places' })).toHaveValue('')
})

test('signed-out searches are remembered in this browser', async ({ page }) => {
  await openApp(page)
  await openPlace(page, 'laneway', 'Laneway Espresso')
  await page.getByRole('button', { name: 'Clear' }).click()

  await page.reload()
  await page.getByRole('combobox', { name: 'Search places' }).focus()
  await expect(page.getByRole('option', { name: /Laneway Espresso/ })).toBeVisible()
  const stored = await page.evaluate(() => localStorage.getItem('maps.recents'))
  expect(JSON.parse(stored!)[0].place).toMatchObject({ osmType: 'N', osmId: CAFE_ID })
})
