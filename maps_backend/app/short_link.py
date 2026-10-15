# ref: https://github.com/openstreetmap/openstreetmap-website/blob/master/lib/short_link.rb
import math

ARRAY = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_~"

ARRAY_LKP: dict[str, int] = {}

for idx, c in enumerate(ARRAY):
    ARRAY_LKP[c] = idx


def _interleave_bits(x: int, y: int) -> int:
    c = 0
    for i in range(31, -1, -1):
        c = (c << 1) | ((x >> i) & 1)
        c = (c << 1) | ((y >> i) & 1)
    return c


def encode_osm_shortlink(lon: float, lat: float, z: int) -> str:
    """Encodes an OSM shotlink as per the spec in the OSM implementation

    Args:
        lon (float): longitude of the location
        lat (float): latitude of the location
        z (int): the zoom level

    Returns:
        str: an OSM shortlink for a map view
    """
    code = _interleave_bits(
        int((lon + 180.0) * 2**32 / 360.0),
        int((lat + 90.0) * 2**32 / 180.0),
    )

    result = ""
    for i in range(math.ceil((z + 8) / 3.0)):
        result += ARRAY[(code >> (58 - 6 * i)) & 0x3F]

    return result + "-" * ((z + 8) % 3)


def decode_osm_shortlink(shortlink: str) -> tuple[float, float, int]:
    """Decodes an OSM shotlink as per the spec in the OSM implementation

    Args:
        shortlink (str): An OSM shortlink

    Returns:
        tuple[float, float, int]: lon, lat, and zoom from the decoded link
    """
    x = 0
    y = 0
    z = 0
    z_offset = 0

    shortlink = shortlink.replace("@", "~")  # legacy shortlinks

    for c in shortlink:
        t = ARRAY_LKP.get(c)
        if t is None:
            z_offset -= 1
        else:
            for _ in range(3):
                x <<= 1
                if t & 32:
                    x |= 1
                t <<= 1
                y <<= 1
                if t & 32:
                    y |= 1
                t <<= 1
            z += 3

    shift = 32 - z
    x = x << shift if shift >= 0 else x >> -shift
    y = y << shift if shift >= 0 else y >> -shift

    return (((x * 360) / 2**32 - 180), ((y * 180) / 2**32) - 90, z - 8 - (z_offset % 3))
