import { describe, expect, it } from 'vitest'
import type { PhotonFeature, PoiDetails } from '../types'
import { describePlace, isSamePlace, placeRef, poiToPlace, toSnapshot, withDetails } from './places'

const feature = (properties: PhotonFeature['properties']): PhotonFeature => ({
  geometry: { coordinates: [144.96, -37.81] },
  properties,
})

const cafe = feature({
  name: 'Cafe Kure',
  housenumber: '12',
  street: 'Smith St',
  district: 'Fitzroy',
  city: 'Melbourne',
  state: 'Victoria',
  postcode: '3065',
  osm_type: 'N',
  osm_id: 42,
  osm_key: 'amenity',
  osm_value: 'cafe',
})

describe('describePlace', () => {
  it('names a business with its address and kind', () => {
    expect(describePlace(cafe)).toEqual({
      name: 'Cafe Kure',
      address: '12 Smith St, Fitzroy, Melbourne, Victoria, 3065',
      kind: 'Cafe',
    })
  })

  it('names an address by its street, without repeating it', () => {
    const house = feature({
      housenumber: '5',
      street: 'High St',
      city: 'Kew',
      osm_value: 'yes',
      type: 'house',
    })
    expect(describePlace(house)).toEqual({ name: '5 High St', address: 'Kew', kind: 'House' })
  })

  it('uses the place type for towns and suburbs', () => {
    const town = feature({
      name: 'Ballarat',
      state: 'Victoria',
      osm_key: 'place',
      osm_value: 'city',
      type: 'city',
    })
    expect(describePlace(town)).toMatchObject({
      name: 'Ballarat',
      address: 'Victoria',
      kind: 'City',
    })
    expect(describePlace(feature({})).name).toBe('Unnamed place')
  })
})

describe('snapshots', () => {
  it('keeps what is needed to find the place again', () => {
    expect(toSnapshot(cafe)).toEqual({
      name: 'Cafe Kure',
      address: '12 Smith St, Fitzroy, Melbourne, Victoria, 3065',
      lng: 144.96,
      lat: -37.81,
      osmType: 'N',
      osmId: 42,
    })
    expect(toSnapshot(feature({ name: 'Pin' }))).toMatchObject({ address: null, osmType: null })
  })

  it('matches the same OSM object, or else the same spot', () => {
    const a = { name: 'A', lng: 145, lat: -37.8, osmType: 'N' as const, osmId: 1 }
    expect(isSamePlace(a, { ...a, lng: 146 })).toBe(true)
    expect(isSamePlace(a, { ...a, osmId: 2 })).toBe(false)
    expect(
      isSamePlace({ name: 'A', lng: 145, lat: -37.8 }, { name: 'B', lng: 145.0001, lat: -37.8 }),
    ).toBe(true)
    expect(
      isSamePlace({ name: 'A', lng: 145, lat: -37.8 }, { name: 'B', lng: 145.01, lat: -37.8 }),
    ).toBe(false)
  })
})

describe('POIs as places', () => {
  const poi: PoiDetails = {
    osmType: 'O',
    osmId: 7,
    name: null,
    category: 'fast_food',
    lng: 145,
    lat: -37.8,
    tags: {
      'addr:housenumber': '1',
      'addr:street': 'Main Rd',
      'addr:suburb': 'Box Hill',
      phone: '123',
    },
  }

  it('shapes a browse result like a search result', () => {
    const place = poiToPlace(poi)
    expect(place.properties).toMatchObject({
      name: 'Fast food',
      housenumber: '1',
      street: 'Main Rd',
      locality: 'Box Hill',
      osm_type: 'O',
      osm_id: 7,
      osm_value: 'fast_food',
    })
    expect(placeRef(place)).toEqual({ type: 'O', id: 7 })
    expect(placeRef(feature({ name: 'Pin' }))).toBeNull()
  })

  it("applies people's corrections over search's details", () => {
    const corrected = withDetails(cafe, {
      ...poi,
      name: 'Cafe Kure (new)',
      tags: { 'addr:street': 'Brunswick St' },
    })
    expect(corrected.properties).toMatchObject({
      name: 'Cafe Kure (new)',
      street: 'Brunswick St',
      housenumber: '12',
      extra: { 'addr:street': 'Brunswick St' },
    })
    expect(withDetails(cafe, null)).toBe(cafe)
  })
})
