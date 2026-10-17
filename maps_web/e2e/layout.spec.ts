import { openApp, openPlace } from './helpers'
import { expect, test } from './mockStack'

const COORDS = /^-?\d+\.\d{5}, -?\d+\.\d{5}$/

test('on phones the place card is a bottom sheet that expands', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The sheet is phone-only; wider screens show a side panel')
  await openApp(page)
  await openPlace(page, 'laneway', 'Laneway Espresso')

  const sheet = page.locator('.sheet')
  const half = (await sheet.boundingBox())!.height
  await page.getByRole('button', { name: 'Expand panel' }).click()
  await expect(page.getByRole('button', { name: 'Shrink panel' })).toBeVisible()
  expect((await sheet.boundingBox())!.height).toBeGreaterThan(half)
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
  ])
  await expect(items.filter({ hasNot: page.locator('svg.icon') })).toHaveCount(0)
})
