import type {
  Community,
  LngLat,
  NewPlace,
  Photo,
  PlaceChanges,
  PlaceRef,
  PoiDetails,
  Review,
} from '../types'
import { http } from './http'

// Place details, people's corrections and additions, reviews and photos (maps_backend)

const placePath = ({ type, id }: PlaceRef) => `/places/${type}/${id}`

/** One place with all its tags, including people's corrections. */
export async function getPlace(place: PlaceRef, signal?: AbortSignal): Promise<PoiDetails> {
  const { data } = await http.get<PoiDetails>(placePath(place), { signal })
  return data
}

export async function editPlace(place: PlaceRef, changes: PlaceChanges): Promise<PoiDetails> {
  const { data } = await http.patch<PoiDetails>(placePath(place), changes)
  return data
}

export async function addPlace(place: NewPlace): Promise<PoiDetails> {
  const { data } = await http.post<PoiDetails>('/places', place)
  return data
}

/** Places people added and places from Overture Maps, by name (Photon covers OSM's). */
export async function searchExtraPlaces(
  query: string,
  near: LngLat | null,
  signal?: AbortSignal,
): Promise<PoiDetails[]> {
  const { data } = await http.get<PoiDetails[]>('/places/search', {
    params: { q: query, ...(near && { near: `${near.lng.toFixed(5)},${near.lat.toFixed(5)}` }) },
    signal,
  })
  return data
}

export async function getCommunity(place: PlaceRef, signal?: AbortSignal): Promise<Community> {
  const { data } = await http.get<Community>(`${placePath(place)}/community`, { signal })
  return data
}

/** Writes your review, replacing your earlier one. */
export async function writeReview(place: PlaceRef, rating: number, body: string): Promise<Review> {
  const { data } = await http.put<Review>(`${placePath(place)}/review`, { rating, body })
  return data
}

export async function deleteReview(place: PlaceRef): Promise<void> {
  await http.delete(`${placePath(place)}/review`)
}

export async function uploadPhoto(place: PlaceRef, image: Blob): Promise<Photo> {
  const { data } = await http.post<Photo>(`${placePath(place)}/photos`, image, {
    headers: { 'Content-Type': image.type || 'image/jpeg' },
  })
  return data
}

export async function deletePhoto(id: number): Promise<void> {
  await http.delete(`/photos/${id}`)
}
