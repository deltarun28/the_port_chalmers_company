export function calculateRing(distanceKm, guessNumber) {
  const multiplier = Math.max(0, 1 - (guessNumber - 1) * 0.2);
  const thickness = Math.max(20, Math.min(500, distanceKm * 0.025 * multiplier));
  return {
    innerRadius: Math.max(0, distanceKm - thickness / 2),
    outerRadius: distanceKm + thickness / 2,
    thickness,
  };
}
