import { openApp, openPlace } from './helpers'
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

  await item.click()
  await expect(page.getByText('Coordinates copied')).toBeAttached()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(coords)

  // They're the clicked spot's: "What's here?" from the same menu looks up the same place
  await page.getByRole('menuitem', { name: "What's here?" }).click()
  await expect.poll(() => stack.requestsTo('/api/reverse').length).toBeGreaterThan(0)
  const { params } = stack.requestsTo('/api/reverse').at(-1)!
  const [lat, lon] = coords.split(', ').map(Number)
  expect(Number(params.get('lat'))).toBeCloseTo(lat, 4)
  expect(Number(params.get('lon'))).toBeCloseTo(lon, 4)
})
