"""Prepares the downloaded GTFS feeds (gtfs-*.zip in the current folder) for OpenTripPlanner.

Writes streets.geojson, the area to cut the streets from: a few km around every stop, built from
grid cells so feeds a long way apart (Perth and Melbourne, or a regional coach line) don't pull in
everything between them.

OTP plans in one time zone. Its own fix for feeds in others (TimeZoneAdjusterModule) never runs in
2.10, as it checks for them before the feeds are loaded, so their trips come out hours off. Instead
each feed in another zone is rewritten here: its times shifted into the graph's zone by today's
difference, and its agencies moved to that zone. Zones that differ on daylight saving (QLD and WA
don't have it) are then an hour out for days after the next clock change, until the next rebuild.
Also writes build-config.json with the graph's time zone.
"""

import csv
import glob
import io
import json
import os
import zipfile
from collections import Counter, defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo

CELL = 0.05  # degrees, ~5 km; every stop's cell and its neighbours are kept


def rows(feed: zipfile.ZipFile, name: str):
    # skipinitialspace: some feeds (e.g. Transperth's) put a space after each comma
    return csv.DictReader(io.TextIOWrapper(feed.open(name), "utf-8-sig"), skipinitialspace=True)


cells = set()
zones = Counter()  # stops in each time zone
feed_zones = {}
for path in sorted(glob.glob("gtfs-*.zip")):
    with zipfile.ZipFile(path) as feed:
        zone = feed_zones[path] = next(rows(feed, "agency.txt"))["agency_timezone"].strip()
        for stop in rows(feed, "stops.txt"):
            if stop.get("stop_lat") and stop.get("stop_lon"):
                zones[zone] += 1
                x = int(float(stop["stop_lon"]) // CELL)
                y = int(float(stop["stop_lat"]) // CELL)
                cells.update((x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1))

# One rectangle per run of neighbouring cells in a row, so they don't overlap
cells_in_row = defaultdict(list)
for x, y in cells:
    cells_in_row[y].append(x)
polygons = []
for y in sorted(cells_in_row):
    xs = sorted(cells_in_row[y])
    start = prev = xs[0]
    for x in xs[1:] + [None]:
        if x != prev + 1:
            w, e, s, n = start * CELL, (prev + 1) * CELL, y * CELL, (y + 1) * CELL
            polygons.append([[[w, s], [e, s], [e, n], [w, n], [w, s]]])
            start = x
        prev = x

with open("streets.geojson", "w") as f:
    json.dump({"type": "MultiPolygon", "coordinates": polygons}, f)


def utc_offset(zone: str) -> int:
    """Seconds ahead of UTC today."""
    return int(datetime.now(ZoneInfo(zone)).utcoffset().total_seconds())


def shifted(time: str, seconds: int) -> str:
    """A GTFS time (H:MM:SS, may pass 24:00) moved later by some seconds."""
    if not time.strip():
        return time  # stops between timed ones may have none
    h, m, s = map(int, time.strip().split(":"))
    total = h * 3600 + m * 60 + s + seconds
    return f"{total // 3600:02d}:{total % 3600 // 60:02d}:{total % 60:02d}"


def rewrite(path: str, zone: str, seconds: int) -> None:
    """Moves a feed into another time zone, shifting its times by some seconds."""
    times = {
        "agency.txt": (),
        "stop_times.txt": ("arrival_time", "departure_time"),
        "frequencies.txt": ("start_time", "end_time"),
    }
    with (
        zipfile.ZipFile(path) as old,
        zipfile.ZipFile(path + ".new", "w", zipfile.ZIP_DEFLATED) as new,
    ):
        for name in old.namelist():
            if name not in times:
                new.writestr(old.getinfo(name), old.read(name))
                continue
            reader = rows(old, name)
            with new.open(name, "w") as raw, io.TextIOWrapper(raw, "utf-8", newline="") as out:
                writer = csv.DictWriter(out, reader.fieldnames, extrasaction="ignore")
                writer.writeheader()
                for row in reader:
                    if name == "agency.txt":
                        row["agency_timezone"] = zone
                    for field in times[name]:
                        if row.get(field) is not None:
                            row[field] = shifted(row[field], seconds)
                    writer.writerow(row)
    os.replace(path + ".new", path)


# The zone furthest ahead (so every shift is later and no trip moves to the day before), and of
# those the one with the most stops
zone = max(zones, key=lambda z: (utc_offset(z), zones[z]))
for path, feed_zone in feed_zones.items():
    if feed_zone != zone:
        seconds = utc_offset(zone) - utc_offset(feed_zone)
        print(f"Shifting {path} from {feed_zone} to {zone} (+{seconds // 60} min)")
        rewrite(path, zone, seconds)

with open("build-config.json", "w") as f:
    config = {
        "transitModelTimeZone": zone,
        "osmDefaults": {"timeZone": zone},  # for time-restricted streets
    }
    json.dump(config, f, indent=2)

print(f"{len(polygons)} street areas around the stops; time zone {zone} ({dict(zones)})")
