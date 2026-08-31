#!/usr/bin/env python3
"""
Builds data/towns.json — the source of truth for the game.

Run from anywhere:
    python3 scripts/generate_towns.py

--- Why two sources ---

Neither source is sufficient alone, and they fail in opposite directions.

GeoNames cannot answer "is this a town?". It files Remuera, Karori, Papatoetoe
and Onehunga as PPL — the same class as Gore and Blenheim — so no feature-code
filter separates a city suburb from a country town. Its NZ population field is
also wrong in both directions: real towns sit at 0 (Kaitaia, Pukekohe,
Waipukurau), junk records carry big numbers (Papatowai 6,593 against an actual
population near 20; Waikowhai 5,550, an Auckland suburb filed under West Coast),
and abolished entities persist (Manukau City 362,000, merged into Auckland in
2010, which would double-count the country's largest city).

Wikidata answers "is this a town?" reliably — suburbs are classified as
neighbourhoods and never appear — but its coverage has holes. Roughly a third of
its NZ towns carry no population statement, and its class list misses a dozen
genuine ones outright.

So each source does the job it is good at:
  Wikidata  → WHICH places are towns, and their coordinates. The gate.
  GeoNames  → HOW BIG they are, where Wikidata has no figure; region assignment
              via the admin1 code (reliable, unlike its population); and
              coordinates for the named exceptions below.

The gaps Wikidata's class list leaves cannot be closed by any rule — the towns
it misses look exactly like the suburbs it correctly rejects — so they are named
one by one in ADDITIONAL_TOWNS. That list is short, checkable, and stable.

--- Macrons ---

Wikidata stores the correct orthography: Taupō, Whangārei, Ōtaki, Kaikōura.
Those are the names the game displays. But almost nobody types a macron into a
guess box, so every town also gets a macron-stripped alias ("Taupo"), and
validator.js strips macrons from player input before matching. Name matching
anywhere in this project is macron-insensitive in both directions.

--- Filters, in order ---

  1. Mainland bounding box  — drops Chathams / Kermadecs / Tokelau outliers
  2. EXCLUDE                — named suburbs and non-town urban areas
  3. MIN_POPULATION         — see below
  4. ALWAYS_INCLUDE         — restores recognisable small towns below the cut
  5. Proximity dedupe       — SEPARATION_TIERS + ABSORB_RATIO + HARD_MIN_KM

Adjust MIN_POPULATION and the separation settings to retune the list size.
"""
import csv
import json
import math
import os
import re
import unicodedata
import urllib.parse
import urllib.request

# ── Tunable filters ──────────────────────────────────────────────────────────

MIN_POPULATION = 3000  # below this a town must be in ALWAYS_INCLUDE to survive

# How close another place has to be before the town already kept absorbs it.
# A single flat radius cannot work here. At 10km Auckland still fails to swallow
# its own suburbs while Greytown and Carterton — two distinct Wairarapa towns
# with their own main streets, 10km apart on SH2 — collapse into one. So the
# radius scales with the size of the town doing the absorbing: a metro sprawls,
# a country town does not.
#
# A place is only absorbed if it is BOTH inside the radius AND small relative to
# the town absorbing it. Distance alone is not enough: Lower Hutt sits 13km from
# Wellington but is a city of 100,000 with its own name on the map, whereas
# Mount Maunganui at a similar distance from Tauranga is a beach suburb of it.
ABSORB_RATIO = 0.25

# Below this, the ratio test is skipped and the smaller name is always absorbed.
# The whole game is distance feedback, so two towns 1.5km apart (Tairua and
# Pauanui, across one harbour) are not a puzzle — no sequence of guesses can
# separate them, and landing on the wrong one feels like a bug.
HARD_MIN_KM = 5

#   (population of the kept town, radius in km)
SEPARATION_TIERS = [
    (100_000, 15),
    ( 25_000, 12),
    ( 10_000,  8),
    (  3_000,  6),
    (      0,  4),
]

