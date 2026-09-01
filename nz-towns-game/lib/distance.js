// Great-circle distance between two towns, in kilometres.
// Pure function — no imports, no state, no DOM.
//
// The world game shipped a pre-computed distances.json because 195 capitals
// produce 37,830 pairs and the haversine was worth doing once at build time.
// That does not scale: 167 towns are 27,722 pairs, and the file would be
// several megabytes of JSON parsed on every cold load to save work the CPU
// does in microseconds. So distance is computed on demand here instead, and
// there is no generated distance table in this project at all.

const EARTH_R = 6371;

export function distanceKm(a, b) {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const dφ = φ2 - φ1;
  const dλ = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return Math.round(2 * EARTH_R * Math.asin(Math.sqrt(h)));
}

// Initial great-circle bearing from `a` to `b`, in degrees clockwise from north.
//
// Distance alone is a weak clue: it puts the answer somewhere on a circle, so
// narrowing it down takes three guesses of honest triangulation. A bearing
// collapses that circle to a point, which is why every comparable game gives
// one. It is the single largest difference between guessing here and guessing
// on a map you can reason about.
//
// This is the INITIAL bearing (forward azimuth). Along a great circle the
// bearing changes as you travel, so the reciprocal of a→b is not b→a. Over New
// Zealand the difference is under a degree, but the arrow shown to the player
// is the direction to set off in, which is the honest thing to display.
export function bearingDeg(a, b) {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const dλ = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
