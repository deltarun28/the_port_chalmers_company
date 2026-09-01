// Converts a guess's distance and attempt number into the inner/outer radii
// (in km) of the ring to draw on the map.
// Pure function — no imports, no side effects.
// Tested in logic.test.js (run with: node --test lib/logic.test.js).
//
// Rings shrink with successive guesses so early guesses give wide, coarse bands
// and later guesses give narrower, more informative rings.
//
// Thickness formula:
//   base        = distanceKm × 0.06    (6% of the distance)
//   multiplier  = 1 − (guessNumber−1) × 0.2   →  1.0 / 0.8 / 0.6 / 0.4 / 0.2 / 0
//   thickness   = clamp(base × multiplier, 4 km, 80 km)
//
// The world game used 2.5% clamped to 20–500km, tuned for guesses thousands of
// kilometres apart. At New Zealand scale those bands are either invisible or
// wider than the country: a 300km guess would have produced a 20km band pinned
// to the floor of the clamp, the same width as a 1,200km guess. The percentage
// is raised and the clamp brought in so the band still reads as a band at 200km
// and still means something at 1,300km.

export function calculateRing(distanceKm, guessNumber) {
  const multiplier = Math.max(0, 1 - (guessNumber - 1) * 0.2);
  const thickness = Math.max(4, Math.min(80, distanceKm * 0.06 * multiplier));
  return {
    innerRadius: Math.max(0, distanceKm - thickness / 2),
    outerRadius: distanceKm + thickness / 2,
    thickness,
  };
}
