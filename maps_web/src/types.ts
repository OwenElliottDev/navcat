export interface LngLat {
  lng: number
  lat: number
}

/** One end of a route: where it is and what to call it. */
export interface Waypoint {
  position: LngLat
  label: string
}

export type End = 'from' | 'to'

/** OSM node, way or relation, U for a place a user added, or O for one from Overture Maps */
export type PlaceType = 'N' | 'W' | 'R' | 'U' | 'O'

/** Identifies a place for details, edits, reviews and photos */
export interface PlaceRef {
  type: PlaceType
  id: number
}

/** [west, south, east, north] */
export type Bounds = [number, number, number, number]

/** A search result from Photon (GeoJSON feature). */
export interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: {
    name?: string
    housenumber?: string
    street?: string
    district?: string
    locality?: string
    city?: string
    state?: string
    postcode?: string
    /** N/W/R from OSM, U for a place someone added here, or O from Overture Maps */
    osm_type?: PlaceType
    osm_id?: number
    osm_key?: string
    osm_value?: string
    type?: string
    /** [minLon, maxLat, maxLon, minLat] */
    extent?: [number, number, number, number]
    extra?: Record<string, string>
  }
}

/** [longitude, latitude], plus elevation in metres when the route has it */
export type Position = [lng: number, lat: number, elevation?: number]

export interface LineString {
  type: 'LineString'
  coordinates: Position[]
}

export interface Instruction {
  text: string
  distance: number
  /** Milliseconds */
  time: number
  sign: number
  interval: [number, number]
}

/** A route from GraphHopper. */
export interface RoutePath {
  distance: number
  time: number
  /** Total climb and descent in metres */
  ascend?: number
  descend?: number
  /** [west, south, east, north] */
  bbox: [number, number, number, number]
  points: LineString
  instructions: Instruction[]
  /** [from point, to point, value] stretches, for the details asked for */
  details?: { osm_way_id?: [number, number, number][] }
}

/** One line drawn on the map for a route or journey. */
export interface RouteSegment {
  geometry: LineString
  color: string
  /** Drawn dotted. */
  walking?: boolean
}

/** One turn on a walk to or from a stop (from OpenTripPlanner). */
export interface TransitStep {
  /** LEFT, SLIGHTLY_RIGHT, CONTINUE, DEPART, CIRCLE_CLOCKWISE, ... */
  relativeDirection: string
  /** NORTH, SOUTHEAST, ... */
  absoluteDirection: string | null
  /** null for unnamed paths and footways */
  streetName: string | null
  /** Metres to the next step */
  distance: number
  at: LngLat
  /** Roundabout exit number */
  exit: string | null
}

/** One part of a public transport journey: a walk, or a ride on one vehicle. */
export interface TransitLeg {
  /** WALK, BUS, TRAM, RAIL, ... */
  mode: string
  isTransit: boolean
  /** ISO date-times */
  start: string
  end: string
  /** Seconds */
  duration: number
  /** Metres */
  distance: number
  from: string
  to: string
  headsign?: string
  route?: { name: string; color?: string; textColor?: string }
  geometry: LineString
  /** Turn-by-turn for walks; empty for rides */
  steps: TransitStep[]
}

/** When to travel by public transport: leave at a time, or arrive by one. */
export interface TripTime {
  type: 'departAt' | 'arriveBy'
  /** Local time as a datetime-local string, e.g. "2026-10-04T08:30" */
  time: string
}

/** A public transport journey option. */
export interface Itinerary {
  start: string
  end: string
  /** Seconds */
  duration: number
  legs: TransitLeg[]
}

// ---------- accounts ----------

export interface User {
  id: number
  username: string
}

/** A place as the user saw it, stored with their account. */
export interface PlaceSnapshot {
  name: string
  address?: string | null
  lng: number
  lat: number
  osmType?: PlaceType | null
  osmId?: number | null
}

export type SavedPlaceKind = 'home' | 'work' | 'favourite'

export interface NewSavedPlace extends PlaceSnapshot {
  kind: SavedPlaceKind
  label: string
}

export interface SavedPlace extends NewSavedPlace {
  id: number
}

/** A place the user picked, or a category they browsed. */
export interface RecentSearch {
  query: string
  category?: string | null
  place?: PlaceSnapshot | null
}

export interface Recent extends RecentSearch {
  searchedAt: string
}

// ---------- browse ----------

export interface Category {
  id: string
  label: string
  words: string[]
  /** What's stored for places in this category; the first is used for new places */
  osmValues: string[]
}

/** A place with all its tags (hours, phone, website...), including people's corrections. */
export interface PoiDetails {
  osmType: PlaceType
  osmId: number
  name: string | null
  /** The OSM tag value, e.g. "cafe" */
  category: string
  lng: number
  lat: number
  tags: Record<string, string>
}

/** A browse result */
export interface Poi extends PoiDetails {
  /** Metres from where the search was centred */
  distance: number
}

export interface BrowseResults {
  results: Poi[]
  /** More matched than were returned */
  truncated: boolean
}

// ---------- what people add ----------

/** Corrections to a place. A tag set to "" removes it. */
export interface PlaceChanges {
  name?: string
  /** Only for places people added */
  category?: string
  tags?: Record<string, string>
}

export interface NewPlace {
  name: string
  category: string
  lng: number
  lat: number
  tags: Record<string, string>
}

export interface Review {
  id: number
  username: string
  rating: number
  body: string
  createdAt: string
  updatedAt: string
  mine: boolean
}

export interface Photo {
  id: number
  username: string
  url: string
  thumbUrl: string
  width: number
  height: number
  createdAt: string
  mine: boolean
}

/** What this instance's users have said about a place */
export interface Community {
  rating: number | null
  reviewCount: number
  reviews: Review[]
  photos: Photo[]
}
