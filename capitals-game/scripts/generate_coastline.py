#!/usr/bin/env python3
"""
Fetches Natural Earth 110m land polygons (GeoJSON) and outputs:
  data/coastline.js     — SVG path string (Mercator, 800x400)
  data/land_polygons.js — raw lat/lng polygon arrays for globe rendering
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
    # Returns [[lat, lng], ...] — drop last point if it duplicates first (closed ring)
    coords = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    return [[round(c[1], 4), round(c[0], 4)] for c in coords]

url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson'
print(f'Fetching {url} ...')
with urllib.request.urlopen(url, timeout=30) as resp:
    data = json.load(resp)

paths = []
polygons = []  # list of [[lat,lng], ...]

for feature in data['features']:
    geom = feature['geometry']
    if geom['type'] == 'Polygon':
        ring = geom['coordinates'][0]
        p = ring_to_path(ring)
        if p:
            paths.append(p)
            polygons.append(ring_to_latlng(ring))
    elif geom['type'] == 'MultiPolygon':
        for poly in geom['coordinates']:
            ring = poly[0]
            p = ring_to_path(ring)
            if p:
                paths.append(p)
                polygons.append(ring_to_latlng(ring))

combined = ' '.join(paths)
print(f'Generated {len(paths)} land polygons, {len(combined)} chars of SVG path data')

base = os.path.join(os.path.dirname(__file__), '..', 'data')

out_svg = os.path.join(base, 'coastline.js')
with open(out_svg, 'w') as f:
    f.write(f'export const COASTLINE = `{combined}`;\n')
print(f'Written to {out_svg}')

out_poly = os.path.join(base, 'land_polygons.js')
with open(out_poly, 'w') as f:
    f.write('export const LAND_POLYGONS = ')
    f.write(json.dumps(polygons, separators=(',', ':')))
    f.write(';\n')
print(f'Written to {out_poly}')
