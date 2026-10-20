import { expect, it } from 'vitest'
import linkPreview from '../../maps_backend/app/link_preview.py?raw'
import { COLORS, MAP_STYLE_URL } from './config'

// The backend draws shared links' preview images itself, in the app's map style and pin colour

function pythonString(name: string): string | undefined {
  return linkPreview.match(new RegExp(`^${name} = "([^"]*)"`, 'm'))?.[1]
}

it('previews use the map style the app is made from', () => {
  expect(MAP_STYLE_URL).toBe(`/styles/${pythonString('STYLE')}/style.json`)
})

it('previews pin the spot in the route colour', () => {
  expect(pythonString('PIN_COLOR')).toBe(COLORS.route)
})
