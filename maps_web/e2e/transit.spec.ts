import type { Page } from '@playwright/test'
import { openApp, planRoute } from './helpers'
import { expect, test, type MockStack } from './mockStack'

async function planJourney(page: Page) {
  await openApp(page)
  await planRoute(page)
  await page
    .getByRole('group', { name: 'Travel mode' })
    .getByRole('button', { name: 'Transit' })
    .click()
}

const planRequests = (stack: MockStack) =>
  stack
    .requestsTo('/api/transit')
    .map((r) => r.body as { query: string; variables?: Record<string, unknown> })
    .filter((body) => body.query.includes('planConnection'))

test('journey options list times, duration and the lines they use', async ({ page, stack }) => {
  await planJourney(page)

  const options = page.locator('.itinerary')
  await expect(options).toHaveCount(2)
  await expect(options.nth(0)).toContainText('8:05 am – 8:24 am')
  await expect(options.nth(0)).toContainText('19 min')
  await expect(options.nth(0).locator('.route-badge')).toHaveText('19')
  // A train line with no number goes by its name
  await expect(options.nth(1).locator('.route-badge')).toHaveText('Craigieburn')
  await expect(options.nth(0)).toHaveAttribute('aria-pressed', 'true')

  // Leaving now: no time or mode filter sent
  expect(planRequests(stack).at(-1)!.variables).toEqual({
    from: { latitude: -37.81827, longitude: 144.96706 },
    to: { latitude: -37.80762, longitude: 144.95679 },
  })
})

test('the selected journey is broken into walks and rides', async ({ page }) => {
  await planJourney(page)

  const legs = page.locator('.legs > li')
  await expect(legs).toHaveCount(3)
  await expect(legs.nth(0)).toContainText('Walk 260 m to Flinders St/Elizabeth St #1')
  await expect(legs.nth(1)).toContainText('Tram towards North Coburg')
  await expect(legs.nth(1)).toContainText('8:10 am Flinders St/Elizabeth St #1')
  await expect(legs.nth(1)).toContainText('8:20 am Queen Victoria Market/Elizabeth St #7')

  await page.locator('.itinerary').nth(1).click()
  await expect(page.locator('.itinerary').nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(legs.nth(1)).toContainText('Train towards Craigieburn')
  await expect(legs.nth(2)).toContainText('Walk 600 m to Destination')
})

test('turning a mode off plans with the rest', async ({ page, stack }) => {
  await planJourney(page)
  const modes = page.getByRole('group', { name: 'Use these kinds of transport' })
  await expect(modes.getByRole('button')).toHaveText(['Train', 'Tram', 'Bus'])

  await modes.getByRole('button', { name: 'Tram' }).click()
  await expect(page.locator('.itinerary')).toHaveCount(1)
  expect(planRequests(stack).at(-1)!.variables!.modes).toEqual({
    transit: { transit: [{ mode: 'RAIL' }, { mode: 'BUS' }] },
  })
})

test('the last mode left on cannot be turned off', async ({ page }) => {
  await planJourney(page)
  const modes = page.getByRole('group', { name: 'Use these kinds of transport' })
  await modes.getByRole('button', { name: 'Tram' }).click()
  await modes.getByRole('button', { name: 'Bus' }).click()
  await expect(modes.getByRole('button', { name: 'Train' })).toBeDisabled()
})

test('a departure time is sent as earliestDeparture', async ({ page, stack }) => {
  await planJourney(page)
  await page.getByRole('combobox', { name: 'When' }).selectOption('departAt')
  await page.getByLabel('Departure time').fill('2026-10-12T08:00')

  await expect
    .poll(() => planRequests(stack).at(-1)!.variables!.dateTime)
    .toEqual({ earliestDeparture: '2026-10-11T21:00:00.000Z' })
})

test('no connection explains itself', async ({ page }) => {
  await page.route('**/api/transit', async (route) => {
    const body = route.request().postDataJSON() as { query: string }
    if (!body.query.includes('planConnection')) return route.fallback()
    await route.fulfill({
      json: {
        data: {
          planConnection: { routingErrors: [{ code: 'WALKING_BETTER_THAN_TRANSIT' }], edges: [] },
        },
      },
    })
  })
  await planJourney(page)
  await expect(page.getByText("It's quicker to walk. Choose Walk for directions.")).toBeVisible()
})

test('OTP being down says which container to check', async ({ page }) => {
  await page.route('**/api/transit', (route) => route.fulfill({ status: 502 }))
  await planJourney(page)
  await expect(page.getByText(/Public transport isn't responding/)).toBeVisible()
})
