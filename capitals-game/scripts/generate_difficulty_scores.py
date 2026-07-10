#!/usr/bin/env python3
"""
Computes a difficulty rating (1–5 stars) for every capital in capitals.json
and writes the 'difficulty' field back in-place.

Run once from the repo root:
    python3 scripts/generate_difficulty_scores.py

Only needs re-running if capitals are added/removed or coordinates change.

--- How difficulty is measured ---

Difficulty = geographic ambiguity: how hard it is to narrow down the target
capital from distance feedback alone.  Two factors:

  Factor 1 — Local density
    density_score = (capitals within 500km × 3) + (capitals within 1000km × 1)
    Dense clusters (West Africa, Caribbean, Central Europe) score high.
    Isolated capitals (Wellington, Reykjavik, Canberra) score low.

  Factor 2 — Ring ambiguity
    For each possible first-guess capital, count how many OTHER capitals fall
    within ±250km of the same distance to the target (i.e. could plausibly be
    the answer from that guess).  Average over all first-guess capitals.
    A high value means many red-herrings per guess — hard to triangulate.

  raw_score = density × 0.4 + ring_ambiguity × 0.6

Ring ambiguity is weighted higher because it directly affects gameplay.

--- Normalisation ---

Raw scores are divided into five equal percentile buckets:
  bottom 20% → 1★  (easiest — isolated, unambiguous)
  20–40%     → 2★
  40–60%     → 3★
  60–80%     → 4★
  top 20%    → 5★  (hardest — dense, many look-alikes)

Thresholds are derived from the data, not hard-coded, so they stay balanced
if capitals are ever added or removed.
"""

import json, os, math
from collections import Counter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR   = os.path.join(SCRIPT_DIR, '..', 'data')
BAND_KM    = 250   # ring-ambiguity band: ± km around the guess distance
W_DENSITY  = 0.4
W_AMBIG    = 0.6

def load(name):
    with open(os.path.join(DATA_DIR, name), encoding='utf-8') as f:
        return json.load(f)

def haversine(lat1, lng1, lat2, lng2):
    """Fallback great-circle distance (km) when the key is absent from distances.json."""
    R = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return R * 2 * math.asin(min(1.0, math.sqrt(a)))

def get_distance(raw, cap_by_name, a, b):
    """Return distance between capitals a and b, trying both key directions."""
    for key in (f"{a}→{b}", f"{b}→{a}"):
        if key in raw:
            return raw[key]
    # Very rare fallback — haversine if the pair is missing from distances.json
    ca, cb = cap_by_name[a], cap_by_name[b]
    return haversine(ca['lat'], ca['lng'], cb['lat'], cb['lng'])

def main():
    print('Loading capitals.json …')
    capitals = load('capitals.json')
    n = len(capitals)
    print(f'  {n} capitals')

    print('Loading distances.json …')
    raw_distances = load('distances.json')
    print(f'  {len(raw_distances):,} distance pairs')

    cap_by_name = {c['capital']: c for c in capitals}
    names = [c['capital'] for c in capitals]

    # Pre-build full n×n distance matrix as dicts for O(1) inner-loop lookups.
    # d[a][b] = distance in km from capital a to capital b (a ≠ b).
    print('Building distance matrix …')
    d = {}
    for name in names:
        d[name] = {}
        for other in names:
            if other == name:
                continue
            d[name][other] = get_distance(raw_distances, cap_by_name, name, other)

    print('Computing scores …')
    raw_scores = {}
    for i, target in enumerate(capitals):
        t = target['capital']
        if (i + 1) % 25 == 0 or i == n - 1:
            print(f'  {i+1}/{n}', end='\r', flush=True)

        # Factor 1: density around the target
        dists_to_t = d[t]
        within_500 = sum(1 for km in dists_to_t.values() if km <= 500)
        within_1k  = sum(1 for km in dists_to_t.values() if km <= 1000)
        density = within_500 * 3 + within_1k

        # Factor 2: ring ambiguity
        # For each OTHER capital 'guesser', how many capitals sit within
        # ±BAND_KM of the same distance guesser→target?  Average over all guessers.
        ambiguity_sum = 0
        for guesser, g_dists in d.items():
            if guesser == t:
                continue
            d_to_t = g_dists[t]
            rivals = sum(
                1 for c_name, d_to_c in g_dists.items()
                if c_name != t and abs(d_to_c - d_to_t) <= BAND_KM
            )
            ambiguity_sum += rivals
        ring_ambiguity = ambiguity_sum / (n - 1)

        raw_scores[t] = density * W_DENSITY + ring_ambiguity * W_AMBIG

    print()

    # Assign 1–5 stars by equal percentile buckets
    sorted_vals = sorted(raw_scores.values())
    thresholds = [sorted_vals[int(n * p)] for p in (0.20, 0.40, 0.60, 0.80)]

    def star(score):
        if score <= thresholds[0]: return 1
        if score <= thresholds[1]: return 2
        if score <= thresholds[2]: return 3
        if score <= thresholds[3]: return 4
        return 5

    ratings = {name: star(s) for name, s in raw_scores.items()}

    # Spot-checks (Wellington / Canberra / Reykjavik → expect 1–2★;
    #              Vienna / Bratislava / Niamey → expect 4–5★)
    checks = ['Wellington', 'Canberra', 'Reykjavik', 'Suva',
              'Vienna', 'Bratislava', 'Brussels', 'Niamey', 'Ouagadougou', 'Lomé']
    print('Spot-checks:')
    for name in checks:
        if name in ratings:
            print(f'  {name:<22} {ratings[name]}★  (raw {raw_scores[name]:.1f})')

    counts = Counter(ratings.values())
    print('Distribution:')
    for s in range(1, 6):
        bar = '█' * counts[s]
        print(f'  {s}★  {counts[s]:3d}  {bar}')

    # Write difficulty field into every capital entry
    for cap in capitals:
        cap['difficulty'] = ratings[cap['capital']]

    out = os.path.join(DATA_DIR, 'capitals.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(capitals, f, ensure_ascii=False, indent=2)
    print(f'Written → {out}')

if __name__ == '__main__':
    main()
