"""Downloads every SRTM elevation file in a bounding box that's missing or damaged.

Usage: elevation.py WEST,SOUTH,EAST,NORTH FOLDER

GraphHopper only downloads the files its roads pass through, and the terrain is built from the
same folder, so an unmapped area (e.g. the outback) became a square pit at sea level. Files get
GraphHopper's names and source, so it uses them too. srtm-names/ is GraphHopper's list of the
files that exist: cells not in it are all sea.
"""

import math
import sys
import threading
import time
import zipfile
from multiprocessing.pool import ThreadPool
from pathlib import Path

import pycurl

BASE_URL = "https://srtm.kurviger.de/SRTM3"  # refuses requests without a user agent it knows
NAMES = Path("/srtm-names")
HGT_SIZE = 1201 * 1201 * 2
# Set once a file fails every retry: the server is likely down, and retrying each of the
# remaining files would take about an hour for a whole country
gave_up = threading.Event()


def cell_name(lng: int, lat: int) -> str:
    return f"{'S' if lat < 0 else 'N'}{abs(lat):02d}{'W' if lng < 0 else 'E'}{abs(lng):03d}"


def available() -> dict[str, str]:
    """The file names (e.g. S38E145) that exist, and the area folder each is in."""
    areas = {}
    for listing in NAMES.glob("*.txt"):
        for line in listing.read_text().split():
            areas[line.split(".")[0]] = listing.stem
    if not areas:
        sys.exit(f"No SRTM file lists in {NAMES}")
    return areas


def is_valid(path: Path) -> bool:
    """Catches a download that was cut short, or an error page saved in place of the file."""
    try:
        with zipfile.ZipFile(path) as z:
            return [entry.file_size for entry in z.infolist()] == [HGT_SIZE]
    except (OSError, zipfile.BadZipFile):
        return False


def download(job: tuple[str, Path]) -> str | None:
    url, path = job
    if gave_up.is_set():
        return None
    partial = path.with_suffix(".tmp")
    curl = pycurl.Curl()
    curl.setopt(pycurl.URL, url)
    curl.setopt(pycurl.USERAGENT, "GraphHopper SRTMReader")
    curl.setopt(pycurl.FOLLOWLOCATION, True)
    curl.setopt(pycurl.FAILONERROR, True)
    curl.setopt(pycurl.LOW_SPEED_TIME, 60)
    curl.setopt(pycurl.LOW_SPEED_LIMIT, 1000)
    try:
        for attempt in range(5):
            time.sleep(2**attempt - 1)
            with open(partial, "wb") as f:
                curl.setopt(pycurl.WRITEDATA, f)
                try:
                    curl.perform()
                except pycurl.error as error:
                    problem = f"{url}: {error.args[-1]}"
                    continue
            if not is_valid(partial):
                problem = f"{url}: not an SRTM file"
                continue
            partial.rename(path)
            return None
    finally:
        curl.close()
    partial.unlink(missing_ok=True)
    gave_up.set()
    return problem


def main() -> None:
    bbox, folder = sys.argv[1:]
    west, south, east, north = (float(n) for n in bbox.split(","))
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    areas = available()

    if east < west:  # the box crosses the 180th meridian
        east += 360
    jobs = []
    for lat in range(math.floor(south), math.ceil(north)):
        for lng in range(math.floor(west), math.ceil(east)):
            name = cell_name((lng + 180) % 360 - 180, lat)
            path = folder / f"{name}.hgt.zip"
            if name in areas and not is_valid(path):
                jobs.append((f"{BASE_URL}/{areas[name]}/{name}.hgt.zip", path))

    if not jobs:
        print("All the elevation files for the area are here")
        return
    print(f"Downloading {len(jobs)} elevation files")
    with ThreadPool(8) as pool:
        problems = [p for p in pool.imap_unordered(download, jobs) if p]
    if problems:
        missing = sum(not is_valid(path) for _, path in jobs)
        sys.exit("\n".join(["Couldn't download:", *problems, f"Gave up with {missing} missing"]))
    print("Done")


if __name__ == "__main__":
    main()
