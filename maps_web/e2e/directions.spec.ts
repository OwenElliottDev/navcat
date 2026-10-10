import { openApp, planRoute } from './helpers'
import { expect, test } from './mockStack'

test('a walk shows time, distance, climb, elevation and steps', async ({ page, stack }) => {
  await openApp(page)
  await planRoute(page)

  await expect(page.locator('.route-summary')).toContainText('19 min')
  await expect(page.locator('.route-summary')).toContainText('1.6 km')
  await expect(page.locator('.route-summary')).toContainText('↑ 16 m ↓ 2 m')
  await expect(page.getByRole('figure', { name: 'Elevation along the route' })).toBeVisible()
  const steps = page.locator('.steps li')
  await expect(steps).toHaveCount(4)
  await expect(steps.nth(1)).toContainText('Turn right onto Elizabeth Street')
  await expect(steps.nth(1)).toContainText('1.2 km')

  const sent = stack.requestsTo('/api/route').at(-1)!.body as Record<string, unknown>
  expect(sent).toMatchObject({
    profile: 'foot',
    points: [
      [144.96706, -37.81827],
      [144.95679, -37.80762],
    ],
    points_encoded: false,
    instructions: true,
    elevation: true,
    details: ['osm_way_id'],
  })
  expect(sent).not.toHaveProperty('custom_model')
})

test('a walk downloads as GPX', async ({ page }) => {
  await openApp(page)
  await planRoute(page)

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export GPX' }).click()
  expect((await download).suggestedFilename()).toBe(
    'walk-flinders-street-station-to-queen-victoria-market.gpx',
  )
})

test('swapping the ends asks for the route the other way', async ({ page, stack }) => {
  await openApp(page)
  await planRoute(page)
  await expect(page.locator('.route-summary')).toBeVisible()

  await page.getByRole('button', { name: 'Swap start and destination' }).click()
  await expect(page.getByRole('combobox', { name: 'Start' })).toHaveValue('Queen Victoria Market')
  await expect
    .poll(() => (stack.requestsTo('/api/route').at(-1)!.body as { points: number[][] }).points[0])
    .toEqual([144.95679, -37.80762])
})

test('driving offers what the routing graph can avoid, and sends it', async ({ page, stack }) => {
  await openApp(page)
  await planRoute(page)
  const modes = page.getByRole('group', { name: 'Travel mode' })
  await modes.getByRole('button', { name: 'Drive' }).click()

  const avoid = page.getByRole('group', { name: 'Avoid' })
  await expect(avoid.getByRole('button')).toHaveText([
    'Motorways',
    'Tolls',
    'Ferries',
    'Traffic lights',
    'Small roads',
  ])
  // No GPX or elevation for drives
  await expect(page.locator('.route-summary')).toContainText('3 min')
  await expect(page.getByRole('button', { name: 'Export GPX' })).toHaveCount(0)
  await expect(page.getByRole('figure', { name: 'Elevation along the route' })).toHaveCount(0)

  await avoid.getByRole('button', { name: 'Tolls' }).click()
  await expect(avoid.getByRole('button', { name: 'Tolls' })).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(() => stack.requestsTo('/api/route').at(-1)!.body)
    .toMatchObject({
      profile: 'car',
      'ch.disable': true,
      custom_model: { priority: [{ if: 'toll == ALL', multiply_by: '0.1' }] },
    })
})

test('avoid options needing values the graph lacks are hidden', async ({ page, stack }) => {
  stack.encodedValues = ['road_class', 'road_environment']
  await openApp(page)
  await planRoute(page)
  await page
    .getByRole('group', { name: 'Travel mode' })
    .getByRole('button', { name: 'Drive' })
    .click()

  await expect(page.getByRole('group', { name: 'Avoid' }).getByRole('button')).toHaveText([
    'Motorways',
    'Ferries',
    'Small roads',
  ])
})

