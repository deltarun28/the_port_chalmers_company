#!/usr/bin/env python3
"""
Builds data/coastline.json — the outline the map is drawn from.

Run from anywhere:
    python3 scripts/generate_coastline.py

Source: Natural Earth 10m admin-0 countries, New Zealand feature only.

The world game used Natural Earth 50m because it had to draw every continent.
A single country can afford 10m: the whole NZ outline is ~4,100 points, which is
a tenth of the world file at five times the detail. At 50m the Marlborough
Sounds, Fiordland and Banks Peninsula all dissolve into smudges; at 10m they are
recognisable, which matters when the coastline is the only landmark a player has
to reason about.

Output is raw [lat, lng] rings, NOT a pre-projected SVG path. The projection
lives in ui/map.js alone, so the map's aspect ratio and framing can be retuned
by editing one JavaScript function instead of re-running this script.
"""
import json
import os
import urllib.request

URL = ('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/'
       'master/geojson/ne_10m_admin_0_countries.geojson')

# Mainland only. New Zealand's admin-0 geometry also carries the Chatham Islands
# (longitude -176, across the antimeridian) and the Kermadecs (latitude -29).
# Including either stretches the frame so far that the mainland shrinks to a
# sliver, so both are dropped — as they are from towns.json.
LAT_MIN, LAT_MAX = -47.5, -34.0
LNG_MIN, LNG_MAX = 166.0, 179.5

# Rings smaller than this are rocks and sandbars — invisible once drawn and
# pure file weight. 8 points keeps Waiheke, Kapiti, D'Urville and Stewart.
MIN_RING_POINTS = 8

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR   = os.path.join(SCRIPT_DIR, '..', 'data')
CACHE      = os.path.join(SCRIPT_DIR, '.cache', 'ne_10m_countries.geojson')


def load_geojson():
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    if not os.path.exists(CACHE):
        print(f'  fetching {URL.rsplit("/", 1)[-1]} (~13MB)...')
        with urllib.request.urlopen(URL, timeout=300) as resp, open(CACHE, 'wb') as f:
            f.write(resp.read())
    else:
        print('  cached: ne_10m_countries.geojson')
    with open(CACHE, encoding='utf-8') as f:
        return json.load(f)


def main():
    print('Loading Natural Earth 10m...')
    data = load_geojson()

    feature = next(f for f in data['features']
                   if f['properties'].get('ADMIN') == 'New Zealand')
    geom = feature['geometry']
    polygons = (geom['coordinates'] if geom['type'] == 'MultiPolygon'
                else [geom['coordinates']])

    rings = []
    for poly in polygons:
        ring = poly[0]  # exterior ring; NZ has no holes worth drawing
        if len(ring) < MIN_RING_POINTS:
            continue
        lats = [p[1] for p in ring]
        lngs = [p[0] for p in ring]
        if not (LAT_MIN < min(lats) and max(lats) < LAT_MAX
                and LNG_MIN < min(lngs) and max(lngs) < LNG_MAX):
            continue
        # GeoJSON is [lng, lat]; everything else in this project is [lat, lng].
        # 4 decimal places is ~11m on the ground — far below one screen pixel.
        rings.append([[round(p[1], 4), round(p[0], 4)] for p in ring])

    rings.sort(key=len, reverse=True)
    total = sum(len(r) for r in rings)

    all_pts = [p for r in rings for p in r]
    bounds = {
        'latMin': round(min(p[0] for p in all_pts), 4),
        'latMax': round(max(p[0] for p in all_pts), 4),
        'lngMin': round(min(p[1] for p in all_pts), 4),
        'lngMax': round(max(p[1] for p in all_pts), 4),
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    out = os.path.join(DATA_DIR, 'coastline.json')
    with open(out, 'w') as f:
        json.dump({'bounds': bounds, 'rings': rings}, f, separators=(',', ':'))

    size = os.path.getsize(out)
    print(f'\n{len(rings)} rings, {total} points')
    print(f'largest: {[len(r) for r in rings[:6]]}')
    print(f'bounds: {bounds}')
    print(f'Written {size / 1024:.0f}KB to {out}')


if __name__ == '__main__':
    main()
