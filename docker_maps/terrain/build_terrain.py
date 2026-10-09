"""Builds terrain tiles for the topo map from local elevation data.

Reads SRTM files (.hgt, .hgt.zip or GeoTIFF) and writes Web Mercator PNG tiles in the
"terrarium" encoding MapLibre understands:

    <out>/tiles/{z}/{x}/{y}.png, <out>/tiles/empty.png (sea level), <out>/tiles/info.json

Tiles that are entirely sea are skipped; nginx serves empty.png for them. The new tiles are
written beside the old ones and swapped in at the end, so a re-run never leaves a half-built set.

Runs on every `docker compose up` but only builds when the elevation files have changed (set
FORCE=1 to build anyway). With WAIT_FOR set to a URL, it first waits for that to answer: the
compose file points it at GraphHopper's health check, as GraphHopper downloads the elevation.

Usage: python3 build_terrain.py <elevation dir> <output dir>
"""

import glob
import hashlib
import json
import math
import os
import re
import shutil
import sys
import time
import urllib.request
from multiprocessing import Pool

import numpy as np
from osgeo import gdal

gdal.UseExceptions()

# SRTM is ~90 m; z11 is ~60 m per pixel at these latitudes
MAX_ZOOM = int(os.environ.get("TERRAIN_MAX_ZOOM", "11"))
# Warp 4x4 tiles at a time: one 1024px warp beats sixteen small ones
BLOCK_ZOOM = MAX_ZOOM - 2
# Bump when the output changes, so existing terrain is rebuilt automatically
BUILD_VERSION = 3  # 2-3: fill SRTM voids
TILE = 256
WORLD = 20037508.342789244  # half the width of the Web Mercator world, in metres
NODATA = -32768


# ---------- tile maths ----------


def tile_bounds(z, x, y):
    """Web Mercator bounds (min x, min y, max x, max y) of a tile."""
    size = 2 * WORLD / 2**z
    return (
        -WORLD + x * size,
        WORLD - (y + 1) * size,
        -WORLD + (x + 1) * size,
        WORLD - y * size,
    )


def tile_lnglat_bounds(z, x, y):
    n = 2**z
    lat = lambda ty: math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * ty / n))))
    return (x / n * 360 - 180, lat(y + 1), (x + 1) / n * 360 - 180, lat(y))


