import type { Page } from '@playwright/test'
import {
  directionsToMarket,
  expectNear,
  lastLookup,
  menuAt,
  openApp,
  pickSuggestion,
  planRoute,
} from './helpers'
import { expect, test, type MockStack } from './mockStack'

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

test('directions show no empty panel until both ends are set', async ({ page }) => {
  await openApp(page)
  await directionsToMarket(page)
  await expect(page.locator('.sheet, .panel__body')).toHaveCount(0)

  await pickSuggestion(page, 'Start', 'Flinders', 'Flinders Street Station')
  await expect(page.locator('.route-summary')).toBeVisible()
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

/* ---------- "What's here?" and the map menu's directions ---------- */

/** A spot on the map, as fractions of its size: clear of the panel on wide screens and phones */
async function spot(page: Page, fx: number, fy: number) {
  const box = (await page.locator('.maplibregl-canvas').boundingBox())!
  return { x: box.width * fx, y: box.height * fy }
}

async function chooseFromMenu(page: Page, at: { x: number; y: number }, item: string) {
  await menuAt(page, at)
  await page.getByRole('menuitem', { name: item }).click()
}

/** Runs "What's here?" at a spot, and returns where it looked up. */
async function whatsHere(page: Page, stack: MockStack, at: { x: number; y: number }) {
  await chooseFromMenu(page, at, "What's here?")
  await expect(page.locator('.map-dot--query')).toHaveCount(1)
  return lastLookup(stack)
}

/** The points of the last route asked for, once it's been asked for */
async function routePoints(stack: MockStack) {
  await expect.poll(() => stack.requestsTo('/api/route').length).toBeGreaterThan(0)
  return (stack.requestsTo('/api/route').at(-1)!.body as { points: number[][] }).points
}

test('"Directions from here" elsewhere heads to the "What\'s here?" spot', async ({
  page,
  stack,
}) => {
  await openApp(page)
  const here = await whatsHere(page, stack, await spot(page, 0.75, 0.3))
  await chooseFromMenu(page, await spot(page, 0.9, 0.4), 'Directions from here')

  await expect(page.getByRole('combobox', { name: 'Destination' })).toHaveValue(
    'Flinders Street Station',
  )
  const [from, to] = await routePoints(stack)
  expectNear(to, here)
  expectNear(from, lastLookup(stack))
  // The dot became the destination's pin
  await expect(page.locator('.map-dot--query')).toHaveCount(0)
  await expect(page.locator('.maplibregl-marker:not(.map-dot)')).toHaveCount(2)
})

test('"Directions to here" elsewhere starts from the "What\'s here?" spot', async ({
  page,
  stack,
}) => {
  await openApp(page)
  const here = await whatsHere(page, stack, await spot(page, 0.75, 0.3))
  await chooseFromMenu(page, await spot(page, 0.9, 0.4), 'Directions to here')

  await expect(page.getByRole('combobox', { name: 'Start' })).toHaveValue('Flinders Street Station')
  const [from] = await routePoints(stack)
  expectNear(from, here)
  await expect(page.locator('.map-dot--query')).toHaveCount(0)
  await expect(page.locator('.maplibregl-marker:not(.map-dot)')).toHaveCount(2)
})

test('"What\'s here?" leaves a destination that\'s already set', async ({ page, stack }) => {
  await openApp(page)
  await planRoute(page)
  await whatsHere(page, stack, await spot(page, 0.75, 0.3))
  await chooseFromMenu(page, await spot(page, 0.9, 0.4), 'Directions from here')

  await expect(page.getByRole('combobox', { name: 'Destination' })).toHaveValue(
    'Queen Victoria Market',
  )
  const [, to] = await routePoints(stack)
  expect(to).toEqual([144.95679, -37.80762])
})

/**
 * Waits for the map to stop moving to the "What's here?" place (the dot still for a few frames),
 * and returns the dot's centre from the map's top left.
 */
function dotSettled(page: Page) {
  return page.evaluate(async () => {
    const centre = () => {
      const dot = document.querySelector('.map-dot--query')!.getBoundingClientRect()
      const map = document.querySelector('.maplibregl-canvas')!.getBoundingClientRect()
      return { x: dot.x + dot.width / 2 - map.x, y: dot.y + dot.height / 2 - map.y }
    }
    let at = centre()
    for (let still = 0; still < 5;) {
      await new Promise(requestAnimationFrame)
      const now = centre()
      still = now.x === at.x && now.y === at.y ? still + 1 : 0
      at = now
    }
    return at
  })
}

/** Picks "Directions from here" from the open menu, and checks it started at the dot's place */
async function directionsFromDot(page: Page, stack: MockStack, lookups: number) {
  await page.getByRole('menuitem', { name: 'Directions from here' }).click()
  await expect(page.getByRole('combobox', { name: 'Start' })).toHaveValue('Flinders Street Station')
  await expect(page.getByRole('combobox', { name: 'Destination' })).toHaveValue('')
  await expect(page.locator('.map-dot--query')).toHaveCount(0)
  expect(stack.requestsTo('/api/route')).toHaveLength(0)
  // The place already looked up, not the clicked point looked up again
  expect(stack.requestsTo('/api/reverse')).toHaveLength(lookups)
}

test('directions from the "What\'s here?" dot itself start there', async ({ page, stack }) => {
  await openApp(page)
  const here = await whatsHere(page, stack, await spot(page, 0.75, 0.3))
  const lookups = stack.requestsTo('/api/reverse').length
  // The map moves to the place, so find where the dot ended up
  const at = await dotSettled(page)
  // A finger's width off the centre still counts
  await page
    .locator('.maplibregl-canvas')
    .click({ button: 'right', position: { x: at.x + 15, y: at.y + 10 } })
  await directionsFromDot(page, stack, lookups)

  await pickSuggestion(page, 'Destination', 'Brunswick')
  const [from] = await routePoints(stack)
  expectNear(from, here)
})

test('a menu opened on the "What\'s here?" dot mid-flight still counts', async ({
  page,
  stack,
}) => {
  await openApp(page)
  await whatsHere(page, stack, await spot(page, 0.75, 0.3))
  const lookups = stack.requestsTo('/api/reverse').length
  // Opened on the dot mid-flight: read and clicked in one frame, once the map has drawn it, so
  // the dot can't move in between
  const opened = await page.evaluate(async () => {
    await new Promise(requestAnimationFrame)
    const dot = document.querySelector('.map-dot--query')!.getBoundingClientRect()
    const [clientX, clientY] = [dot.x + dot.width / 2, dot.y + dot.height / 2]
    const canvas = document.querySelector('.maplibregl-canvas')!
    // MapLibre opens its menu on a whole right click, not a bare contextmenu event
    const click = { bubbles: true, cancelable: true, clientX, clientY, button: 2, buttons: 2 }
    canvas.dispatchEvent(new MouseEvent('mousedown', click))
    canvas.dispatchEvent(new MouseEvent('contextmenu', click))
    canvas.dispatchEvent(new MouseEvent('mouseup', { ...click, buttons: 0 }))
    const map = canvas.getBoundingClientRect()
    return { x: clientX - map.x, y: clientY - map.y }
  })
  await expect(page.getByRole('menu')).toBeVisible()
  // It went on moving after the menu opened
  const at = await dotSettled(page)
  expect(Math.hypot(opened.x - at.x, opened.y - at.y)).toBeGreaterThan(24)
  await directionsFromDot(page, stack, lookups)
})

test('the "What\'s here?" card\'s Directions head there', async ({ page, stack }) => {
  await openApp(page)
  const here = await whatsHere(page, stack, await spot(page, 0.75, 0.3))
  await page.getByRole('button', { name: 'Directions', exact: true }).last().click()

  await expect(page.getByRole('combobox', { name: 'Destination' })).toHaveValue(
    'Flinders Street Station',
  )
  await expect(page.locator('.map-dot--query')).toHaveCount(0)
  await pickSuggestion(page, 'Start', 'Brunswick')
  const [, to] = await routePoints(stack)
  expectNear(to, here)
})
