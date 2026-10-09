import { test as base, expect, type Page, type Route } from '@playwright/test'
import { browseResults, CATEGORIES } from './fixtures/browse'
import { initialReviews, PHOTON_FEATURES, POI_DETAILS, type ReviewFixture } from './fixtures/places'
import {
  ALL_ENCODED_VALUES,
  ALL_PROFILES,
  routeResponse,
  routingInfo,
  TURN_LANES,
} from './fixtures/routing'
import { style } from './fixtures/style'
import { TRANSIT_MODES, transitPlan } from './fixtures/transit'

// Every service the app talks to, answered in the browser from e2e/fixtures: Photon,
// GraphHopper, OpenTripPlanner, TileServer and maps_backend (with a little in-memory state
// for accounts). Any other request to a service path, or to another host, fails the test:
// the running app must never reach the internet, and tests shouldn't depend on a real stack.
//
// To change an answer for one test, add a page.route() for it after the fixture has set up
// (later routes take precedence), e.g. to make routing fail.

export interface CapturedRequest {
  method: string
  path: string
  params: URLSearchParams
  body: unknown
}

export interface User {
  id: number
  username: string
}

interface Snapshot {
  name: string
  address?: string | null
  lng: number
  lat: number
  osmType?: string | null
  osmId?: number | null
}

interface SavedPlace extends Snapshot {
  id: number
  kind: 'home' | 'work' | 'favourite'
  label: string
}

interface Recent {
  query: string
  category?: string | null
  place?: Snapshot | null
  searchedAt: string
}

/** The test account the mock backend accepts */
export const ACCOUNT = { username: 'casey', password: 'correct-horse' }

export class MockStack {
  /** Every request answered from fixtures, in order */
  readonly requests: CapturedRequest[] = []
  /** Requests nothing answered: service paths without a fixture, and other hosts */
  readonly unexpected: string[] = []

  user: User | null = null
  savedPlaces: SavedPlace[] = []
  recents: Recent[] = []
  reviews: Record<string, ReviewFixture[]> = initialReviews()
  /** Profiles GraphHopper says it has */
  profiles = ALL_PROFILES
  /** What GraphHopper's graph knows about roads (decides which car avoid options show) */
  encodedValues = ALL_ENCODED_VALUES
  private nextId = 100

  private readonly origin: string

  constructor(origin: string) {
    this.origin = origin
  }

  /** Requests to a path (exact, or starting with it when it ends in "/") */
  requestsTo(path: string, method?: string): CapturedRequest[] {
    return this.requests.filter(
      (r) =>
        (path.endsWith('/') ? r.path.startsWith(path) : r.path === path) &&
        (!method || r.method === method),
    )
  }

  /** Starts the test signed in */
  signIn(user: User = { id: 1, username: ACCOUNT.username }) {
    this.user = user
  }

  async install(page: Page) {
    await page.route('**/*', (route) => this.handle(route))
  }

  private async handle(route: Route) {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== this.origin) {
      this.unexpected.push(`${request.method()} ${request.url()}`)
      return route.abort('blockedbyclient')
    }
    // The app itself, from the Vite dev server
    if (!/^\/(api|styles|data|fonts|terrain)\//.test(url.pathname)) return route.continue()

    let body: unknown = undefined
    const raw = request.postData()
    if (raw) {
      try {
        body = JSON.parse(raw)
      } catch {
        body = raw
      }
    }
    const captured = {
      method: request.method(),
      path: url.pathname,
      params: url.searchParams,
      body,
    }

    const answer = this.answer(captured)
    if (!answer) {
      this.unexpected.push(`${captured.method} ${url.pathname}${url.search}`)
      return fulfil(route, 501, { detail: 'Not mocked' })
    }
    this.requests.push(captured)
    return fulfil(route, answer.status ?? 200, answer.json)
  }

