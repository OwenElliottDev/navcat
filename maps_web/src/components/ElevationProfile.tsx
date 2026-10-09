import { useEffect, useMemo, useState, type PointerEvent } from 'react'
import type { LineString, LngLat } from '../types'
import { distanceInMetres } from '../utils/geo'
import { formatDistance } from '../utils/format'
import './ElevationProfile.css'

interface ElevationProfileProps {
  /** The route's points, as [lng, lat, elevation] */
  coordinates: LineString['coordinates']
  /** Where on the route the pointer is, or null when it leaves the chart */
  onHover?: (at: LngLat | null) => void
}

const WIDTH = 300
const HEIGHT = 80
/** Enough points for a smooth line without drawing every one of a long route's */
const SAMPLES = 200
/** Small climbs are drawn on at least this much height, so flat routes look flat */
const MIN_RANGE = 30

interface Sample {
  along: number
  elevation: number
  at: LngLat
}

/** Points evenly spaced along the route, with the elevation and position at each. */
function sample(coordinates: LineString['coordinates']): Sample[] {
  const points = coordinates.map(([lng, lat, elevation = 0]) => ({ at: { lng, lat }, elevation }))
  const along = [0]
  for (let i = 1; i < points.length; i++) {
    along.push(along[i - 1] + distanceInMetres(points[i - 1].at, points[i].at))
  }
  const total = along[along.length - 1]

  const samples: Sample[] = []
  let i = 0
  for (let s = 0; s <= SAMPLES; s++) {
    const target = (total * s) / SAMPLES
    while (i < points.length - 2 && along[i + 1] < target) i++
    const span = along[i + 1] - along[i]
    const t = span > 0 ? Math.min(Math.max((target - along[i]) / span, 0), 1) : 0
    const a = points[i]
    const b = points[i + 1]
    samples.push({
      along: target,
      elevation: a.elevation + (b.elevation - a.elevation) * t,
      at: { lng: a.at.lng + (b.at.lng - a.at.lng) * t, lat: a.at.lat + (b.at.lat - a.at.lat) * t },
    })
  }
  return samples
}

/** A chart of the route's height along its length, for walks and rides. */
export function ElevationProfile({ coordinates, onHover }: ElevationProfileProps) {
  const samples = useMemo(
    () => (coordinates.length > 1 && coordinates[0][2] !== undefined ? sample(coordinates) : []),
    [coordinates],
  )
  const [hovered, setHovered] = useState<number | null>(null)

  // Take the dot and cursor off when the route changes or the chart goes away
  useEffect(
    () => () => {
      setHovered(null)
      onHover?.(null)
    },
    [samples, onHover],
  )

  if (!samples.length) return null

  const elevations = samples.map((s) => s.elevation)
  const lowest = Math.min(...elevations)
  const highest = Math.max(...elevations)
  const middle = (lowest + highest) / 2
  const range = Math.max(highest - lowest, MIN_RANGE)
  const bottom = middle - range / 2
  const total = samples[samples.length - 1].along

  const x = (s: Sample) => (total > 0 ? (s.along / total) * WIDTH : 0)
  const y = (s: Sample) => HEIGHT - ((s.elevation - bottom) / range) * (HEIGHT - 4) - 2
  const line = samples.map((s, i) => `${i ? 'L' : 'M'}${x(s).toFixed(1)},${y(s).toFixed(1)}`)
  const area = `${line.join('')}L${WIDTH},${HEIGHT}L0,${HEIGHT}Z`

  function hover(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const fraction = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1)
    const index = Math.round(fraction * SAMPLES)
    setHovered(index)
    onHover?.(samples[index].at)
  }

  function leave() {
    setHovered(null)
    onHover?.(null)
  }

  const point = hovered === null ? null : samples[hovered]

  return (
    <figure className="elevation" aria-label="Elevation along the route">
      <div className="elevation__scale" aria-hidden="true">
        <span>{Math.round(highest)} m</span>
        <span>{Math.round(lowest)} m</span>
      </div>
      <div
        className="elevation__chart"
        onPointerMove={hover}
        onPointerDown={hover}
        onPointerLeave={leave}
        onPointerCancel={leave}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
          <path className="elevation__area" d={area} />
          <path className="elevation__line" d={line.join('')} />
        </svg>
        {point && (
          <>
            <div className="elevation__cursor" style={{ left: `${(x(point) / WIDTH) * 100}%` }} />
            <div
              className="elevation__readout"
              style={{ left: `${(x(point) / WIDTH) * 100}%` }}
              data-side={x(point) > WIDTH / 2 ? 'left' : 'right'}
            >
              {Math.round(point.elevation)} m · {formatDistance(point.along)}
            </div>
          </>
        )}
      </div>
      <figcaption className="elevation__axis">
        <span>0</span>
        <span>{formatDistance(total)}</span>
      </figcaption>
    </figure>
  )
}