# Real towns that Wikidata's class list misses entirely. Every one of these is a
# recognised urban area with its own main street, and every one is absent from
# the query above. They are taken from GeoNames instead — its coordinates and,
# for towns of this size, its populations are sound; it is only its inability to
# tell a town from a suburb that made it unusable as the primary source.
#
# Do not try to derive this list. The towns here (Waiuku, Alexandra, Marton)
# are indistinguishable in GeoNames from the suburbs alongside them (Remuera,
# Karori, Onehunga) — same feature code, same population band. Naming them is
# the only honest way to do it.
ADDITIONAL_TOWNS = {
    'Waiuku', 'Alexandra', 'Marton', 'Cromwell', 'Temuka', 'Foxton', 'Waihi',
    'Raglan', 'Te Kauwhata', 'Omokoroa', 'Orewa', 'Ohope Beach', 'Snells Beach',
    'Riverhead',
}

# Wikidata classifies these as towns or urban areas, but none of them is a place
# a player would ever be asked to find:
#   Mount Roskill / Beachlands  — Auckland suburbs
#   Hibiscus Coast              — an urban area spanning Orewa and Whangaparaoa,
#                                 not a name anyone points to on a map
#   Lake Hayes Estate           — a subdivision that would otherwise outrank
#                                 Arrowtown next door
EXCLUDE = {
    'Mount Roskill', 'Hibiscus Coast', 'Lake Hayes Estate', 'Beachlands',
}

# GeoNames records that survive every other filter but are not towns: three
# carry populations off by two orders of magnitude, and one is an Auckland
# suburb filed under the West Coast. They are isolated enough that the proximity
# dedupe never catches them, so they have to be named.
BAD_GEONAMES = {
    'Papatowai',   # listed 6,593; actual population is around 20
    'Waikowhai',   # an Auckland suburb, filed under West Coast
    'Leigh',       # listed 3,525; a village of a few hundred
    'Aotea',       # listed under Wellington, coordinates near Whanganui
}

# Places under MIN_POPULATION that any New Zealander could still place on a map.
# Population is a poor proxy for guessability — Kaikoura (~2,200) is far more
# recognisable than plenty of 4,000-person dormitory towns — so these are kept
# by name. Everything here must exist in Wikidata or it is silently skipped.
ALWAYS_INCLUDE = {
    # Towns that land just under the threshold on a correct population but are
    # squarely part of the mental map — Hokitika is the West Coast's main town
    # and misses the cut by 80 people.
    'Hokitika', 'Milton', 'Wellsford', 'Amberley', 'Ngatea', 'Edgecumbe',
    'Kaikoura', 'Te Anau', 'Twizel', 'Arrowtown', 'Russell', 'Paihia',
    'Akaroa', 'Hanmer Springs', 'Martinborough', 'Greytown', 'Featherston',
    'Coromandel', 'Methven', 'Geraldine', 'Ohakune', 'Taihape', 'Bulls',
    'Bluff', 'Winton', 'Riverton', 'Waipu', 'Mangawhai', 'Kaeo', 'Kawakawa',
    'Raetihi', 'Waiouru', 'Reefton', 'Ross', 'Franz Josef', 'Fox Glacier',
    'Haast', 'Wanaka', 'Clyde', 'Roxburgh', 'Ranfurly', 'Naseby', 'Lawrence',
    'Owaka', 'Tuatapere', 'Otautau', 'Lumsden', 'Kingston', 'Glenorchy',
    'Cardrona', 'Omarama', 'Kurow', 'Fairlie', 'Darfield', 'Leeston',
    'Culverden', 'Cheviot', 'Ward', 'Seddon', 'Havelock', 'Collingwood',
    'Takaka', 'Murchison', 'Karamea', 'Whitianga', 'Tairua', 'Pauanui',
    'Whangamata', 'Waihi Beach', 'Maketu', 'Te Kaha', 'Tolaga Bay',
    'Tokomaru Bay', 'Ruatoria', 'Wairoa', 'Waipawa', 'Norsewood',
    'Eketahuna', 'Pahiatua', 'Woodville', 'Shannon', 'Himatangi',
    'Patea', 'Opunake', 'Manaia', 'Kaponga', 'Mokau', 'Awakino',
    'Piopio', 'Benneydale', 'Mangakino', 'Atiamuri', 'Reporoa',
    'Murupara', 'Minginui', 'Waiotapu', 'National Park', 'Raurimu',
}

