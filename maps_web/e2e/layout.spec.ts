import { openApp, openPlace } from './helpers'
import { expect, test } from './mockStack'

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