test('walks and rides can avoid steep hills, under additional options', async ({ page, stack }) => {
  await openApp(page)
  await planRoute(page)

  // Folded away until wanted
  const steep = page.getByRole('switch', { name: 'Avoid steep hills' })
  await expect(steep).toBeHidden()
  await page.getByText('Additional options').click()
  await expect(steep).toHaveAttribute('aria-checked', 'false')

  await steep.click()
  await expect
    .poll(() => stack.requestsTo('/api/route').at(-1)!.body)
    .toMatchObject({
      profile: 'foot',
      custom_model: {
        priority: [
          { if: 'max_slope >= 12 || max_slope <= -12', multiply_by: '0.05' },
          { else_if: 'max_slope >= 8 || max_slope <= -8', multiply_by: '0.2' },
          { else_if: 'max_slope >= 5 || max_slope <= -5', multiply_by: '0.6' },
        ],
      },
    })

  // Kept when switching to cycling; switching it off goes back to the usual route
  await page
    .getByRole('group', { name: 'Travel mode' })
    .getByRole('button', { name: 'Cycle' })
    .click()
  await expect(steep).toHaveAttribute('aria-checked', 'true')
  await steep.click()
  await expect
    .poll(() => stack.requestsTo('/api/route').at(-1)!.body)
    .not.toHaveProperty('custom_model')

  // Drives have their own things to avoid
  await page
    .getByRole('group', { name: 'Travel mode' })
    .getByRole('button', { name: 'Drive' })
    .click()
  await expect(page.getByText('Additional options')).toHaveCount(0)
})

test('additional options are hidden when the graph has no slopes', async ({ page, stack }) => {
  stack.encodedValues = ['road_class']
  await openApp(page)
  await planRoute(page)
  await expect(page.locator('.route-summary')).toBeVisible()
  await expect(page.getByText('Additional options')).toHaveCount(0)
})

test('cycling styles are the ones GraphHopper has', async ({ page, stack }) => {
  stack.profiles = ['foot', 'bike', 'gravel', 'car']
  await openApp(page)
  await planRoute(page)
  await page
    .getByRole('group', { name: 'Travel mode' })
    .getByRole('button', { name: 'Cycle' })
    .click()

  const styles = page.getByRole('group', { name: 'Kind of cycling' })
  await expect(styles.getByRole('button')).toHaveText(['Everyday', 'Gravel'])
  await styles.getByRole('button', { name: 'Gravel' }).click()
  await expect
    .poll(() => (stack.requestsTo('/api/route').at(-1)!.body as { profile: string }).profile)
    .toBe('gravel')
})

test('travel modes follow GraphHopper, with transit always offered', async ({ page, stack }) => {
  stack.profiles = ['foot', 'car']
  await openApp(page)
  await planRoute(page)
  await expect(page.getByRole('group', { name: 'Travel mode' }).getByRole('button')).toHaveText([
    'Walk',
    'Transit',
    'Drive',
  ])
})

test('routing being down says which container to check', async ({ page }) => {
  await page.route('**/api/route', (route) => route.fulfill({ status: 503 }))
  await openApp(page)
  await planRoute(page)
  await expect(
    page.getByText("Routing isn't responding. Check that the GraphHopper container is running."),
  ).toBeVisible()
})

test('a point away from roads explains what to do', async ({ page }) => {
  await page.route('**/api/route', (route) =>
    route.fulfill({
      status: 400,
      json: { message: 'Cannot find point 0: -37.81827,144.96706' },
    }),
  )
  await openApp(page)
  await planRoute(page)
  await expect(page.getByText(/isn't near a road this travel mode can use/)).toBeVisible()
})

test('closing directions goes back to search', async ({ page }) => {
  await openApp(page)
  await planRoute(page)
  await page.getByRole('button', { name: 'Close directions' }).click()
  await expect(page.getByRole('combobox', { name: 'Search places' })).toBeVisible()
  await expect(page.locator('.route-summary')).toHaveCount(0)
})

test('simulated navigation follows the route with lane guidance', async ({ page, stack }) => {
  await openApp(page, '/?simulate')
  await planRoute(page)
  await page
    .getByRole('group', { name: 'Travel mode' })
    .getByRole('button', { name: 'Drive' })
    .click()
  await expect(page.locator('.route-summary')).toContainText('3 min')
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  const banner = page.getByRole('status')
  await expect(banner).toContainText('Turn right onto Elizabeth Street')
  await expect(page.locator('.nav-trip')).toContainText('simulated')
  // Lanes for the road into the right turn, from /api/lanes
  expect(stack.requestsTo('/api/lanes')[0].body).toEqual({
    approaches: [
      { wayId: 111, start: [144.9653, -37.81776], end: [144.9644, -37.8175] },
      { wayId: 222, start: [144.9599, -37.8088], end: [144.9585, -37.8072] },
    ],
  })
  await expect(page.locator('.lane-guide')).toBeVisible()

  await page.getByRole('button', { name: 'End' }).click()
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.locator('.route-summary')).toBeVisible()
})
