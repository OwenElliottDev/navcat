import axios from 'axios'

/** All backends sit behind the same /api proxy (nginx, or Vite in development). */
export const http = axios.create({
  baseURL: '/api',
  // Repeat array params as `point=a&point=b`, which GraphHopper expects
  paramsSerializer: { indexes: null },
})

/** The backend's explanation of what went wrong, when it gave one. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err)) return fallback
  const detail = err.response?.data?.detail
  if (typeof detail === 'string') return detail
  // Validation errors come as a list; show the first in plain words
  const first = Array.isArray(detail) ? detail[0]?.msg : undefined
  return typeof first === 'string' ? first.replace(/^Value error, /, '') : fallback
}