# Mainland only — the Chathams sit at longitude -176 and would stretch the map.
LAT_MIN, LAT_MAX = -47.5, -34.0
LNG_MIN, LNG_MAX = 166.0, 179.5

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR   = os.path.join(SCRIPT_DIR, '..', 'data')
CACHE_DIR  = os.path.join(SCRIPT_DIR, '.cache')

REGIONS = {
    'E7': 'Auckland',      'E8': 'Bay of Plenty', 'E9': 'Canterbury',
    'F1': 'Gisborne',      'F2': "Hawke's Bay",   'F3': 'Manawatu-Whanganui',
    'F4': 'Marlborough',   'F5': 'Nelson',        'F6': 'Northland',
    'F7': 'Otago',         'F8': 'Southland',     'F9': 'Taranaki',
    'G1': 'Waikato',       'G2': 'Wellington',    'G3': 'West Coast',
    'TAS': 'Tasman',       '10': 'Chatham Islands',
}

# Population is OPTIONAL on purpose. Requiring it silently deleted around thirty
# real towns — Hokitika, Milton, Wellsford among them — because Wikidata simply
# has no P1082 statement for them. The population is filled in from GeoNames
# afterwards; the point of this query is the town list, not the numbers.
#
# The type list is wider than it looks: Wellington is not P31 "city" (Q515) but
# "big city" (Q1549591) and "urban area" (Q702492), so a narrower VALUES clause
# drops the capital.
SPARQL = """
SELECT ?item ?itemLabel ?pop ?coord WHERE {
  VALUES ?type { wd:Q3957 wd:Q515 wd:Q486972 wd:Q5119 wd:Q1549591 wd:Q702492 }
  ?item wdt:P31 ?type .
  ?item wdt:P17 wd:Q664 .
  ?item wdt:P625 ?coord .
  OPTIONAL { ?item wdt:P1082 ?pop . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
"""

UA = 'nz-towns-game/1.0 (static PWA build script)'


def strip_macrons(s):
    """Taupō → Taupo. Used for matching only; never for display."""
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


