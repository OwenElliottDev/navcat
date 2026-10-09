import { describe, expect, it } from 'vitest'
import {
  formatMinutes,
  openStatus,
  parseOpeningHours,
  todayIndex,
  type WeekHours,
} from './openingHours'

/** A local time in the week of Monday 5 October 2026, so any time zone gets the same weekday */
const at = (day: 'Mo' | 'Tu' | 'We' | 'Th' | 'Fr' | 'Sa' | 'Su', hour: number, minute = 0) =>
  new Date(2026, 9, 5 + ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].indexOf(day), hour, minute)

const span = (open: string, close: string) => {
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  return { open: minutes(open), close: minutes(close) }
}

const week = (value: string): WeekHours => {
  const hours = parseOpeningHours(value)
  if (!hours) throw new Error(`Couldn't parse ${value}`)
  return hours
}

describe('parseOpeningHours', () => {
  it('reads day ranges and times', () => {
    const hours = week('Mo-Fr 07:00-16:00; Sa-Su 08:00-16:00')
    expect(hours.slice(0, 5)).toEqual(Array(5).fill([span('07:00', '16:00')]))
    expect(hours[5]).toEqual([span('08:00', '16:00')])
    expect(hours[6]).toEqual([span('08:00', '16:00')])
  })

  it('reads day lists, split shifts and days off', () => {
    const hours = week('Mo,We 10:00-12:00,13:00-17:00; Su off')
    expect(hours[0]).toEqual([span('10:00', '12:00'), span('13:00', '17:00')])
    expect(hours[1]).toEqual([])
    expect(hours[2]).toEqual(hours[0])
    expect(hours[6]).toEqual([])
  })

  it('wraps day ranges around the week', () => {
    const hours = week('Fr-Mo 09:00-17:00')
    expect(hours.map((day) => day.length)).toEqual([1, 0, 0, 0, 1, 1, 1])
  })

  it('lets later rules replace earlier ones', () => {
    const hours = week('Mo-Su 09:00-17:00; We closed; Sa 10:00-14:00')
    expect(hours[2]).toEqual([])
    expect(hours[5]).toEqual([span('10:00', '14:00')])
    expect(hours[6]).toEqual([span('09:00', '17:00')])
  })

  it('applies times without days to every day', () => {
    expect(week('09:00-17:00').every((day) => day.length === 1)).toBe(true)
  })

  it('runs spans that end before they start past midnight', () => {
    expect(week('Fr 18:00-02:00')[4]).toEqual([{ open: 18 * 60, close: 26 * 60 }])
  })

  it('reads 24/7 and skips public holiday rules', () => {
    expect(week('24/7')).toEqual(Array(7).fill([{ open: 0, close: 1440 }]))
    expect(week('Mo-Fr 09:00-17:00; PH off')[0]).toEqual([span('09:00', '17:00')])
  })

  it('gives up on forms it does not understand', () => {
    expect(parseOpeningHours('Mo-Fr sunrise-sunset')).toBeNull()
    expect(parseOpeningHours('Jan-Mar Mo 09:00-17:00')).toBeNull()
    expect(parseOpeningHours('by appointment')).toBeNull()
    expect(parseOpeningHours(' ; ')).toBeNull()
  })
})

describe('openStatus', () => {
  const weekdays = week('Mo-Fr 09:00-17:30; Sa 10:00-14:00')

  it('says when an open place closes', () => {
    expect(openStatus(weekdays, at('Mo', 12))).toEqual({ open: true, until: '5:30 pm' })
  })

  it('says when a closed place opens next', () => {
    expect(openStatus(weekdays, at('Mo', 8))).toEqual({ open: false, opens: '9 am' })
    expect(openStatus(weekdays, at('Mo', 17, 30))).toEqual({ open: false, opens: '9 am tomorrow' })
    expect(openStatus(weekdays, at('Sa', 15))).toEqual({ open: false, opens: '9 am Mon' })
  })

  it("counts yesterday's span that runs past midnight", () => {
    const late = week('Fr-Sa 18:00-02:00')
    expect(openStatus(late, at('Sa', 1))).toEqual({ open: true, until: '2 am' })
    expect(openStatus(late, at('Sa', 3))).toEqual({ open: false, opens: '6 pm' })
  })

  it('has no closing time when always open, and no opening when never', () => {
    expect(openStatus(week('24/7'), at('We', 3))).toEqual({ open: true, until: null })
    expect(openStatus(week('Mo-Su off'), at('We', 3))).toEqual({ open: false, opens: null })
  })
})

describe('formatMinutes', () => {
  it('reads like a clock', () => {
    expect(formatMinutes(0)).toBe('midnight')
    expect(formatMinutes(7 * 60)).toBe('7 am')
    expect(formatMinutes(12 * 60)).toBe('12 pm')
    expect(formatMinutes(16 * 60 + 5)).toBe('4:05 pm')
    expect(formatMinutes(24 * 60)).toBe('midnight')
    expect(formatMinutes(26 * 60)).toBe('2 am')
  })
})

describe('todayIndex', () => {
  it('starts the week on Monday', () => {
    expect(todayIndex(at('Mo', 9))).toBe(0)
    expect(todayIndex(at('Su', 9))).toBe(6)
  })
})
