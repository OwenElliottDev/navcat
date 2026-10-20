import { directionsToMarket, openApp, openPlace, planRoute } from './helpers'
import { expect, test } from './mockStack'

const COORDS = /^-?\d+\.\d{5}, -?\d+\.\d{5}$/

test('on phones the place card is a bottom sheet with four heights', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The sheet is phone-only; wider screens show a side panel')
  await openApp(page)
  await openPlace(page, 'laneway', 'Laneway Espresso')

  const sheet = page.locator('.sheet')
  const handle = page.getByRole('button', { name: 'Expand panel' })
  const sheetTop = async () => (await sheet.boundingBox())!.y
  const bottomOf = async (selector: string) => {
    const box = (await page.locator(`.sheet ${selector}`).boundingBox())!
    return box.y + box.height
  }

  // Opens just tall enough for the buttons
  const viewport = page.viewportSize()!.height
  await expect(page.locator('.sheet .place-actions')).toBeInViewport({ ratio: 1 })
  expect(viewport - (await bottomOf('.place-actions'))).toBeLessThan(40)

  // Then steps up through half height to just under the search bar
  const low = await sheetTop()
  await handle.click()
  await expect.poll(sheetTop).toBeLessThan(low)
  const controls = page.locator('.maplibregl-ctrl-top-right')
  await expect.poll(async () => (await controls.boundingBox())!.y).toBeLessThan(await sheetTop())
  const controlsAtHalf = (await controls.boundingBox())!.y
  await handle.click()
  await expect(page.getByRole('button', { name: 'Shrink panel' })).toBeVisible()
  const top = (await page.locator('.panel__top').boundingBox())!
  // Within a pixel: the sheet's height is rounded
  const underBar = top.y + top.height + top.y
  await expect.poll(async () => Math.abs((await sheetTop()) - underBar)).toBeLessThanOrEqual(1)
  // The map controls stop rising at half height, so the sheet covers them, not the top bar
  expect((await controls.boundingBox())!.y).toBeCloseTo(controlsAtHalf, 0)

  // Dragged right down, only the name and type show
  const grip = (await page.locator('.sheet__handle').boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + grip.width / 2, viewport, { steps: 10 })
  await page.mouse.up()
  await expect.poll(async () => viewport - (await bottomOf('.card__kind'))).toBeLessThan(40)
  await expect(page.locator('.sheet .place-actions')).not.toBeInViewport({ ratio: 1 })

  await page.locator('.sheet').getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Search places' })).toHaveValue('')
})

test('on wide screens the place card sits in the side panel', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Phones show a bottom sheet instead')
  await openApp(page)
  await openPlace(page, 'laneway', 'Laneway Espresso')
  await expect(page.locator('.panel__body .place-card')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Expand panel' })).toHaveCount(0)
})

test('on phones a one-line message opens a sheet just tall enough for it', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'The sheet is phone-only; wider screens show a side panel')
  await page.route('**/api/route', (route) => route.fulfill({ status: 503 }))
  await openApp(page)
  await planRoute(page)
  const message = page.locator('.sheet .error')
  await expect(message).toBeVisible()
  const box = (await message.boundingBox())!
  expect(page.viewportSize()!.height - (box.y + box.height)).toBeLessThan(60)
})

test('on phones directions from a place card centre it in the open map', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'The sheet is phone-only; wider screens show a side panel')
  await openApp(page)
  await directionsToMarket(page)
  await expect(page.locator('.sheet')).toHaveCount(0)

  // The pin's tip, once the map has stopped moving
  const marker = page.locator('.maplibregl-marker:not(.map-dot)')
  const tip = async () => {
    const box = (await marker.boundingBox())!
    return Math.round(box.y + box.height)
  }
  let last = -1
  await expect.poll(async () => last === (last = await tip())).toBe(true)

  const bar = (await page.locator('.panel__top').boundingBox())!
  const middle = (bar.y + bar.height + page.viewportSize()!.height) / 2
  expect(Math.abs(last - middle)).toBeLessThan(30)
})

