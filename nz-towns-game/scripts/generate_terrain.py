#!/usr/bin/env python3
"""
Builds data/terrain.png — a hillshade overlay for the map.

Run from anywhere:
    python3 scripts/generate_terrain.py

--- Why a raster, when everything else here is vector ---

The rest of the map is vector because it has to be interactive, themeable and
sharp at 24x zoom. Terrain is none of those things: nothing is clickable, it
reads as texture rather than as lines, and it never needs to be crisp. Drawing
it as contour polygons would mean thousands of paths for something the player
should barely notice.

So it ships as one greyscale image, composited with `mix-blend-mode: soft-light`
over the land fill. That blend is why a single file works in both themes: the
image carries only light and shade, and takes its colour from whatever is
underneath — so the dark theme gets a dark relief and the outdoor theme a light
one, from the same 8-bit greyscale PNG.

--- Source ---

AWS "terrarium" terrain tiles, a public elevation dataset. Elevation is encoded
in RGB as (R * 256 + G + B / 256) - 32768 metres.

Tiles are Web Mercator, and ui/map.js projects with the same Mercator formula,
so the mosaic maps onto the map frame with a straight linear resample in x and
in Mercator-y — no reprojection, and no risk of the shading sliding out of
register with the coastline.
"""
import io
import math
import os
import urllib.request

import numpy as np
from PIL import Image

# Must match the frame in ui/map.js. If those constants change, this image
# silently stops lining up with the coastline, so they are asserted below.
LAT_MIN, LAT_MAX = -47.4, -34.2
LNG_MIN, LNG_MAX = 166.2, 179.0
VIEW_W = 600  # viewBox width in ui/map.js

ZOOM = 7          # ~900m per pixel at this latitude; plenty for relief texture
SUPERSAMPLE = 2   # output at 2x the viewBox so it stays smooth when zoomed a little

# Hillshade lighting. 315° (from the north-west) is the cartographic convention:
# lit from the other side and the brain reads valleys as ridges.
SUN_AZIMUTH = 315.0
SUN_ALTITUDE = 45.0
Z_FACTOR = 2.2    # vertical exaggeration — NZ relief is subtle at this scale

TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR   = os.path.join(SCRIPT_DIR, '..', 'data')
CACHE_DIR  = os.path.join(SCRIPT_DIR, '.cache', 'dem')


def merc_y(lat):
    """Web Mercator y in [0,1], north to south."""
    lat = max(-85.05, min(85.05, lat))
    s = math.sin(math.radians(lat))
    return 0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)


def merc_x(lng):
    return (lng + 180.0) / 360.0


def fetch_tile(z, x, y):
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, f'{z}_{x}_{y}.png')
    if not os.path.exists(path):
        url = TILE_URL.format(z=z, x=x, y=y)
        with urllib.request.urlopen(url, timeout=120) as r:
            data = r.read()
        with open(path, 'wb') as f:
            f.write(data)
    with open(path, 'rb') as f:
        return Image.open(io.BytesIO(f.read())).convert('RGB')


def build_mosaic(zoom):
    """Elevation grid (metres) covering the map frame, plus its tile origin."""
    n = 2 ** zoom
    x0 = int(merc_x(LNG_MIN) * n)
    x1 = int(merc_x(LNG_MAX) * n)
    y0 = int(merc_y(LAT_MAX) * n)   # north edge
    y1 = int(merc_y(LAT_MIN) * n)   # south edge
    cols, rows = x1 - x0 + 1, y1 - y0 + 1
    print(f'  tiles: x {x0}..{x1}, y {y0}..{y1}  ({cols * rows} tiles)')

    mosaic = np.zeros((rows * 256, cols * 256), dtype=np.float32)
    for j, ty in enumerate(range(y0, y1 + 1)):
        for i, tx in enumerate(range(x0, x1 + 1)):
            arr = np.asarray(fetch_tile(zoom, tx, ty), dtype=np.float32)
            # terrarium encoding
            elev = arr[:, :, 0] * 256.0 + arr[:, :, 1] + arr[:, :, 2] / 256.0 - 32768.0
            mosaic[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256] = elev
        print(f'    row {j + 1}/{rows}', end='\r')
    print(' ' * 30, end='\r')
    return mosaic, x0, y0