  private answer({ method, path, params, body }: CapturedRequest): Answer | null {
    const json = (value: unknown, status = 200) => ({ status, json: value })
    const signedIn = (then: () => Answer) =>
      this.user ? then() : json({ detail: 'Sign in first.' }, 401)
    const route = `${method} ${path}`

    // ---------- map tiles (TileServer) ----------
    if (route === 'GET /styles/basic-preview/style.json') return json(style)
    // Not built: the app carries on without the topo map
    if (path.startsWith('/terrain/')) return json({ detail: 'Not found' }, 404)

    // ---------- search (Photon) ----------
    if (route === 'GET /api/search') {
      const q = (params.get('q') ?? '').toLowerCase()
      const limit = Number(params.get('limit') ?? 6)
      const features = PHOTON_FEATURES.filter((f) =>
        f.properties.name.toLowerCase().includes(q),
      ).slice(0, limit)
      return json({ type: 'FeatureCollection', features })
    }
    if (route === 'GET /api/reverse') {
      return json({ type: 'FeatureCollection', features: [PHOTON_FEATURES[0]] })
    }

    // ---------- routing (GraphHopper) ----------
    if (route === 'GET /api/info') return json(routingInfo(this.profiles, this.encodedValues))
    if (route === 'POST /api/route') {
      return json(routeResponse((body as { profile: string }).profile))
    }

    // ---------- public transport (OpenTripPlanner) ----------
    if (route === 'POST /api/transit') {
      const { query, variables } = body as { query: string; variables?: TransitVariables }
      if (!query.includes('planConnection')) return json(TRANSIT_MODES)
      const allowed = variables?.modes?.transit.transit.map((m) => m.mode) ?? null
      return json(transitPlan(allowed))
    }

    // ---------- maps_backend ----------
    if (route === 'GET /api/browse/categories') return json(CATEGORIES)
    if (route === 'GET /api/browse') return json(browseResults(params.get('category') ?? ''))
    if (route === 'GET /api/places/search') return json([])
    if (route === 'POST /api/lanes') {
      const { approaches } = body as { approaches: { wayId: number }[] }
      return json(approaches.map((a) => TURN_LANES[a.wayId] ?? null))
    }

    const place = /^\/api\/places\/([NWROU])\/(\d+)(\/community|\/review)?$/.exec(path)
    if (place) {
      const key = `${place[1]}${place[2]}`
      const reviews = (this.reviews[key] ??= [])
      if (!place[3] && method === 'GET') {
        const details = POI_DETAILS[key]
        return details
          ? json(details)
          : json({ detail: "That place isn't in the browse data." }, 404)
      }
      if (place[3] === '/community' && method === 'GET') {
        const shown = reviews.map((r) => ({ ...r, mine: r.username === this.user?.username }))
        const rating = shown.length
          ? Math.round((shown.reduce((sum, r) => sum + r.rating, 0) / shown.length) * 10) / 10
          : null
        return json({ rating, reviewCount: shown.length, reviews: shown, photos: [] })
      }
      if (place[3] === '/review' && method === 'PUT') {
        return signedIn(() => {
          const { rating, body: text } = body as { rating: number; body: string }
          const now = '2026-10-12T10:00:00+11:00'
          const review = {
            id: this.nextId++,
            username: this.user!.username,
            rating,
            body: text,
            createdAt: now,
            updatedAt: now,
            mine: true,
          }
          this.reviews[key] = [review, ...reviews.filter((r) => r.username !== review.username)]
          return json(review)
        })
      }
    }

    // ---------- accounts ----------
    if (route === 'GET /api/me') return json({ user: this.user })
    if (route === 'POST /api/auth/login') {
      const { username, password } = body as typeof ACCOUNT
      if (username !== ACCOUNT.username || password !== ACCOUNT.password) {
        return json({ detail: 'Wrong username or password.' }, 401)
      }
      this.signIn()
      return json(this.user)
    }
    if (route === 'POST /api/auth/signup') {
      const { username } = body as typeof ACCOUNT
      this.signIn({ id: 2, username })
      return json(this.user, 201)
    }
    if (route === 'POST /api/auth/logout') {
      this.user = null
      return { status: 204 }
    }
    if (route === 'GET /api/me/places') return signedIn(() => json(this.savedPlaces))
    if (route === 'POST /api/me/places') {
      return signedIn(() => {
        const place = { ...(body as Omit<SavedPlace, 'id'>), id: this.nextId++ }
        // A new Home or Work replaces the old one
        if (place.kind !== 'favourite') {
          this.savedPlaces = this.savedPlaces.filter((p) => p.kind !== place.kind)
        }
        this.savedPlaces.push(place)
        return json(place, 201)
      })
    }
    const saved = /^\/api\/me\/places\/(\d+)$/.exec(path)
    if (saved && method === 'DELETE') {
      return signedIn(() => {
        this.savedPlaces = this.savedPlaces.filter((p) => p.id !== Number(saved[1]))
        return { status: 204 }
      })
    }
    if (route === 'GET /api/me/recents') return signedIn(() => json(this.recents))
    if (route === 'POST /api/me/recents') {
      return signedIn(() => {
        for (const search of body as Omit<Recent, 'searchedAt'>[]) {
          this.recents = [
            { ...search, searchedAt: new Date().toISOString() },
            ...this.recents.filter((r) => recentKey(r) !== recentKey(search)),
          ]
        }
        return json(this.recents.slice(0, 20))
      })
    }
    if (route === 'DELETE /api/me/recents') {
      return signedIn(() => {
        this.recents = []
        return { status: 204 }
      })
    }

    return null
  }
}

interface Answer {
  status?: number
  json?: unknown
}

interface TransitVariables {
  modes?: { transit: { transit: { mode: string }[] } }
}

/** The backend's rule for when two searches are the same (maps_backend/app/routes/me.py) */
function recentKey({ query, category, place }: Omit<Recent, 'searchedAt'>): string {
  if (place?.osmType && place.osmId) return `osm:${place.osmType}${place.osmId}`
  if (place) return `at:${place.lng.toFixed(5)},${place.lat.toFixed(5)}`
  if (category) return `category:${category}`
  return `query:${query.trim().toLowerCase()}`
}

async function fulfil(route: Route, status: number, json: unknown) {
  try {
    if (status === 204 || json === undefined) await route.fulfill({ status })
    else await route.fulfill({ status, json })
  } catch {
    // The app cancelled the request (e.g. a newer search) before it was answered
  }
}

export const test = base.extend<{ stack: MockStack }>({
  // Automatic, so no test can reach a real backend by forgetting to ask for it
  stack: [
    async ({ page, baseURL }, use) => {
      const stack = new MockStack(new URL(baseURL!).origin)
      await stack.install(page)

      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(err.message))

      await use(stack)

      expect(stack.unexpected, 'requests with no fixture, or to other hosts').toEqual([])
      expect(errors, 'uncaught errors in the page').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
