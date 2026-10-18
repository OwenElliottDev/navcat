import { CAFE_ID } from './fixtures/places'
import { openApp, openPlace } from './helpers'
import { ACCOUNT, expect, test } from './mockStack'

test('signing in shows your account', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Sign in' }).click()
  const dialog = page.getByRole('dialog', { name: 'Sign in' })
  await dialog.getByLabel('Username').fill(ACCOUNT.username)
  await dialog.getByLabel('Password').fill(ACCOUNT.password)
  await dialog.getByRole('button', { name: 'Sign in' }).click()

  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: `Account: ${ACCOUNT.username}` })).toHaveText('C')
})

test('a wrong password shows the backend’s message', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Sign in' }).click()
  const dialog = page.getByRole('dialog', { name: 'Sign in' })
  await dialog.getByLabel('Username').fill(ACCOUNT.username)
  await dialog.getByLabel('Password').fill('wrong')
  await dialog.getByRole('button', { name: 'Sign in' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Wrong username or password.')
})

test('saving while signed out asks you to sign in', async ({ page }) => {
  await openApp(page)
  await openPlace(page, 'laneway', 'Laneway Espresso')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible()
})

test('a saved place and recent searches appear in the search dropdown', async ({ page, stack }) => {
  stack.signIn()
  await openApp(page)
  await openPlace(page, 'laneway', 'Laneway Espresso')

  await page.getByRole('button', { name: 'Set as Home' }).click()
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(stack.savedPlaces).toMatchObject([
    { kind: 'home', label: 'Home', name: 'Laneway Espresso', osmType: 'N', osmId: CAFE_ID },
  ])
  // The search was recorded with the account
  expect(stack.recents[0]).toMatchObject({ query: 'Laneway Espresso', place: { osmId: CAFE_ID } })

  await page.getByRole('button', { name: 'Clear' }).click()
  await page.getByRole('combobox', { name: 'Search places' }).focus()
  await expect(page.getByRole('option')).toHaveText([
    /Home.*Laneway Espresso/,
    /Laneway Espresso.*66 Bourke Street/,
  ])
})

test('searches made signed out move into the account on sign-in', async ({ page, stack }) => {
  await openApp(page)
  await openPlace(page, 'Flinders', 'Flinders Street Station')

  await page.getByRole('button', { name: 'Sign in' }).click()
  const dialog = page.getByRole('dialog', { name: 'Sign in' })
  await dialog.getByLabel('Username').fill(ACCOUNT.username)
  await dialog.getByLabel('Password').fill(ACCOUNT.password)
  await dialog.getByRole('button', { name: 'Sign in' }).click()

  await expect.poll(() => stack.recents.map((r) => r.query)).toEqual(['Flinders Street Station'])
  expect(await page.evaluate(() => localStorage.getItem('maps.recents'))).toBeNull()
})

test('writing a review adds it to the place', async ({ page, stack }) => {
  stack.signIn()
  await openApp(page)
  await openPlace(page, 'laneway', 'Laneway Espresso')

  const reviews = page.getByRole('region', { name: 'Reviews' })
  await reviews.getByRole('button', { name: 'Write a review' }).click()
  await reviews.getByRole('radio', { name: '3 stars' }).click()
  await reviews.getByLabel('Your review').fill('Good, but no oat milk.')
  await reviews.getByRole('button', { name: 'Post' }).click()

  await expect(reviews.getByText('Good, but no oat milk.')).toBeVisible()
  await expect(reviews.getByRole('button', { name: 'Edit your review' })).toBeVisible()
  await expect(page.locator('.place-rating')).toContainText('(3 reviews)')
  expect(stack.requestsTo(`/api/places/N/${CAFE_ID}/review`, 'PUT')[0].body).toEqual({
    rating: 3,
    body: 'Good, but no oat milk.',
  })
})

// Settings count as off until the server answers, so each test first waits for something
// that only shows once they've loaded

test('with reviews turned off, your review can be deleted but not changed', async ({
  page,
  stack,
}) => {
  stack.features = { ...stack.features, allowReviews: false }
  stack.signIn()
  stack.reviews[`N${CAFE_ID}`].unshift({
    id: 3,
    username: ACCOUNT.username,
    rating: 2,
    body: 'Too loud.',
    createdAt: '2026-10-01T09:00:00+10:00',
    updatedAt: '2026-10-01T09:00:00+10:00',
    mine: true,
  })
  await openApp(page)
  await openPlace(page, 'laneway', 'Laneway Espresso')

  await expect(page.getByRole('button', { name: '+ Add photo' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Edit$/ })).toBeVisible()
  const reviews = page.getByRole('region', { name: 'Reviews' })
  await expect(reviews.getByText('Best flat white in the lane.')).toBeVisible()
  await expect(reviews.getByRole('button', { name: /review$/ })).toHaveText('Delete your review')

  page.once('dialog', (dialog) => dialog.accept())
  await reviews.getByRole('button', { name: 'Delete your review' }).click()
  await expect(reviews.getByText('Too loud.')).toHaveCount(0)
  await expect(reviews.getByRole('button')).toHaveCount(0)
  expect(stack.requestsTo(`/api/places/N/${CAFE_ID}/review`, 'DELETE')).toHaveLength(1)
})

test('with photos and place edits turned off, places can only be reviewed', async ({
  page,
  stack,
}) => {
  stack.features = { allowPlaceEdits: false, allowReviews: true, allowPhotos: false }
  stack.signIn()
  await openApp(page)
  await openPlace(page, 'laneway', 'Laneway Espresso')

  await expect(page.getByRole('button', { name: 'Write a review' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Photos' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Edit$/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'Clear' }).click()
  await page.locator('.maplibregl-canvas').click({ button: 'right', position: { x: 200, y: 300 } })
  await expect(page.getByRole('menuitem', { name: "What's here?" })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Add a place here…' })).toHaveCount(0)
})

test('signing out forgets the account’s places', async ({ page, stack }) => {
  stack.signIn()
  stack.savedPlaces = [
    {
      id: 7,
      kind: 'work',
      label: 'Work',
      name: 'Flinders Street Station',
      lng: 144.96706,
      lat: -37.81827,
    },
  ]
  await openApp(page)
  await page.getByRole('combobox', { name: 'Search places' }).focus()
  await expect(page.getByRole('option', { name: /Work/ })).toBeVisible()
  await page.getByRole('combobox', { name: 'Search places' }).blur()

  await page.getByRole('button', { name: `Account: ${ACCOUNT.username}` }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Search places' }).focus()
  await expect(page.getByRole('option', { name: /Work/ })).toHaveCount(0)
})
