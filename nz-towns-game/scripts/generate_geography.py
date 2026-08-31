#!/usr/bin/env python3
"""
Builds data/geography.json — everything the map draws that is not a town.

Run from anywhere:
    python3 scripts/generate_geography.py

Three layers, all from Natural Earth 10m:

  coast    ne_10m_admin_0_countries, New Zealand feature
  regions  ne_10m_admin_1_states_provinces, the 16 mainland regions
  lakes    ne_10m_lakes, clipped to the mainland

The world game used Natural Earth 50m because it had to draw every continent.
A single country can afford 10m: the whole outline is ~4,100 points, a tenth of
the world file at five times the detail. At 50m the Marlborough Sounds,
Fiordland and Banks Peninsula all dissolve into smudges; at 10m they are
recognisable, which matters when the coastline is a landmark the player reasons
about.

Regions are the modern regional councils — the same 16 names towns.json tags
each town with, so a player reading "Ōtaki — Wellington" on a guess card can see
that boundary on the map. (Not the historical provinces, which were abolished in
1876 and whose borders would match nothing else in the game.)

Output is raw [lat, lng] rings, NOT pre-projected SVG paths. The projection
lives in ui/map.js alone, so the map's aspect ratio and framing can be retuned
by editing one JavaScript function instead of re-running this script.
"""
import json
import os
import urllib.request

BASE = ('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/'
        'master/geojson/')

SOURCES = {
    'coast':   'ne_10m_admin_0_countries.geojson',
    'regions': 'ne_10m_admin_1_states_provinces.geojson',
    'lakes':   'ne_10m_lakes.geojson',
}

# Mainland only. New Zealand's admin-0 geometry also carries the Chatham Islands
# (longitude -176, across the antimeridian) and the Kermadecs (latitude -29);
# admin-1 adds the Auckland, Campbell, Antipodes and Three Kings Islands and
# Tokelau. Including any of them stretches the frame so far that the mainland
# shrinks to a sliver, so all are dropped — as they are from towns.json.
LAT_MIN, LAT_MAX = -47.5, -34.0
LNG_MIN, LNG_MAX = 166.0, 179.5

# Rings smaller than this are rocks, sandbars and lake fragments — invisible
# once drawn and pure file weight. 8 points keeps Waiheke, Kapiti, D'Urville
# and Stewart Island, and drops the 4-point sliver Natural Earth carries as a
# second Lake Te Anau polygon.
MIN_RING_POINTS = 8

# Natural Earth names the unitary authorities by their legal titles. towns.json
# uses the short regional names, and the two have to agree for the borders to
# mean the same thing as the region on a guess card.
REGION_RENAMES = {
    'Marlborough District': 'Marlborough',
    'Nelson City':          'Nelson',
    'Gisborne District':    'Gisborne',
    'Tasman District':      'Tasman',
    'Manawatu-Wanganui':    'Manawatu-Whanganui',
}

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR   = os.path.join(SCRIPT_DIR, '..', 'data')
CACHE_DIR  = os.path.join(SCRIPT_DIR, '.cache')


def load(key):
    """Download the Natural Earth layer unless already cached."""
    name = SOURCES[key]
    path = os.path.join(CACHE_DIR, name)
    os.makedirs(CACHE_DIR, exist_ok=True)
    if not os.path.exists(path):
        print(f'  fetching {name}...')
        with urllib.request.urlopen(BASE + name, timeout=300) as resp, open(path, 'wb') as f:
            f.write(resp.read())
    else:
        print(f'  cached: {name}')
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def exterior_rings(geometry):
    """Every polygon's outer ring. NZ has no holes worth drawing."""
    if geometry['type'] == 'MultiPolygon':
        return [poly[0] for poly in geometry['coordinates']]
    if geometry['type'] == 'Polygon':
        return [geometry['coordinates'][0]]
    return []


def in_mainland(ring):
    lats = [p[1] for p in ring]
    lngs = [p[0] for p in ring]
    return (LAT_MIN < min(lats) and max(lats) < LAT_MAX
            and LNG_MIN < min(lngs) and max(lngs) < LNG_MAX)


def convert(ring):
    """GeoJSON is [lng, lat]; everything else in this project is [lat, lng].
    4 decimal places is ~11m on the ground, far below one screen pixel."""
    return [[round(p[1], 4), round(p[0], 4)] for p in ring]


def usable_rings(geometry):
    return [convert(r) for r in exterior_rings(geometry)
            if len(r) >= MIN_RING_POINTS and in_mainland(r)]


def main():
    print('Coastline...')
    countries = load('coast')
    feature = next(f for f in countries['features']
                   if f['properties'].get('ADMIN') == 'New Zealand')
    coast = usable_rings(feature['geometry'])
    coast.sort(key=len, reverse=True)
    print(f'  {len(coast)} rings, {sum(len(r) for r in coast)} points')

    print('Regions...')
    admin1 = load('regions')
    regions = []
    for f in admin1['features']:
        if f['properties'].get('admin') != 'New Zealand':
            continue
        # Natural Earth files uninhabited island groups (Three Kings, Antipodes,
        # The Snares) as admin-1 features with no authority type. Only the 16
        # bodies that actually govern territory are regions for our purposes.
        if f['properties'].get('type_en') not in ('Regional Council', 'Unitary Authority'):
            continue
        rings = usable_rings(f['geometry'])
        if not rings:
            continue  # offshore territory, dropped by the bounding box
        name = f['properties'].get('name') or '?'
        regions.append({'name': REGION_RENAMES.get(name, name), 'rings': rings})
    regions.sort(key=lambda r: r['name'])
    print(f'  {len(regions)} regions, '
          f'{sum(len(r) for x in regions for r in x["rings"])} points')
    for r in regions:
        print(f'    {r["name"]}')

    print('Lakes...')
    lake_data = load('lakes')
    lakes = []
    for f in lake_data['features']:
        lakes.extend(usable_rings(f['geometry']))
    lakes.sort(key=len, reverse=True)
    print(f'  {len(lakes)} lakes, {sum(len(r) for r in lakes)} points')

    all_pts = [p for r in coast for p in r]
    bounds = {
        'latMin': round(min(p[0] for p in all_pts), 4),
        'latMax': round(max(p[0] for p in all_pts), 4),
        'lngMin': round(min(p[1] for p in all_pts), 4),
        'lngMax': round(max(p[1] for p in all_pts), 4),
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    out = os.path.join(DATA_DIR, 'geography.json')
    with open(out, 'w') as f:
        json.dump({'bounds': bounds, 'coast': coast,
                   'regions': regions, 'lakes': lakes},
                  f, separators=(',', ':'))

    print(f'\nbounds: {bounds}')
    print(f'Written {os.path.getsize(out) / 1024:.0f}KB to {out}')


if __name__ == '__main__':
    main()
