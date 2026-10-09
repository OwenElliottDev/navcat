// Photon search results and the backend's place details, around Melbourne's CBD.

export const FLINDERS_STREET = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [144.96706, -37.81827] },
  properties: {
    name: 'Flinders Street Station',
    street: 'Flinders Street',
    city: 'Melbourne',
    state: 'Victoria',
    postcode: '3000',
    osm_type: 'W',
    osm_id: 23075050,
    osm_key: 'railway',
    osm_value: 'station',
    type: 'house',
  },
}

export const VIC_MARKET = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [144.95679, -37.80762] },
  properties: {
    name: 'Queen Victoria Market',
    housenumber: '513',
    street: 'Elizabeth Street',
    city: 'Melbourne',
    state: 'Victoria',
    postcode: '3000',
    osm_type: 'W',
    osm_id: 25089834,
    osm_key: 'amenity',
    osm_value: 'marketplace',
    type: 'house',
  },
}

export const CAFE_ID = 1234567890

export const CAFE = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [144.9714, -37.8115] },
  properties: {
    name: 'Laneway Espresso',
    housenumber: '66',
    street: 'Bourke Street',
    city: 'Melbourne',
    state: 'Victoria',
    postcode: '3000',
    osm_type: 'N',
    osm_id: CAFE_ID,
    osm_key: 'amenity',
    osm_value: 'cafe',
    type: 'house',
  },
}

export const BRUNSWICK = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [144.9612, -37.7667] },
  properties: {
    name: 'Brunswick',
    city: 'Melbourne',
    state: 'Victoria',
    postcode: '3056',
    osm_type: 'R',
    osm_id: 2041256,
    osm_key: 'place',
    osm_value: 'suburb',
    type: 'district',
    extent: [144.9447, -37.7568, 144.9785, -37.7783],
  },
}

export const PHOTON_FEATURES = [FLINDERS_STREET, VIC_MARKET, CAFE, BRUNSWICK]

/** POIs the backend knows (pois table), keyed `${type}${id}`, as /api/places returns them. */
export const POI_DETAILS: Record<string, PoiDetailsFixture> = {
  [`N${CAFE_ID}`]: {
    osmType: 'N',
    osmId: CAFE_ID,
    name: 'Laneway Espresso',
    category: 'cafe',
    lng: 144.9714,
    lat: -37.8115,
    tags: {
      name: 'Laneway Espresso',
      amenity: 'cafe',
      'addr:housenumber': '66',
      'addr:street': 'Bourke Street',
      'addr:postcode': '3000',
      opening_hours: 'Mo-Fr 07:00-16:00; Sa-Su 08:00-15:00',
      phone: '+61 3 9000 0000',
      website: 'https://laneway.example',
      cuisine: 'coffee_shop',
    },
  },
  N2000000001: {
    osmType: 'N',
    osmId: 2000000001,
    name: 'Little Bourke Coffee',
    category: 'cafe',
    lng: 144.9661,
    lat: -37.8121,
    tags: { name: 'Little Bourke Coffee', amenity: 'cafe', 'addr:street': 'Little Bourke Street' },
  },
  N2000000002: {
    osmType: 'N',
    osmId: 2000000002,
    name: null,
    category: 'cafe',
    lng: 144.9632,
    lat: -37.8139,
    tags: { amenity: 'cafe' },
  },
}

export interface PoiDetailsFixture {
  osmType: string
  osmId: number
  name: string | null
  category: string
  lng: number
  lat: number
  tags: Record<string, string>
}

export interface ReviewFixture {
  id: number
  username: string
  rating: number
  body: string
  createdAt: string
  updatedAt: string
  mine: boolean
}

/** Reviews already written, by place key */
export function initialReviews(): Record<string, ReviewFixture[]> {
  return {
    [`N${CAFE_ID}`]: [
      {
        id: 1,
        username: 'alex',
        rating: 5,
        body: 'Best flat white in the lane.',
        createdAt: '2026-09-20T09:00:00+10:00',
        updatedAt: '2026-09-20T09:00:00+10:00',
        mine: false,
      },
      {
        id: 2,
        username: 'sam',
        rating: 4,
        body: 'Busy at lunch.',
        createdAt: '2026-08-02T12:30:00+10:00',
        updatedAt: '2026-08-02T12:30:00+10:00',
        mine: false,
      },
    ],
  }
}
