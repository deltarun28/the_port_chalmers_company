// Converts a guess's distance and attempt number into the inner/outer radii
// (in km) of the ring to draw on the globe.
// Pure function — no imports, no side effects.
// Tested in ring_calculator.test.js (run with: node --test).
//
// Rings shrink with successive guesses so early guesses give wide, coarse bands
// and later guesses give narrower, more informative rings.
//
// Thickness formula:
//   base        = distanceKm × 0.025   (2.5% of the distance)
//   multiplier  = 1 − (guessNumber−1) × 0.2   →  1.0 / 0.8 / 0.6 / 0.4 / 0.2 / 0
//   thickness   = clamp(base × multiplier, 20 km, 500 km)

export function calculateRing(distanceKm, guessNumber) {
  const multiplier = Math.max(0, 1 - (guessNumber - 1) * 0.2);
  const thickness = Math.max(20, Math.min(500, distanceKm * 0.025 * multiplier));
  return {
    innerRadius: Math.max(0, distanceKm - thickness / 2),
    outerRadius: distanceKm + thickness / 2,
    thickness,
  };
}