def haversine(lat1, lng1, lat2, lng2):
    R = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def fetch(url, dest, headers=None):
    """Download to dest unless already cached."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    if os.path.exists(dest):
        print(f'  cached: {os.path.basename(dest)}')
        return dest
    print(f'  fetching {url[:80]}...')
    req = urllib.request.Request(url, headers=headers or {'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=180) as resp, open(dest, 'wb') as f:
        f.write(resp.read())
    return dest


def load_wikidata():
    """Town name, population, lat/lng. Latest population per item wins."""
    url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': SPARQL})
    path = fetch(url, os.path.join(CACHE_DIR, 'wikidata_towns.csv'),
                 headers={'User-Agent': UA, 'Accept': 'text/csv'})

    best = {}
    with open(path, encoding='utf-8') as f:
        for row in csv.DictReader(f):
            m = re.match(r'Point\(([-\d.]+) ([-\d.]+)\)', row['coord'])
            if not m:
                continue
            lng, lat = float(m.group(1)), float(m.group(2))
            pop = int(float(row['pop'])) if row['pop'] else 0
            name = row['itemLabel']
            # Wikidata carries one population statement per census; keep the largest,
            # which in practice is the most recent for every NZ town.
            if name not in best or pop > best[name]['population']:
                best[name] = {'name': name, 'population': pop, 'lat': lat, 'lng': lng}
    return list(best.values())


def load_geonames():
    """
    Returns (region_points, by_name).

    region_points — (lat, lng, region) for every populated place, used to infer
                    a region from coordinates.
    by_name       — the largest record per name, used ONLY to recover
                    coordinates for ALWAYS_INCLUDE villages that Wikidata has no
                    population statement for. Population from this source is not
                    trusted, so recovered towns carry population None.
    """
    zip_path = fetch('https://download.geonames.org/export/dump/NZ.zip',
                     os.path.join(CACHE_DIR, 'NZ.zip'))
    import zipfile
    with zipfile.ZipFile(zip_path) as z:
        raw = z.read('NZ.txt').decode('utf-8')

    region_points, by_name = [], {}
    for row in csv.reader(raw.splitlines(), delimiter='\t', quoting=csv.QUOTE_NONE):
        if len(row) <= 14 or row[6] != 'P':
            continue
        lat, lng = float(row[4]), float(row[5])
        if row[10] in REGIONS:
            region_points.append((lat, lng, REGIONS[row[10]]))
        if not (LAT_MIN < lat < LAT_MAX and LNG_MIN < lng < LNG_MAX):
            continue
        # PPLX is GeoNames' suburb class — never a fallback candidate
        if row[7] == 'PPLX':
            continue
        key = strip_macrons(row[1])
        pop = int(row[14]) if row[14].isdigit() else 0
        if key not in by_name or pop > by_name[key][2]:
            by_name[key] = (lat, lng, pop, row[1])
    return region_points, by_name


def separation_km(population):
    """Absorption radius for a town of this size. See SEPARATION_TIERS."""
    for threshold, km in SEPARATION_TIERS:
        if (population or 0) >= threshold:
            return km
    return SEPARATION_TIERS[-1][1]


def assign_region(town, points):
    """Nearest GeoNames populated place wins. admin1 is reliable; population is not."""
    best, best_d = None, 1e9
    for lat, lng, region in points:
        d = haversine(town['lat'], town['lng'], lat, lng)
        if d < best_d:
            best, best_d = region, d
    return best


def main():
    print('Loading Wikidata town list...')
    towns = load_wikidata()
    print(f'  {len(towns)} places with coordinates')

    towns = [t for t in towns
             if LAT_MIN < t['lat'] < LAT_MAX and LNG_MIN < t['lng'] < LNG_MAX]
    print(f'  {len(towns)} within the mainland bounding box')

    towns = [t for t in towns if t['name'] not in EXCLUDE]
    print(f'  {len(towns)} after removing suburbs and non-town urban areas')

    print('Loading GeoNames...')
    region_points, geo_by_name = load_geonames()
    print(f'  {len(region_points)} region reference points, {len(geo_by_name)} named places')

    # Every set below is written in plain ASCII; Wikidata names carry macrons.
    # All comparisons go through strip_macrons() so the two ever meet.
    allow = {strip_macrons(n) for n in ALWAYS_INCLUDE}
    extra = {strip_macrons(n) for n in ADDITIONAL_TOWNS}
    bad = {strip_macrons(n) for n in BAD_GEONAMES}

    # Fill in the populations Wikidata is missing. Wikidata has already vouched
    # that each of these is a town, so a same-name GeoNames lookup is safe here
    # in a way it would not be as a way of finding towns in the first place.
    filled = 0
    for t in towns:
        if t['population']:
            continue
        hit = geo_by_name.get(strip_macrons(t['name']))
        if hit and hit[2]:
            t['population'] = hit[2]
            filled += 1
    print(f'  {filled} populations filled in from GeoNames')

    # Towns Wikidata does not class as towns at all. See ADDITIONAL_TOWNS.
    have = {strip_macrons(t['name']) for t in towns}
    added = []
    for key in sorted(extra - have):
        hit = geo_by_name.get(key)
        if not hit:
            print(f'  warning: ADDITIONAL_TOWNS name not in GeoNames: {key}')
            continue
        lat, lng, pop, display = hit
        towns.append({'name': display, 'population': pop, 'lat': lat, 'lng': lng})
        added.append(display)
    print(f'  +{len(added)} from ADDITIONAL_TOWNS: {", ".join(added)}')

    restored = [t['name'] for t in towns
                if (t['population'] or 0) < MIN_POPULATION
                and strip_macrons(t['name']) in allow]
    towns = [t for t in towns
             if (t['population'] or 0) >= MIN_POPULATION
             or strip_macrons(t['name']) in allow]
    print(f'  {len(towns)} at population >= {MIN_POPULATION} '
          f'(+{len(restored)} restored by ALWAYS_INCLUDE)')

    # Villages neither source has a population for (Franz Josef, Naseby,
    # Glenorchy). GeoNames coordinates are sound even where its populations are
    # not, so recover position only and leave population unknown.
    have = {strip_macrons(t['name']) for t in towns}
    recovered = []
    for key in sorted(allow - have):
        hit = geo_by_name.get(key)
        if not hit:
            continue
        lat, lng, geo_pop, display = hit
        # geo_pop is a sort hint only — not trusted enough to publish or to pass
        # the population threshold, but good enough to decide which of two
        # neighbouring villages is the better-known one.
        towns.append({'name': display, 'population': None, 'lat': lat, 'lng': lng,
                      'pop_hint': geo_pop})
        recovered.append(display)
    if recovered:
        print(f'  +{len(recovered)} recovered from GeoNames: {", ".join(recovered)}')

    before = len(towns)
    towns = [t for t in towns if strip_macrons(t['name']) not in bad]
    if before != len(towns):
        print(f'  -{before - len(towns)} bad GeoNames records removed')

    still_missing = sorted(allow - {strip_macrons(t['name']) for t in towns})
    if still_missing:
        print(f'  note: {len(still_missing)} ALWAYS_INCLUDE names in neither source: '
              f'{", ".join(still_missing)}')

    # Greedy dedupe, largest first, so the surviving name is the one players
    # would actually say (Hamilton, not one of its satellite suburbs).
    towns.sort(key=lambda t: -(t['population'] or t.get('pop_hint') or 0))
    kept, merged = [], []
    for t in towns:
        t_pop = t['population'] or t.get('pop_hint') or 0
        near = None
        for k in kept:
            k_pop = k['population'] or k.get('pop_hint') or 0
            d = haversine(t['lat'], t['lng'], k['lat'], k['lng'])
            if d >= separation_km(k_pop):
                continue
            if d >= HARD_MIN_KM and t_pop > k_pop * ABSORB_RATIO:
                continue  # too big to be a suburb of k — both stay on the map
            near = k
            break
        if near:
            merged.append((t['name'], near['name']))
        else:
            kept.append(t)
    print(f'  {len(kept)} after proximity dedupe '
          f'({len(merged)} absorbed into a larger neighbour)')

    for t in kept:
        t['region'] = assign_region(t, region_points)
        # Aliases drive the autocomplete and the validator: players can search by
        # region, and by the unmacronised spelling they will actually type.
        aliases = [t['region']]
        plain = strip_macrons(t['name'])
        if plain != t['name']:
            aliases.append(plain)
        t['aliases'] = aliases

    kept.sort(key=lambda t: strip_macrons(t['name']))
    out = os.path.join(DATA_DIR, 'towns.json')
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump([{k: t[k] for k in ('name', 'region', 'lat', 'lng', 'population', 'aliases')}
                   for t in kept], f, ensure_ascii=False, indent=1)

    from collections import Counter
    print(f'\nWritten {len(kept)} towns to {out}')
    print('\nPer region:')
    for region, n in sorted(Counter(t['region'] for t in kept).items()):
        print(f'  {region:<20} {n:>3}')
    if merged:
        print('\nAbsorbed into a larger neighbour:')
        for a, b in merged:
            print(f'  {a} -> {b}')


if __name__ == '__main__':
    main()
