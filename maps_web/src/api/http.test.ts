import { AxiosError, AxiosHeaders } from 'axios'
import { describe, expect, it } from 'vitest'
import { apiErrorMessage } from './http'

const failed = (data: unknown) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    data,
    status: 400,
    statusText: 'Bad Request',
    headers: {},
    config: { headers: new AxiosHeaders() },
  })

describe('apiErrorMessage', () => {
  it("shows the backend's explanation", () => {
    expect(apiErrorMessage(failed({ detail: 'That username is taken.' }), 'x')).toBe(
      'That username is taken.',
    )
  })

  it('shows the first validation error in plain words', () => {
    const detail = [{ msg: 'Value error, Websites need to start with http:// or https://' }]
    expect(apiErrorMessage(failed({ detail }), 'x')).toBe(
      'Websites need to start with http:// or https://',
    )
  })

  it('falls back when there is no explanation', () => {
    expect(apiErrorMessage(failed('<html>Bad gateway</html>'), 'Try again')).toBe('Try again')
    expect(apiErrorMessage(new Error('boom'), 'Try again')).toBe('Try again')
  })
})
