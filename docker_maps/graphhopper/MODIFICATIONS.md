# Changes to GraphHopper

This image contains [GraphHopper](https://github.com/graphhopper/graphhopper), built from source
at commit `1cc4d7bfdea655166c0dc1dce25dec8524a3acc0`, and modified by Nav Cat. GraphHopper is
licensed under the Apache License, Version 2.0 (see `LICENSE.txt` and `NOTICE.md` next to this
file).

Nav Cat changed one file, with `traffic-signals.patch`:

- `core/src/main/java/com/graphhopper/routing/util/parsers/OSMCrossingParser.java`: the
  `crossing` encoded value also marks roads at junction traffic lights (`highway=traffic_signals`),
  not only crossings tagged `crossing:signals=yes`.

`traffic-signals.patch` is licensed under the Apache License, Version 2.0, like GraphHopper. The
rest of Nav Cat is licensed under the GNU Affero General Public License v3.0.
