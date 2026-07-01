// Difficulty configuration — the single source of truth for all three modes.
// Read by game.js (maxGuesses), map.js (showGrid, showRings, globeView, showDots),
// and index.html (passes the selected object down to both).
// Pure data: no logic, no imports, no DOM.
//
// Field meanings:
//   maxGuesses  — wrong guesses allowed before the round is lost (all modes: 6)
//   showGrid    — lat/lng grid lines drawn on the globe
//   showRings   — geodesic distance rings drawn around each guessed city (easy only)
//   globeView   — use 3D canvas globe; false would use the flat SVG map (dead code)
//   showDots    — all capital dots visible from the start (hard hides them)
export const DIFFICULTIES = {
  hard:     { maxGuesses: 6, showGrid: false, showRings: false, globeView: true, showDots: false },
  moderate: { maxGuesses: 6, showGrid: true,  showRings: false, globeView: true, showDots: true  },
  easy:     { maxGuesses: 6, showGrid: true,  showRings: true,  globeView: true, showDots: true  },
};
