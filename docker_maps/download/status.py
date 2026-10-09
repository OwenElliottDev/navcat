"""Prints how old each piece of downloaded and built data is, for ./maps status.

Runs in the maps-data container, with the data folder at /data.
"""

import csv
import io
import json
import os
import subprocess
import time
import zipfile
from datetime import UTC, date, datetime
from pathlib import Path

import pycurl

DATA = Path("/data")
TIMETABLES_WARN_DAYS = 14


def age(path: Path) -> str:
    """When a file was last written, e.g. "2026-10-03 (5 days ago)"."""
    if not path.exists():
        return "missing"
    modified = path.stat().st_mtime
    days = int((time.time() - modified) // 86400)
    ago = "today" if days == 0 else "1 day ago" if days == 1 else f"{days} days ago"
    return f"{datetime.fromtimestamp(modified, UTC):%Y-%m-%d} ({ago})"


def osm_data_date(path: Path) -> str | None:
    """The date of the OSM data itself, from the extract's header (Geofabrik sets it)."""
    try:
        result = subprocess.run(
            [
                "osmium",
                "fileinfo",
                "--no-progress",
                "-g",
                "header.option.osmosis_replication_timestamp",
                str(path),
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return result.stdout.strip()[:10] or None
    except (OSError, subprocess.SubprocessError):
        return None


def timetable_dates(folder: Path) -> list[tuple[str, date, date]]:
    """Each downloaded GTFS feed's name, and the first and last days it has services on."""
    feeds = []
    for path in sorted(folder.glob("*gtfs*.zip")):
        days = []
        with zipfile.ZipFile(path) as feed:
            for row in gtfs_rows(feed, "calendar.txt"):
                days += [row["start_date"], row["end_date"]]
            for row in gtfs_rows(feed, "calendar_dates.txt"):
                if row.get("exception_type") == "1":  # a service added on that day
                    days.append(row["date"])
        # YYYYMMDD
        parsed = [date(int(d[:4]), int(d[4:6]), int(d[6:8])) for d in map(str.strip, days)]
        if parsed:
            feeds.append((path.name, min(parsed), max(parsed)))
    return feeds


def gtfs_rows(feed: zipfile.ZipFile, name: str):
    """The rows of one of a GTFS feed's files, or none if it doesn't have it."""
    if name not in feed.namelist():
        return []
    # skipinitialspace: some feeds (e.g. Transperth's) put a space after each comma
    return csv.DictReader(io.TextIOWrapper(feed.open(name), "utf-8-sig"), skipinitialspace=True)


def search_index_date() -> str:
    body = io.BytesIO()
    curl = pycurl.Curl()
    curl.setopt(pycurl.URL, "http://maps-photon:2322/status")
    curl.setopt(pycurl.WRITEDATA, body)
    curl.setopt(pycurl.TIMEOUT, 5)
    try:
        curl.perform()
        return json.loads(body.getvalue()).get("import_date", "?")[:10]
    except (pycurl.error, ValueError):
        return "search isn't running"
    finally:
        curl.close()


def main() -> None:
    osm_file = os.environ["OSM_FILE"]
    osm = DATA / "osm" / osm_file
    places = DATA / "osm" / (osm_file.removesuffix(".osm.pbf") + ".places.csv.gz")
    data_date = osm_data_date(osm) if osm.exists() else None

    rows = [
        ("Map data (OSM)", age(osm) + (f", data from {data_date}" if data_date else "")),
        ("Places (Overture)", age(places)),
        ("Map tiles", age(DATA / "tiles" / os.environ["TILES_FILE"])),
        ("Routing graph", age(DATA / "graphhopper" / "default-gh" / "properties.txt")),
        ("Search index", search_index_date()),
        ("Transit graph", age(DATA / "transit" / "graph.obj")),
    ]

    warning = None
    feeds = timetable_dates(DATA / "transit")
    if feeds:
        first = min(f for _, f, _ in feeds)
        # One feed (e.g. a small coach one in PTV's download) can run out long before the rest,
        # so name the first to run out rather than calling the whole timetable done
        name, _, last = min(feeds, key=lambda feed: feed[2])
        latest = max(last for _, _, last in feeds)
        if last == latest:
            rows.append(("Timetables", f"services from {first} to {last}"))
        else:
            rows.append(("Timetables", f"services from {first} to {latest}, {name} to {last}"))
        days_left = (last - datetime.now(UTC).date()).days
        if days_left < TIMETABLES_WARN_DAYS:
            what = "Timetables run" if last == latest else f"The {name} timetable runs"
            when = f"in {days_left} days" if days_left >= 0 else "already"
            warning = f"{what} out {when}: run ./maps update transit"
    else:
        rows.append(("Timetables", "missing"))

    width = max(len(label) for label, _ in rows)
    for label, value in rows:
        print(f"{label:<{width}}  {value}")
    if warning:
        print(f"\n{warning}")


if __name__ == "__main__":
    main()
