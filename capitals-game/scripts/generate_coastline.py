#!/usr/bin/env python3
"""
Fetches Natural Earth 50m land + lakes GeoJSON and outputs:
  data/coastline.js       — SVG path string (Mercator, 800x400) — legacy, unused
  data/land_polygons.json — raw lat/lng polygon arrays for globe rendering
                            {"land": [[...]], "lake": [[...]]}
                            Fetched at runtime by map.js (not a static import).
"""
import urllib.request
import json
import math
import os

W = 800
H = 400

def project(lng, lat):
    x = (lng + 180) / 360 * W
    lat = max(-85.05, min(85.05, lat))
    lat_rad = lat * math.pi / 180
    merc_n = math.log(math.tan(math.pi / 4 + lat_rad / 2))
    y = H / 2 - (W * merc_n) / (2 * math.pi)
    return round(x, 2), round(y, 2)

def ring_to_path(ring):
    if len(ring) < 3:
        return ''
    pts = [project(coord[0], coord[1]) for coord in ring]
    d = f'M{pts[0][0]},{pts[0][1]}'
    for x, y in pts[1:]:
        d += f'L{x},{y}'
    d += 'Z'
    return d

def ring_to_latlng(ring):
    coords = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    return [[round(c[1], 1), round(c[0], 1)] for c in coords]

def fetch_polygons(url, min_pts=3):
    print(f'Fetching {url} ...')
    with urllib.request.urlopen(url, timeout=60) as resp:
        data = json.load(resp)
    polys = []
    for feature in data['features']:
        geom = feature['geometry']
        if geom['type'] == 'Polygon':
            ring = geom['coordinates'][0]
            if len(ring) >= min_pts:
                polys.append(ring_to_latlng(ring))
        elif geom['type'] == 'MultiPolygon':
            for poly in geom['coordinates']:
                ring = poly[0]
                if len(ring) >= min_pts:
                    polys.append(ring_to_latlng(ring))
    return polys

BASE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson'
MIN_LAND_PTS  = 20   # skip tiny islands — keeps continents, large islands, NZ
MIN_LAKE_PTS  = 50   # keeps only major lakes: Caspian, Great Lakes, Victoria etc.

land_data_url = f'{BASE_URL}/ne_50m_land.geojson'
print(f'Fetching {land_data_url} ...')
with urllib.request.urlopen(land_data_url, timeout=60) as resp:
    land_data = json.load(resp)

paths = []
land_polygons = []
for feature in land_data['features']:
    geom = feature['geometry']
    if geom['type'] == 'Polygon':
        ring = geom['coordinates'][0]
        if len(ring) < MIN_LAND_PTS:
            continue
        p = ring_to_path(ring)
        if p:
            paths.append(p)
            land_polygons.append(ring_to_latlng(ring))
    elif geom['type'] == 'MultiPolygon':
        for poly in geom['coordinates']:
            ring = poly[0]
            if len(ring) < MIN_LAND_PTS:
                continue
            p = ring_to_path(ring)
            if p:
                paths.append(p)
                land_polygons.append(ring_to_latlng(ring))

lake_polygons = fetch_polygons(f'{BASE_URL}/ne_50m_lakes.geojson', min_pts=MIN_LAKE_PTS)

combined = ' '.join(paths)
print(f'Land: {len(land_polygons)} polygons, Lakes: {len(lake_polygons)} polygons')

base = os.path.join(os.path.dirname(__file__), '..', 'data')

out_svg = os.path.join(base, 'coastline.js')
with open(out_svg, 'w') as f:
    f.write(f'export const COASTLINE = `{combined}`;\n')
print(f'Written to {out_svg}')

out_poly = os.path.join(base, 'land_polygons.json')
with open(out_poly, 'w') as f:
    json.dump({'land': land_polygons, 'lake': lake_polygons}, f, separators=(',', ':'))
print(f'Written to {out_poly}')