test('the map type is remembered, and topo needs terrain', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Map type and overlays' }).click()
  const types = page.getByRole('radiogroup', { name: 'Map type' })
  // /terrain/info.json is missing (terrain not built), so there's no topo map
  await expect(types.getByRole('radio')).toHaveText(['Standard', 'Light', 'Dark'])

  await types.getByRole('radio', { name: 'Dark' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Map type and overlays' }).click()
  await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
})

test('the map menu gives each item an icon, with an ellipsis where it opens more', async ({
  page,
}) => {
  await openApp(page)
  await page.locator('.maplibregl-canvas').click({ button: 'right', position: { x: 200, y: 300 } })
  const items = page.getByRole('menu').getByRole('menuitem')
  await expect(items).toHaveText([
    'Directions from here',
    'Directions to here',
    "What's here?",
    'Add a place here…',
    'Share',
    COORDS,
  ])
  await expect(items.filter({ hasNot: page.locator('svg.icon') })).toHaveCount(0)
})

test('the map menu shows where it was opened, and copies it', async ({ page, context, stack }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openApp(page)
  const map = page.locator('.maplibregl-canvas')
  await map.click({ button: 'right', position: { x: 200, y: 300 } })
  const item = page.getByRole('menuitem', { name: /^Copy coordinates/ })
  await expect(item).toHaveText(COORDS)
  const coords = (await item.textContent())!

  // Says so in place, as "Share" does, then goes back to the coordinates
  await item.click()
  await expect(page.getByRole('menuitem', { name: 'Coordinates copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(coords)
  await expect(page.getByRole('menuitem', { name: `Copy coordinates ${coords}` })).toHaveText(
    coords,
  )

  // They're the clicked spot's: "What's here?" from the same menu looks up the same place
  await page.getByRole('menuitem', { name: "What's here?" }).click()
  await expect.poll(() => stack.requestsTo('/api/reverse').length).toBeGreaterThan(0)
  const { params } = stack.requestsTo('/api/reverse').at(-1)!
  const [lat, lon] = coords.split(', ').map(Number)
  expect(Number(params.get('lat'))).toBeCloseTo(lat, 4)
  expect(Number(params.get('lon'))).toBeCloseTo(lon, 4)
})

test('"What\'s here?" marks the spot with a dot, not a pin', async ({ page }) => {
  await openApp(page)
  const map = page.locator('.maplibregl-canvas')
  await map.click({ button: 'right', position: { x: 200, y: 300 } })
  await page.getByRole('menuitem', { name: "What's here?" }).click()
  await expect(page.locator('.place-card')).toBeVisible()
  await expect(page.locator('.map-dot--query')).toHaveCount(1)
  // MapLibre's own pin; the dot is a marker too, with the search icon in it
  await expect(page.locator('.maplibregl-marker:not(.map-dot)')).toHaveCount(0)

  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(page.locator('.map-dot--query')).toHaveCount(0)

  // The same while directions are open, alongside the route's pins
  await planRoute(page)
  // Off to the side, clear of the directions panel
  const { width } = (await map.boundingBox())!
  await map.click({ button: 'right', position: { x: width - 60, y: 300 } })
  await page.getByRole('menuitem', { name: "What's here?" }).click()
  await expect(page.locator('.place-card')).toBeVisible()
  await expect(page.locator('.map-dot--query')).toHaveCount(1)
  await expect(page.locator('.maplibregl-marker:not(.map-dot)')).toHaveCount(2)

  await page.getByRole('button', { name: 'Close directions' }).click()
  await expect(page.locator('.map-dot--query')).toHaveCount(0)
})

test('a slow "What\'s here?" doesn\'t replace a place opened meanwhile', async ({ page }) => {
  await openApp(page)
  let answer!: () => void
  const answered = new Promise<void>((resolve) => (answer = resolve))
  await page.route('**/api/reverse*', async (route) => {
    await answered
    await route.fallback()
  })

  await page.locator('.maplibregl-canvas').click({ button: 'right', position: { x: 200, y: 300 } })
  await page.getByRole('menuitem', { name: "What's here?" }).click()
  await openPlace(page, 'laneway', 'Laneway Espresso')

  const reply = page.waitForResponse('**/api/reverse*')
  answer()
  await reply
  await expect(page.getByRole('heading', { level: 2, name: 'Laneway Espresso' })).toBeVisible()
  await expect(page.locator('.map-dot--query')).toHaveCount(0)
})
