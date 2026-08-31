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
