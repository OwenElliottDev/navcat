import type { Page } from '@playwright/test'
import { decodeShortlink } from '../src/utils/links'
import { CAFE } from './fixtures/places'
import { expectNear, lastLookup, openApp, openPlace } from './helpers'
import { expect, test } from './mockStack'

/** No share sheet, as in most desktop browsers: sharing copies the link instead */
async function withoutShareSheet(page: Page) {
  await page.addInitScript(() => Object.defineProperty(navigator, 'share', { value: undefined }))
}

/**
 * A share sheet that notes the links it's given, then shares them or is closed; what's copied
 * is noted too
 */
async function withShareSheet(page: Page, closed = false) {
  await page.addInitScript((closed) => {
    const shared: (string | undefined)[] = []
    const copied: string[] = []
    Object.assign(window, { shared, copied })
    const writeText = navigator.clipboard.writeText.bind(navigator.clipboard)
    navigator.clipboard.writeText = (text) => {
      copied.push(text)
      return writeText(text)
    }
    Object.defineProperty(navigator, 'share', {
      value: async ({ url }: ShareData) => {
        shared.push(url)
        if (closed) throw new DOMException('Share canceled', 'AbortError')
      },
    })
  }, closed)
}

const sharedLinks = (page: Page) =>
  page.evaluate(() => (window as unknown as { shared: string[] }).shared)
const copied = (page: Page) =>
  page.evaluate(() => (window as unknown as { copied: string[] }).copied)

/** The view a link's shortlink points at, checking it's this instance's and marks the spot */
function viewOf(page: Page, link: string) {
  const url = new URL(link)
  expect(url.origin).toBe(new URL(page.url()).origin)
  expect(url.search).toBe('?m')
  const { center, zoom } = decodeShortlink(url.pathname.replace(/^\/go\//, ''))!
  return { at: [center.lng, center.lat], zoom }
}

/** Opens the map menu at a spot, and reads where it is from the menu ([lng, lat]) */
async function menuAt(page: Page, at: { x: number; y: number }) {
  await page.locator('.maplibregl-canvas').click({ button: 'right', position: at })
  const coords = page.getByRole('menuitem', { name: /^Copy coordinates/ })
  const [lat, lng] = (await coords.textContent())!.split(', ').map(Number)
  return [lng, lat]
}

/** The map menu at the middle of the map: where it's centred */
async function menuAtCentre(page: Page) {
  const { width, height } = (await page.locator('.maplibregl-canvas').boundingBox())!
  return menuAt(page, { x: width / 2, y: height / 2 })
}

async function clipboard(page: Page) {
  return page.evaluate(() => navigator.clipboard.readText())
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
})

test('"Share" in the map menu copies a link to the spot, without a share sheet', async ({
  page,
}) => {
  await withoutShareSheet(page)
  await openApp(page)
  const spot = await menuAt(page, { x: 200, y: 300 })
  await page.getByRole('menuitem', { name: 'Share' }).click()
  await expect(page.getByRole('menuitem', { name: 'Link copied' })).toBeVisible()

  const { at, zoom } = viewOf(page, await clipboard(page))
  expectNear(at, spot)
  // Zoomed in on the spot, though the map is zoomed out to the whole country
  expect(zoom).toBe(16)
})

test('"Share" opens the share sheet with the link, where there is one', async ({ page }) => {
  await withShareSheet(page)
  await openApp(page)
  const spot = await menuAt(page, { x: 200, y: 300 })
  await page.getByRole('menuitem', { name: 'Share' }).click()

  await expect.poll(() => sharedLinks(page)).toHaveLength(1)
  expectNear(viewOf(page, (await sharedLinks(page))[0]).at, spot)
  await expect(page.getByRole('menuitem', { name: 'Share' })).toBeVisible()
})

test('closing the share sheet without sharing copies nothing', async ({ page }) => {
  await withShareSheet(page, true)
  await openApp(page)
  await menuAt(page, { x: 200, y: 300 })
  await page.getByRole('menuitem', { name: 'Share' }).click()
  await expect.poll(() => sharedLinks(page)).toHaveLength(1)

  // Copied after, so a copy of the link would come first
  const coords = page.getByRole('menuitem', { name: /^Copy coordinates/ })
  const text = await coords.textContent()
  await coords.click()
  await expect.poll(() => copied(page)).toEqual([text])
  await expect(page.getByRole('menuitem', { name: 'Share' })).toBeVisible()
})

test("the place card's Share copies a link to the place", async ({ page }) => {
  await withoutShareSheet(page)
  await openApp(page)
  await openPlace(page, 'laneway', 'Laneway Espresso')
  const card = page.locator('.place-card')
  // Right after Save
  await expect(card.locator('.place-actions .action__label').last()).toHaveText('Share')
  await card.getByRole('button', { name: 'Share' }).click()
  await expect(card.getByRole('button', { name: 'Copied' })).toBeVisible()

  const { at, zoom } = viewOf(page, await clipboard(page))
  expectNear(at, CAFE.geometry.coordinates)
  expect(zoom).toBe(16)
})

test("a shared link opens on its spot, and says what's there", async ({ page, stack }) => {
  await withoutShareSheet(page)
  await openApp(page)
  const spot = await menuAt(page, { x: 200, y: 300 })
  await page.getByRole('menuitem', { name: 'Share' }).click()
  await expect(page.getByRole('menuitem', { name: 'Link copied' })).toBeVisible()
  const link = await clipboard(page)

  await openApp(page, new URL(link).pathname + new URL(link).search)
  await expect(
    page.getByRole('heading', { level: 2, name: 'Flinders Street Station' }),
  ).toBeVisible()
  await expect(page.locator('.map-dot--query')).toHaveCount(1)
  expectNear(lastLookup(stack), spot)
  // The map opened there, and stays there
  const dot = (await page.locator('.map-dot--query').boundingBox())!
  const map = (await page.locator('.maplibregl-canvas').boundingBox())!
  // Within a pixel or two: markers sit on whole pixels
  expect(Math.abs(dot.x + dot.width / 2 - (map.x + map.width / 2))).toBeLessThan(2)
  expect(Math.abs(dot.y + dot.height / 2 - (map.y + map.height / 2))).toBeLessThan(2)
})

for (const path of [
  '/#map=15/-37.8136/144.9631',
  '/?lat=-37.8136&lon=144.9631&zoom=15',
  '/go/uG4HYp~Z--',
]) {
  test(`a link to a view alone opens there, saying nothing about it: ${path}`, async ({
    page,
    stack,
  }) => {
    await openApp(page, path)
    expectNear(await menuAtCentre(page), [144.9631, -37.8136], 3)
    await expect(page.locator('.place-card')).toHaveCount(0)
    expect(stack.requestsTo('/api/reverse')).toHaveLength(0)
  })
}

test("OSM's marker link shows what's at the marker, in the view it gives", async ({
  page,
  stack,
}) => {
  await openApp(page, '/?mlat=-37.81827&mlon=144.96706#map=15/-37.8136/144.9631')
  await expect(page.locator('.map-dot--query')).toHaveCount(1)
  expectNear(lastLookup(stack), [144.96706, -37.81827])
  await page.getByRole('button', { name: 'Clear' }).click()
  expectNear(await menuAtCentre(page), [144.9631, -37.8136], 3)
})

test("a shortlink that doesn't decode opens the usual map", async ({ page, stack }) => {
  await openApp(page, '/go/AA?m')
  await menuAtCentre(page)
  await expect(page.locator('.place-card')).toHaveCount(0)
  expect(stack.requestsTo('/api/reverse')).toHaveLength(0)
})
