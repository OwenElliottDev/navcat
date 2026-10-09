import type { LngLat, PhotonFeature, PlaceRef, PlaceSnapshot, PoiDetails, Waypoint } from '../types'
import { humanize } from './format'
import { isNear } from './geo'

export interface PlaceSummary {
  name: string
  address: string
  kind: string
}

export function describePlace(feature: PhotonFeature): PlaceSummary {
  const p = feature.properties
  const street = [p.housenumber, p.street].filter(Boolean).join(' ')
  const name = p.name || street || p.city || p.state || 'Unnamed place'

  const addressParts = [p.name ? street : '', p.district || p.locality, p.city, p.state, p.postcode]
  const address = [...new Set(addressParts.filter(Boolean))].join(', ')

  const isGeneric = p.osm_key === 'place' || p.osm_value === 'yes'
  const kind = humanize(isGeneric ? p.type : p.osm_value)

  return { name, address, kind }
}

export function placePosition(feature: PhotonFeature): LngLat {
  const [lng, lat] = feature.geometry.coordinates
  return { lng, lat }
}

export function toWaypoint(feature: PhotonFeature): Waypoint {
  return { position: placePosition(feature), label: describePlace(feature).name }
}

/** A minimal place for points that search knows nothing about. */
export function pointPlace(at: LngLat, name: string, kind?: string): PhotonFeature {
  return {
    geometry: { coordinates: [at.lng, at.lat] },
    properties: { name, osm_value: kind },
  }
}

/** What we store about a place in saved places and recent searches. */
export function toSnapshot(feature: PhotonFeature): PlaceSnapshot {
  const { name, address } = describePlace(feature)
  const { lng, lat } = placePosition(feature)
  const { osm_type, osm_id } = feature.properties
  return {
    name,
    address: address || null,
    lng,
    lat,
    osmType: osm_type ?? null,
    osmId: osm_id ?? null,
  }
}

export function snapshotToWaypoint(snapshot: PlaceSnapshot): Waypoint {
  return { position: { lng: snapshot.lng, lat: snapshot.lat }, label: snapshot.name }
}

/** True when two snapshots are the same place (same OSM object, or practically the same spot). */
export function isSamePlace(a: PlaceSnapshot, b: PlaceSnapshot): boolean {
  if (a.osmType && a.osmId && b.osmType && b.osmId)
    return a.osmType === b.osmType && a.osmId === b.osmId
  return isNear(a, b)
}

/** A browse result (or added place) in the same shape as a search result, for the place card. */
export function poiToPlace(poi: PoiDetails): PhotonFeature {
  const tags = poi.tags
  return {
    geometry: { coordinates: [poi.lng, poi.lat] },
    properties: {
      name: poi.name ?? humanize(poi.category),
      housenumber: tags['addr:housenumber'],
      street: tags['addr:street'],
      locality: tags['addr:suburb'],
      city: tags['addr:city'],
      postcode: tags['addr:postcode'],
      osm_type: poi.osmType,
      osm_id: poi.osmId,
      osm_value: poi.category,
      extra: tags,
    },
  }
}

/** How the backend identifies this place, if it can (OSM objects and places people added). */
export function placeRef(feature: PhotonFeature): PlaceRef | null {
  const { osm_type: type, osm_id: id } = feature.properties
  return type && id ? { type, id } : null
}

/** The place with its full details applied: corrected name and address, and every tag. */
export function withDetails(feature: PhotonFeature, details: PoiDetails | null): PhotonFeature {
  if (!details) return feature
  const tags = details.tags
  const p = feature.properties
  return {
    ...feature,
    properties: {
      ...p,
      name: details.name ?? p.name,
      housenumber: tags['addr:housenumber'] ?? p.housenumber,
      street: tags['addr:street'] ?? p.street,
      locality: tags['addr:suburb'] ?? p.locality,
      postcode: tags['addr:postcode'] ?? p.postcode,
      extra: tags,
    },
  }
}
