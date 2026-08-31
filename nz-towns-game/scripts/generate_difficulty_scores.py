#!/usr/bin/env python3
"""
Adds a 'difficulty' field (1-5 stars) to every town in data/towns.json, in place.

Run after generate_towns.py, from anywhere:
    python3 scripts/generate_difficulty_scores.py

--- What makes a New Zealand town hard ---

The world game scored difficulty on geographic ambiguity alone: how well
distance feedback narrows the field. That was the right measure there, because
every player knows roughly where every capital is — the challenge is
triangulation, not recall.

Here it is the other way round. Every town is inside one 1,400km strip, so
triangulation is easy for all of them; what actually varies is whether the
player has heard of the place. Nobody fails to find Auckland. Plenty of people
could not put Ohakune within 200km. So recall is weighted heaviest:

  Factor 1 — Obscurity (weight 0.65)
    Rank by population, largest = easiest. Towns Wikidata has no figure for are
    small settlements kept for being recognisable landmarks (Franz Josef,
    Arrowtown, Naseby); they rank at the bottom of the population order but are
    not treated as the hardest possible, since being famous enough to appear in
    ALWAYS_INCLUDE is itself evidence of recall.

  Factor 2 — Local density (weight 0.35)
    (towns within 50km x 3) + (towns within 100km x 1)
    A town in the middle of the Canterbury Plains or the Waikato has many near
    neighbours, so a close guess still leaves several candidates. Somewhere like
    Haast or Te Kaha is alone, and one good guess almost gives it away.

The two are combined, then split into five equal buckets by percentile, so the
tiers stay balanced whatever the town list looks like.
"""
import json
import math
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH  = os.path.join(SCRIPT_DIR, '..', 'data', 'towns.json')

W_OBSCURITY = 0.65
W_DENSITY   = 0.35

NEAR_KM = 50    # weighted x3
WIDE_KM = 100   # weighted x1

# Where a town with no published population sits in the population order,
# as a fraction from the bottom. Not 0.0: these towns earned their place by
# being recognisable, so they are hard-but-not-hopeless rather than the worst
# case. See the ALWAYS_INCLUDE note in generate_towns.py.
UNKNOWN_POP_PERCENTILE = 0.15


def haversine(lat1, lng1, lat2, lng2):
    R = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def normalise(values):
    """Scale to 0..1. A flat list maps to all-zero rather than dividing by zero."""
    lo, hi = min(values), max(values)
    span = hi - lo
    return [0.0] * len(values) if span == 0 else [(v - lo) / span for v in values]


def main():
    with open(DATA_PATH, encoding='utf-8') as f:
        towns = json.load(f)
    print(f'{len(towns)} towns')

    # --- Factor 1: obscurity, by population rank ---
    known = sorted((t['population'] for t in towns if t['population']), reverse=True)
    unknown_rank = int(len(known) * (1 - UNKNOWN_POP_PERCENTILE))

    obscurity = []
    for t in towns:
        if t['population']:
            rank = known.index(t['population'])          # 0 = largest
        else:
            rank = unknown_rank
        obscurity.append(rank / max(1, len(known) - 1))  # 0 = famous, 1 = obscure

    # --- Factor 2: local density ---
    density = []
    for a in towns:
        near = wide = 0
        for b in towns:
            if a is b:
                continue
            d = haversine(a['lat'], a['lng'], b['lat'], b['lng'])
            if d <= NEAR_KM:
                near += 1
            elif d <= WIDE_KM:
                wide += 1
        density.append(near * 3 + wide)

    obscurity = normalise(obscurity)
    density = normalise(density)

    scores = [W_OBSCURITY * o + W_DENSITY * d for o, d in zip(obscurity, density)]

    # --- Five equal buckets by percentile ---
    order = sorted(range(len(towns)), key=lambda i: scores[i])
    for placed, i in enumerate(order):
        towns[i]['difficulty'] = min(5, 1 + placed * 5 // len(towns))

    with open(DATA_PATH, 'w', encoding='utf-8') as f:
        json.dump(towns, f, ensure_ascii=False, indent=1)

    from collections import Counter
    print('\nTier sizes:', dict(sorted(Counter(t['difficulty'] for t in towns).items())))
    for tier in range(1, 6):
        names = [t['name'] for t in towns if t['difficulty'] == tier]
        print(f'\n{tier}* ({len(names)}): {", ".join(names[:14])}'
              + (' ...' if len(names) > 14 else ''))
    print(f'\nWritten to {DATA_PATH}')


if __name__ == '__main__':
    main()
