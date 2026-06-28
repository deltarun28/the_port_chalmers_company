import json
import math
import os

def haversine(lat1, lng1, lat2, lng2):
    R = 6371
    lat1, lng1, lat2, lng2 = map(math.radians, [lat1, lng1, lat2, lng2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng/2)**2
    return round(2 * R * math.asin(math.sqrt(a)))

script_dir = os.path.dirname(os.path.abspath(__file__))
data_dir = os.path.join(script_dir, '..', 'data')

with open(os.path.join(data_dir, 'capitals.json')) as f:
    capitals = json.load(f)

distances = {}
for i, a in enumerate(capitals):
    for b in capitals[i+1:]:
        d = haversine(a['lat'], a['lng'], b['lat'], b['lng'])
        distances[f"{a['capital']}→{b['capital']}"] = d
        distances[f"{b['capital']}→{a['capital']}"] = d

with open(os.path.join(data_dir, 'distances.json'), 'w') as f:
    json.dump(distances, f)

print(f"Generated {len(distances)} distance pairs for {len(capitals)} capitals")
