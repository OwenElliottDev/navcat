import type { Locator, Page } from '@playwright/test'
import { browseCategory, openApp, openPlace, planRoute } from './helpers'
import { expect, test } from './mockStack'

// What the panels look like, to catch unintended changes to layout and styling. Only compared
// in the pinned Playwright container (npm run test:e2e:docker); after an intended change,
// re-record them with npm run test:e2e:update and review the new images in the diff.
//
// The map is hidden: it's WebGL, which renders differently between machines, and it, its
// markers and the scale bar depend on where the camera has got to in its animations.
const HIDE_MAP = `
  .maplibregl-canvas, .maplibregl-marker, .maplibregl-ctrl-scale { visibility: hidden !important; }
`

async function shoot(target: Page | Locator, name: string) {
  const page = 'page' in target ? target.page() : target
  await page.addStyleTag({ content: HIDE_MAP })
  await expect(target).toHaveScreenshot(name)
}

/** The side panel on wide screens; on phones, the whole screen (top bar and bottom sheet) */
const panel = (page: Page, isMobile: boolean) => (isMobile ? page : page.locator('.panel'))

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-12T10:00:00+11:00'))
})

test('place card @screenshot', async ({ page, isMobile }) => {
  await openApp(page)
  await openPlace(page, 'laneway', 'Laneway Espresso')
  await expect(page.getByText('Best flat white in the lane.')).toBeVisible()
  await shoot(panel(page, isMobile), 'place-card.png')
})

test('route card @screenshot', async ({ page, isMobile }) => {
  await openApp(page)
  await planRoute(page)
  await expect(page.getByRole('figure', { name: 'Elevation along the route' })).toBeVisible()
  await shoot(panel(page, isMobile), 'directions-walk.png')
})

test('drive options @screenshot', async ({ page }) => {
  await openApp(page)
  await planRoute(page)
  await page
    .getByRole('group', { name: 'Travel mode' })
    .getByRole('button', { name: 'Drive' })
    .click()
  await expect(page.locator('.route-summary')).toContainText('3 min')
  await shoot(page.locator('.panel__top'), 'directions-drive-form.png')
})

test('walk options @screenshot', async ({ page }) => {
  await openApp(page)
  await planRoute(page)
  await page.getByText('Additional options').click()
  await page.getByRole('switch', { name: 'Avoid steep hills' }).click()
  await expect(page.getByRole('switch', { name: 'Avoid steep hills' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await shoot(page.locator('.panel__top'), 'directions-walk-options.png')
})

test('transit card @screenshot', async ({ page, isMobile }) => {
  await openApp(page)
  await planRoute(page)
  await page
    .getByRole('group', { name: 'Travel mode' })
    .getByRole('button', { name: 'Transit' })
    .click()
  await expect(page.locator('.legs > li')).toHaveCount(3)
  await shoot(panel(page, isMobile), 'directions-transit.png')
})

test('browse results @screenshot', async ({ page }) => {
  await openApp(page)
  await browseCategory(page, 'Cafes')
  await expect(page.locator('.browse-item')).toHaveCount(3)
  await shoot(page, 'browse-cafes.png')
})
