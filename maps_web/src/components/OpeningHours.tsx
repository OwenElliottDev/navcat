import { useNow } from '../hooks/useNow'
import {
  DAY_NAMES,
  formatMinutes,
  openStatus,
  parseOpeningHours,
  todayIndex,
  type Span,
} from '../utils/openingHours'
import './OpeningHours.css'

const DAY = 24 * 60

function formatSpans(spans: Span[]): string {
  if (!spans.length) return 'Closed'
  return spans
    .map((span) =>
      span.close - span.open >= DAY
        ? 'Open 24 hours'
        : `${formatMinutes(span.open)} – ${formatMinutes(span.close)}`,
    )
    .join(', ')
}

/** "Open · until 4 pm", expanding to the week. Falls back to the raw text if it can't be read. */
export function OpeningHours({ value }: { value: string }) {
  const now = useNow()
  const week = parseOpeningHours(value)
  if (!week) return <>{value}</>

  const status = openStatus(week, now)
  const today = todayIndex(now)

  let when = ''
  if (status.open) when = status.until ? ` · until ${status.until}` : ' 24 hours'
  else if (status.opens) when = ` · opens ${status.opens}`

  return (
    <details className="hours">
      <summary className="hours__summary">
        <span className={status.open ? 'hours__open' : 'hours__closed'}>
          {status.open ? 'Open' : 'Closed'}
        </span>
        {when}
      </summary>
      <table className="hours__week">
        <tbody>
          {week.map((spans, day) => (
            <tr key={day} className={day === today ? 'hours__today' : undefined}>
              <th scope="row">{DAY_NAMES[day]}</th>
              <td>{formatSpans(spans)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
