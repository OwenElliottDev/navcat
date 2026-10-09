import type { NewSavedPlace, Recent, RecentSearch, SavedPlace, User } from '../types'
import { http } from './http'

// Accounts, saved places and recent searches (maps_backend)

export async function getMe(): Promise<User | null> {
  const { data } = await http.get<{ user: User | null }>('/me')
  return data.user
}

export async function signUp(username: string, password: string): Promise<User> {
  const { data } = await http.post<User>('/auth/signup', { username, password })
  return data
}

export async function logIn(username: string, password: string): Promise<User> {
  const { data } = await http.post<User>('/auth/login', { username, password })
  return data
}

export async function logOut(): Promise<void> {
  // The backend only accepts JSON writes, so send an empty object rather than no body
  await http.post('/auth/logout', {})
}

export async function deleteAccount(): Promise<void> {
  await http.delete('/me')
}

export async function getSavedPlaces(): Promise<SavedPlace[]> {
  const { data } = await http.get<SavedPlace[]>('/me/places')
  return data
}

/** Saves a place. A new Home or Work replaces the old one. */
export async function savePlace(place: NewSavedPlace): Promise<SavedPlace> {
  const { data } = await http.post<SavedPlace>('/me/places', place)
  return data
}

export async function deleteSavedPlace(id: number): Promise<void> {
  await http.delete(`/me/places/${id}`)
}

export async function getRecents(): Promise<Recent[]> {
  const { data } = await http.get<Recent[]>('/me/recents')
  return data
}

/** Records searches (oldest first) and returns the updated list. */
export async function addRecents(searches: RecentSearch[]): Promise<Recent[]> {
  const { data } = await http.post<Recent[]>('/me/recents', searches)
  return data
}

export async function clearRecents(): Promise<void> {
  await http.delete('/me/recents')
}
