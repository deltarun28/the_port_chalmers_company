#!/usr/bin/env python3
"""
Fetches Natural Earth 110m land polygons (GeoJSON) and projects them
into our Mercator SVG coordinate space (800x400). Outputs a JS module
with the combined SVG path string.
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

url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson'
print(f'Fetching {url} ...')
with urllib.request.urlopen(url, timeout=30) as resp:
    data = json.load(resp)

paths = []
for feature in data['features']:
    geom = feature['geometry']
    if geom['type'] == 'Polygon':
        p = ring_to_path(geom['coordinates'][0])
        if p: paths.append(p)
    elif geom['type'] == 'MultiPolygon':
        for poly in geom['coordinates']:
            p = ring_to_path(poly[0])
            if p: paths.append(p)

combined = ' '.join(paths)
print(f'Generated {len(paths)} land polygons, {len(combined)} chars of path data')

out = os.path.join(os.path.dirname(__file__), '..', 'data', 'coastline.js')
with open(out, 'w') as f:
    f.write(f'export const COASTLINE = `{combined}`;\n')
print(f'Written to {out}')
