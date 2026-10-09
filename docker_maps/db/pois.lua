-- osm2pgsql flex style: one point per place people might browse for ("cafes near here"), and
-- the roads that say which way each lane goes, for lane guidance while navigating.
-- Writes to pois_import and turn_lanes_import; import-pois.sh swaps them in as pois and
-- turn_lanes when the import finishes.

local pois = osm2pgsql.define_table({
    name = 'pois_import',
    ids = { type = 'any', type_column = 'osm_type', id_column = 'osm_id' },
    columns = {
        { column = 'name', type = 'text' },
        { column = 'category', type = 'text', not_null = true },
        { column = 'tags', type = 'jsonb', not_null = true },
        { column = 'geom', type = 'point', projection = 4326, not_null = true },
    },
    -- Indexed by import-pois.sh once Overture's places have been added, which is quicker
    -- than keeping an index up to date while they go in
    indexes = {},
    cluster = 'no',
})

-- Roads with turn:lanes tags, e.g. "left|through|through;right" (lanes from left to right in
-- the direction of travel). The backend (routes/lanes.py) picks the direction a route uses.
local turn_lanes = osm2pgsql.define_table({
    name = 'turn_lanes_import',
    ids = { type = 'way', id_column = 'way_id' },
    columns = {
        { column = 'lanes', type = 'text' }, -- turn:lanes, for one-way roads
        { column = 'forward', type = 'text' }, -- turn:lanes:forward and :backward, for two-way
        { column = 'backward', type = 'text' },
        -- 'yes' or '-1' (one-way against the way's direction); motorways and roundabouts
        -- are one-way without saying so
        { column = 'oneway', type = 'text' },
        { column = 'geom', type = 'linestring', projection = 4326, not_null = true },
    },
    indexes = {},
    cluster = 'no',
})

local IMPLIED_ONEWAY = { motorway = true, roundabout = true, circular = true }

local function add_turn_lanes(object)
    local tags = object.tags
    local lanes, forward, backward =
        tags['turn:lanes'], tags['turn:lanes:forward'], tags['turn:lanes:backward']
    if not (lanes or forward or backward) then return end

    local oneway = tags.oneway
    if oneway == 'true' or oneway == '1' then oneway = 'yes' end
    if not oneway and (IMPLIED_ONEWAY[tags.highway] or IMPLIED_ONEWAY[tags.junction]) then
        oneway = 'yes'
    end

    turn_lanes:insert({
        lanes = lanes,
        forward = forward,
        backward = backward,
        oneway = oneway,
        geom = object:as_linestring(),
    })
end

-- Tags that say what a place is, most specific first. import-pois.sh's osmium filter keeps only
-- objects with one of these, so change it too.
local CATEGORY_KEYS = { 'amenity', 'shop', 'tourism', 'leisure', 'healthcare', 'office', 'craft', 'historic' }

-- Useful even without a name (most toilets, ATMs and chargers don't have one)
local KEEP_UNNAMED = {
    atm = true,
    toilets = true,
    drinking_water = true,
    charging_station = true,
    fuel = true,
    playground = true,
}

local function category_of(tags)
    for _, key in ipairs(CATEGORY_KEYS) do
        local value = tags[key]
        if value and value ~= 'yes' and value ~= 'no' then
            return value
        end
    end
    return nil
end

-- `make_geom` makes the point, only once we know the object is wanted: working out a point
-- inside an area is the slowest part of the import.
local function add(object, make_geom)
    local category = category_of(object.tags)
    if not category then return end
    if not object.tags.name and not KEEP_UNNAMED[category] then return end
    local geom = make_geom()
    if not geom then return end

    pois:insert({
        name = object.tags.name,
        category = category,
        tags = object.tags,
        geom = geom,
    })
end

-- A point inside an area. Unlike a centroid, it can't fall outside an L-shaped building.
-- For multipolygons (e.g. a park in several pieces) it uses the largest piece.
local function point_inside(area)
    if area:is_null() then return nil end
    if area:geometry_type() == 'MULTIPOLYGON' then
        local largest, largest_size
        for i = 1, area:num_geometries() do
            local part = area:geometry_n(i)
            local size = part:area()
            if not largest or size > largest_size then
                largest, largest_size = part, size
            end
        end
        area = largest
    end
    return area:pole_of_inaccessibility()
end

function osm2pgsql.process_node(object)
    add(object, function() return object:as_point() end)
end

function osm2pgsql.process_way(object)
    if object.tags.highway then add_turn_lanes(object) end
    -- Shops, parks and car parks mapped as areas; skip lines like roads
    if object.is_closed then
        add(object, function() return point_inside(object:as_polygon()) end)
    end
end

function osm2pgsql.process_relation(object)
    if object.tags.type == 'multipolygon' then
        add(object, function() return point_inside(object:as_multipolygon()) end)
    end
end