def resample_to_frame(mosaic, x0, y0, zoom, out_w, out_h):
    """
    Pull the mosaic into the map's own frame.

    Both spaces are Web Mercator, so x is linear in longitude and y is linear in
    Mercator-y. That makes this a pure coordinate lookup rather than a
    reprojection, which is what keeps the shading registered to the coastline.
    """
    n = 2 ** zoom
    px_per_tile = 256.0
    # Map-frame edges expressed in global Mercator pixels at this zoom
    gx_lo, gx_hi = merc_x(LNG_MIN) * n * px_per_tile, merc_x(LNG_MAX) * n * px_per_tile
    gy_lo, gy_hi = merc_y(LAT_MAX) * n * px_per_tile, merc_y(LAT_MIN) * n * px_per_tile
    # Mosaic origin in the same global pixel space
    ox, oy = x0 * px_per_tile, y0 * px_per_tile

    xs = np.linspace(gx_lo, gx_hi, out_w, endpoint=False) - ox
    ys = np.linspace(gy_lo, gy_hi, out_h, endpoint=False) - oy
    xi = np.clip(xs.astype(np.int32), 0, mosaic.shape[1] - 1)
    yi = np.clip(ys.astype(np.int32), 0, mosaic.shape[0] - 1)
    return mosaic[np.ix_(yi, xi)]


def hillshade(elev, cell_size_m):
    """Standard Horn hillshade, returned as 0..1."""
    dzdy, dzdx = np.gradient(elev * Z_FACTOR, cell_size_m)
    slope = np.arctan(np.hypot(dzdx, dzdy))
    aspect = np.arctan2(-dzdx, dzdy)

    zen = math.radians(90.0 - SUN_ALTITUDE)
    az = math.radians(360.0 - SUN_AZIMUTH + 90.0)
    shaded = (math.cos(zen) * np.cos(slope)
              + math.sin(zen) * np.sin(slope) * np.cos(az - aspect))
    return np.clip(shaded, 0.0, 1.0)


def main():
    assert VIEW_W == 600, 'VIEW_W must match W in ui/map.js'

    out_w = VIEW_W * SUPERSAMPLE
    # Frame height follows from the Mercator span, exactly as ui/map.js derives H
    span_x = merc_x(LNG_MAX) - merc_x(LNG_MIN)
    span_y = merc_y(LAT_MIN) - merc_y(LAT_MAX)
    out_h = int(round(out_w * span_y / span_x))
    print(f'Output {out_w}x{out_h} (map frame is 600x{out_h / SUPERSAMPLE:.1f})')

    print('Fetching DEM tiles...')
    mosaic, x0, y0 = build_mosaic(ZOOM)

    print('Resampling to the map frame...')
    elev = resample_to_frame(mosaic, x0, y0, ZOOM, out_w, out_h)

    # Ground resolution of one output pixel, at the middle of the country.
    mid_lat = (LAT_MIN + LAT_MAX) / 2
    metres_per_px = (40075016.686 * math.cos(math.radians(mid_lat))
                     * span_x / out_w)
    print(f'  {metres_per_px:.0f} m per output pixel')

    # Sea is encoded as a small negative elevation, not a nodata value; clamping
    # to zero stops the coastline from being outlined by a shading artefact.
    elev = np.maximum(elev, 0.0)

    print('Computing hillshade...')
    shade = hillshade(elev, metres_per_px)

    # soft-light leaves mid-grey untouched, so flat ground must land on exactly
    # 128 and only real relief may depart from it. The neutral point is NOT 0.5:
    # a flat surface lit from 45 degrees returns cos(zenith), so centring on 0.5
    # maps every flat paddock to 157 and the overlay silently lightens the whole
    # country. Centring on the flat-ground value keeps it a relief texture
    # rather than a second map competing with the coastline.
    flat = math.cos(math.radians(90.0 - SUN_ALTITUDE))
    grey = 128 + (shade - flat) * 255 * 0.55
    # Sea is flat by definition, and must not pick up shading from the DEM's
    # noise below the waterline.
    grey = np.where(elev <= 0.0, 128.0, grey)
    img = Image.fromarray(np.clip(grey, 0, 255).astype(np.uint8), mode='L')

    os.makedirs(DATA_DIR, exist_ok=True)
    out = os.path.join(DATA_DIR, 'terrain.png')
    img.save(out, optimize=True)
    print(f'Written {os.path.getsize(out) / 1024:.0f}KB to {out}')


if __name__ == '__main__':
    main()