def tile_at(z, lng, lat):
    n = 2**z
    lat = max(min(lat, 85.05), -85.05)
    x = int((lng + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return min(max(x, 0), n - 1), min(max(y, 0), n - 1)


# ---------- encoding ----------


def encode_terrarium(elevation):
    """Elevation in metres -> RGB, as (R*256 + G + B/256) - 32768."""
    value = elevation.astype(np.float64) + 32768
    r = np.floor(value / 256)
    g = np.floor(value) % 256
    b = np.floor((value - np.floor(value)) * 256)
    return np.stack([r, g, b]).clip(0, 255).astype(np.uint8)


def write_png(path, elevation):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    rgb = encode_terrarium(elevation)
    mem = gdal.GetDriverByName("MEM").Create("", TILE, TILE, 3, gdal.GDT_Byte)
    for band in range(3):
        mem.GetRasterBand(band + 1).WriteArray(rgb[band])
    gdal.GetDriverByName("PNG").CreateCopy(path, mem)


def halve(elevation):
    """Averages 2x2 pixels, e.g. 512px -> 256px for the next zoom out."""
    h, w = elevation.shape
    return elevation.reshape(h // 2, 2, w // 2, 2).mean(axis=(1, 3))


# ---------- warping ----------


def warp(vrt, bounds, size, resampling="bilinear"):
    """Elevation for a Web Mercator box, with missing data (sea, voids) as 0."""
    dataset = gdal.Warp(
        "",
        vrt,
        format="MEM",
        dstSRS="EPSG:3857",
        outputBounds=bounds,
        width=size,
        height=size,
        resampleAlg=resampling,
        srcNodata=NODATA,
        dstNodata=NODATA,
    )
    elevation = dataset.GetRasterBand(1).ReadAsArray().astype(np.float32)
    elevation[elevation == NODATA] = 0
    return elevation


def write_tiles(out, z, x0, y0, elevation):
    """Cuts a block of elevation into tiles at zoom z, skipping all-sea tiles."""
    count = elevation.shape[0] // TILE
    written = 0
    for dy in range(count):
        for dx in range(count):
            tile = elevation[dy * TILE : (dy + 1) * TILE, dx * TILE : (dx + 1) * TILE]
            if np.any(tile):
                write_png(f"{out}/{z}/{x0 + dx}/{y0 + dy}.png", tile)
                written += 1
    return written


def build_block(job):
    """One BLOCK_ZOOM tile: warp at full detail, then write it at MAX_ZOOM and the zooms between."""
    vrt, out, x, y = job
    size = TILE * 2 ** (MAX_ZOOM - BLOCK_ZOOM)
    elevation = warp(vrt, tile_bounds(BLOCK_ZOOM, x, y), size)
    if not np.any(elevation):
        return 0
    written = 0
    for z in range(MAX_ZOOM, BLOCK_ZOOM - 1, -1):
        scale = 2 ** (z - BLOCK_ZOOM)
        written += write_tiles(out, z, x * scale, y * scale, elevation)
        if z > BLOCK_ZOOM:
            elevation = halve(elevation)
    return written


def build_overview_tile(job):
    """A tile below BLOCK_ZOOM, averaged straight from the source data."""
    vrt, out, z, x, y = job
    elevation = warp(vrt, tile_bounds(z, x, y), TILE, resampling="average")
    return write_tiles(out, z, x, y, elevation)


def tiles_with_data(cells, z, west, south, east, north):
    x0, y0 = tile_at(z, west, north)
    x1, y1 = tile_at(z, east, south)
    return [
        (x, y)
        for x in range(x0, x1 + 1)
        for y in range(y0, y1 + 1)
        if block_has_data(cells, z, x, y)
    ]


# ---------- main ----------


def fill_voids(job):
    """Fills an SRTM file's voids by interpolating from the surrounding heights.

    SRTM has gaps ("voids", mostly on steep slopes) marked as no data. Left alone they'd
    become sea level: square pits in the middle of ranges. The sea itself is stored as 0,
    not as a void, so this only ever fills land.

    Every file is copied, voids or not, so all the inputs to the VRT match: GDAL skips
    files whose format details differ (e.g. GeoTIFF "gray" vs .hgt "undefined").
    Returns the copy's path.
    """
    source, filled_dir = job
    copy = gdal.GetDriverByName("MEM").CreateCopy("", gdal.Open(source))
    band = copy.GetRasterBand(1)
    if np.any(band.ReadAsArray() == NODATA):
        # Search across the whole file, so even large voids get filled
        size = max(copy.RasterXSize, copy.RasterYSize)
        gdal.FillNodata(band, None, maxSearchDist=size, smoothingIterations=1)
    name = os.path.basename(source).split(".")[0]
    path = f"{filled_dir}/{name}.tif"
    gdal.GetDriverByName("GTiff").CreateCopy(path, copy, options=["COMPRESS=DEFLATE"])
    return path


def find_sources(folder):
    """Elevation files, as paths GDAL can open (zipped .hgt is read in place)."""
    sources = []
    for path in sorted(glob.glob(f"{folder}/*")):
        name = os.path.basename(path)
        if name.endswith(".hgt.zip"):
            sources.append(f"/vsizip/{path}/{name[:-4]}")
        elif name.endswith((".hgt", ".tif", ".tiff")):
            sources.append(path)
    return sources


def covered_cells(sources):
    """1x1 degree cells with data, from SRTM names like S38E145, to skip empty blocks fast."""
    cells = set()
    for source in sources:
        match = re.search(r"([NS])(\d{2})([EW])(\d{3})", os.path.basename(source))
        if match:
            lat = int(match[2]) * (1 if match[1] == "N" else -1)
            lng = int(match[4]) * (1 if match[3] == "E" else -1)
            cells.add((lng, lat))
    return cells


def block_has_data(cells, z, x, y):
    if not cells:
        return True  # not SRTM-named: let the warp decide
    west, south, east, north = tile_lnglat_bounds(z, x, y)
    return any(
        (lng, lat) in cells
        for lng in range(math.floor(west), math.ceil(east))
        for lat in range(math.floor(south), math.ceil(north))
    )


def wait_for(url):
    """Waits until `url` answers OK, e.g. GraphHopper finishing its import."""
    print(f"Waiting for {url}")
    while True:
        try:
            with urllib.request.urlopen(url, timeout=5) as response:
                if response.status == 200:
                    return
        except OSError:
            pass
        time.sleep(30)


def fingerprint(source_dir):
    """Changes whenever an elevation file is added, removed or replaced."""
    files = sorted(glob.glob(f"{source_dir}/*"))
    listing = "\n".join(f"{os.path.basename(f)} {os.path.getsize(f)}" for f in files)
    return hashlib.sha256(f"{BUILD_VERSION} {MAX_ZOOM}\n{listing}".encode()).hexdigest()


def is_up_to_date(out_dir, source):
    try:
        with open(f"{out_dir}/tiles/info.json") as f:
            return json.load(f).get("source") == source
    except (OSError, ValueError):
        return False


def main(source_dir, out_dir):
    if os.environ.get("WAIT_FOR"):
        wait_for(os.environ["WAIT_FOR"])

    source = fingerprint(source_dir)
    if is_up_to_date(out_dir, source) and os.environ.get("FORCE") != "1":
        print("Terrain is up to date with the elevation data")
        return

    started = time.time()
    sources = find_sources(source_dir)
    if not sources:
        sys.exit(
            f"No elevation files (.hgt, .hgt.zip, .tif) in {source_dir}. Has GraphHopper imported yet?"
        )
    print(f"Building terrain from {len(sources)} elevation files, up to zoom {MAX_ZOOM}")

    building = f"{out_dir}/tiles.building"
    shutil.rmtree(building, ignore_errors=True)
    os.makedirs(building)

    filled_dir = f"{building}/filled"
    os.makedirs(filled_dir)
    with Pool() as pool:
        sources = pool.map(fill_voids, [(source, filled_dir) for source in sources])

    vrt = f"{building}/elevation.vrt"
    gdal.BuildVRT(vrt, sources, srcNodata=NODATA, VRTNodata=NODATA)
    west, step_x, _, north, _, step_y = gdal.Open(vrt).GetGeoTransform()
    size_x, size_y = gdal.Open(vrt).RasterXSize, gdal.Open(vrt).RasterYSize
    east, south = west + size_x * step_x, north + size_y * step_y

    cells = covered_cells(sources)
    area = (west, south, east, north)

    # Full detail: one warp per block, written at several zooms
    blocks = [(vrt, building, x, y) for x, y in tiles_with_data(cells, BLOCK_ZOOM, *area)]
    # Zoomed out: a warp per tile, averaging the source (few tiles, each covering a lot)
    overviews = [
        (vrt, building, z, x, y)
        for z in range(BLOCK_ZOOM)
        for x, y in tiles_with_data(cells, z, *area)
    ]
    print(
        f"{len(blocks)} blocks for zooms {BLOCK_ZOOM}-{MAX_ZOOM}, {len(overviews)} tiles below, on {os.cpu_count()} cores"
    )
    with Pool() as pool:
        written = sum(pool.imap_unordered(build_block, blocks, chunksize=4))
        written += sum(pool.imap_unordered(build_overview_tile, overviews))

    write_png(f"{building}/empty.png", np.zeros((TILE, TILE)))
    with open(f"{building}/info.json", "w") as f:
        json.dump(
            {
                "maxzoom": MAX_ZOOM,
                "bounds": [west, south, east, north],
                "tiles": written,
                "source": source,  # lets the next run skip if nothing has changed
            },
            f,
        )
    os.remove(vrt)
    shutil.rmtree(filled_dir)

    # Swap the new tiles in
    final = f"{out_dir}/tiles"
    shutil.rmtree(f"{final}.old", ignore_errors=True)
    if os.path.exists(final):
        os.rename(final, f"{final}.old")
    os.rename(building, final)
    shutil.rmtree(f"{final}.old", ignore_errors=True)
    print(f"Wrote {written} tiles in {time.time() - started:.0f}s")


if __name__ == "__main__":
    main(sys.argv[1].rstrip("/"), sys.argv[2].rstrip("/"))
