import { COLORS } from '../config'
import { SIGN_ALIGHT, SIGN_BOARD } from '../utils/transitNavigation'
import { Icon } from './icons'

// GraphHopper turn signs -> arrow rotation in degrees
const ANGLES: Record<number, number> = {
  [-98]: 180, // u-turn
  [-8]: 180,
  8: 180,
  [-7]: -25, // keep left
  7: 25, // keep right
  [-3]: -135,
  [-2]: -90,
  [-1]: -45,
  0: 0,
  1: 45,
  2: 90,
  3: 135,
}

const FINISH = [4, 5] // arrived, or reached a via point
const ROUNDABOUT = [6, -6]

export function TurnIcon({ sign }: { sign: number }) {
  if (sign === SIGN_BOARD || sign === SIGN_ALIGHT)
    return <Icon name="transit" className="turn-icon" />

  if (FINISH.includes(sign)) {
    return (
      <svg className="turn-icon" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="5" fill={COLORS.route} />
      </svg>
    )
  }

  if (ROUNDABOUT.includes(sign)) {
    return (
      <svg className="turn-icon" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="5" stroke="currentColor" strokeWidth="1.8" fill="none" />
      </svg>
    )
  }

  return (
    <svg className="turn-icon" viewBox="0 0 20 20" aria-hidden="true">
      <g transform={`rotate(${ANGLES[sign] ?? 0} 10 10)`}>
        <path
          d="M10 16V4M10 4l-4 4M10 4l4 4"
          stroke="currentColor"
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}
