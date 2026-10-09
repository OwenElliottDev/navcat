/**
 * Reads the common forms of OSM's opening_hours, e.g.
 * "Mo-Fr 07:00-16:00; Sa-Su 08:00-16:00", "Mo,We 10:00-12:00,13:00-17:00; Su off", "24/7".
 * Anything fancier (months, public holidays, sunrise...) returns null so the raw text is
 * shown instead of a wrong answer. Public holiday rules ("PH off") are skipped.
 */

/** Minutes from midnight; `close` can pass 1440 for hours that run past midnight. */
export interface Span {
  open: number
  close: number
}

/** Opening spans for each day, Monday first. An empty day is closed. */
export type WeekHours = Span[][]

export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]
const DAY_CODES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const DAY_PART = '(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?'
const DAYS_PATTERN = new RegExp(`^${DAY_PART}(?:,${DAY_PART})*$`)
const SPAN_PATTERN = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/

/** "Mo-We,Fr" -> [0, 1, 2, 4] */
function parseDays(text: string): number[] {
  return text.split(',').flatMap((part) => {
    const [from, to = from] = part.split('-').map((code) => DAY_CODES.indexOf(code))
    const days = []
    // Ranges can wrap the week, e.g. "Fr-Mo"
    for (let day = from; ; day = (day + 1) % 7) {
      days.push(day)
      if (day === to) break
    }
    return days
  })
}

/** "07:00-16:00,18:00-02:00" -> spans, or null if any part isn't a plain time range */
function parseSpans(text: string): Span[] | null {
  const spans: Span[] = []
  for (const part of text.split(',')) {
    const match = SPAN_PATTERN.exec(part.trim())
    if (!match) return null
    const [, h1, m1, h2, m2] = match.map(Number)
    const open = h1 * 60 + m1
    let close = h2 * 60 + m2
    if (close <= open) close += 24 * 60 // runs past midnight
    spans.push({ open, close })
  }
  return spans
}

export function parseOpeningHours(value: string): WeekHours | null {
  const text = value.trim()
  if (text === '24/7') return Array.from({ length: 7 }, () => [{ open: 0, close: 24 * 60 }])

  const week: WeekHours = Array.from({ length: 7 }, () => [])
  const rules = text
    .split(';')
    .map((rule) => rule.trim())
    .filter(Boolean)
  if (!rules.length) return null

  for (const rule of rules) {
    if (/^PH\b/.test(rule)) continue

    const [first, ...rest] = rule.split(/\s+/)
    const hasDays = DAYS_PATTERN.test(first)
    const days = hasDays ? parseDays(first) : [0, 1, 2, 3, 4, 5, 6]
    const times = (hasDays ? rest : [first, ...rest]).join('')

    // Later rules replace earlier ones for the days they name
    if (times === 'off' || times === 'closed') {
      for (const day of days) week[day] = []
      continue
    }
    const spans = parseSpans(times)
    if (!spans) return null
    for (const day of days) week[day] = spans
  }
  return week
}

/** Monday = 0 */
const weekday = (date: Date) => (date.getDay() + 6) % 7
const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes()

/** "7 am", "4:30 pm", "midnight" */
export function formatMinutes(minutes: number): string {
  const inDay = minutes % (24 * 60)
  if (inDay === 0) return 'midnight'
  const hours = Math.floor(inDay / 60)
  const mins = inDay % 60
  const hour12 = hours % 12 || 12
  return `${hour12}${mins ? `:${String(mins).padStart(2, '0')}` : ''} ${hours < 12 ? 'am' : 'pm'}`
}

export type OpenStatus =
  { open: true; until: string | null } | { open: false; opens: string | null }

/** Whether it's open at `now`, and when that changes. */
export function openStatus(week: WeekHours, now: Date): OpenStatus {
  const today = weekday(now)
  const minute = minutesOf(now)
  const yesterday = (today + 6) % 7
  const DAY = 24 * 60

  // Open from a span today, or one from yesterday that runs past midnight
  const current =
    week[today].find((span) => span.open <= minute && minute < span.close) ??
    week[yesterday]
      .filter((span) => span.close > DAY && minute < span.close - DAY)
      .map((span) => ({ open: span.open - DAY, close: span.close - DAY }))[0]
  if (current) {
    const isAllDay = current.close - current.open >= DAY
    return { open: true, until: isAllDay ? null : formatMinutes(current.close) }
  }

  // Next opening within the week
  for (let ahead = 0; ahead < 7; ahead++) {
    const day = (today + ahead) % 7
    const next = week[day].find((span) => ahead > 0 || span.open > minute)
    if (next) {
      const when = ahead === 0 ? '' : ahead === 1 ? ' tomorrow' : ` ${DAY_NAMES[day].slice(0, 3)}`
      return { open: false, opens: `${formatMinutes(next.open)}${when}` }
    }
  }
  return { open: false, opens: null }
}

export function todayIndex(now: Date): number {
  return weekday(now)
}
