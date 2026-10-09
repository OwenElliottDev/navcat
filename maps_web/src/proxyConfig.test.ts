import { describe, expect, it } from 'vitest'
import type { ProxyOptions } from 'vite'
import compose from '../../docker-compose.yml?raw'
import nginxConf from '../nginx.conf?raw'
import viteConfig from '../vite.config'

// nginx.conf (production) and vite.config.ts (development) both route the app's paths to the
// services, and must agree: same service, same path on it. Services are matched up through
// docker-compose.yml, which publishes each one's container port on a localhost port for Vite.

interface Target {
  /** The port on localhost that reaches the service in development */
  port: number
  path: string
}

/** Published localhost port for each compose service's container port */
function publishedPort(service: string, containerPort: string): number {
  const block = compose.split(/\n(?= {2}[\w-]+:\n)/).find((b) => b.startsWith(`  ${service}:`))
  const match = block?.match(new RegExp(`"(?:127\\.0\\.0\\.1:)?(\\d+):${containerPort}"`))
  if (!match) throw new Error(`${service} doesn't publish port ${containerPort}`)
  return Number(match[1])
}

const WEB_PORT = publishedPort('maps-web', '80')

interface Location {
  kind: '=' | '~' | 'prefix'
  pattern: string
  proxyPass: string | null
}

const variables = Object.fromEntries(
  [...nginxConf.matchAll(/^\s*set \$(\w+) ([\w-]+);/gm)].map((m) => [m[1], m[2]]),
)

const locations: Location[] = [
  ...nginxConf.matchAll(/^\s*location (?:(=|~) )?(\S+) \{([^}]*)\}/gm),
].map(([, kind, pattern, body]) => ({
  kind: (kind as '=' | '~' | undefined) ?? 'prefix',
  pattern,
  proxyPass: body.match(/proxy_pass (\S+);/)?.[1] ?? null,
}))

/** Where nginx sends a request path, following its location precedence. */
function nginxTarget(path: string): Target {
  const exact = locations.find((l) => l.kind === '=' && l.pattern === path)
  const prefix = locations
    .filter((l) => l.kind === 'prefix' && path.startsWith(l.pattern))
    .toSorted((a, b) => b.pattern.length - a.pattern.length)[0]
  const regex = locations.find((l) => l.kind === '~' && new RegExp(l.pattern).test(path))
  const location = exact ?? regex ?? prefix
  if (!location) throw new Error(`nginx has no location for ${path}`)
  if (!location.proxyPass) return { port: WEB_PORT, path } // served by the web container itself

  const [, variable, port, upstreamPath] = location.proxyPass.match(
    /^http:\/\/\$(\w+):(\d+)(\/[^$]*)?/,
  )!
  const service = variables[variable]
  // With no path in proxy_pass, nginx passes the request path on unchanged
  return { port: publishedPort(service, port), path: upstreamPath ?? path }
}

/** Where the Vite dev server sends a request path: the first matching proxy rule. */
function viteTarget(path: string): Target {
  const proxy = viteConfig.server!.proxy as Record<string, ProxyOptions>
  const rule = Object.entries(proxy).find(([key]) =>
    key.startsWith('^') ? new RegExp(key).test(path) : path.startsWith(key),
  )
  if (!rule) throw new Error(`Vite has no proxy rule for ${path}`)
  const [, options] = rule
  return {
    port: Number(new URL(options.target as string).port),
    path: options.rewrite ? options.rewrite(path) : path,
  }
}

const SAMPLE_PATHS = [
  // Every exact location nginx has, plus a path under each prefix and pattern
  ...locations.filter((l) => l.kind === '=' && l.pattern !== '/').map((l) => l.pattern),
  '/api/road-data/15/29590/20107.mvt',
  '/api/me',
  '/api/browse/categories',
  '/api/places/N/123/community',
  '/styles/basic-preview/style.json',
  '/data/v3.json',
  '/fonts/Noto Sans Regular/0-255.pbf',
  '/terrain/12/3700/2513.png',
]

describe('the dev proxy matches nginx', () => {
  it.each(SAMPLE_PATHS)('%s', (path) => {
    expect(viteTarget(path)).toEqual(nginxTarget(path))
  })

  it('reads every nginx location', () => {
    // Guards the parsing above: a location it missed would silently go untested
    expect(locations).toHaveLength(nginxConf.match(/^\s*location /gm)!.length)
  })
})
