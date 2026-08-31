// Difficulty configuration — the single source of truth for all three modes.
// Read by game.js (maxGuesses), map.js (showGrid, showRings, showDots),
// and index.html (passes the selected object down to both).
// Pure data: no logic, no imports, no DOM.
//
// Field meanings:
//   maxGuesses  — wrong guesses allowed before the round is lost (all modes: 6)
//   showGrid    — lat/lng grid lines drawn on the map
//   showRings   — distance rings drawn around each guessed town (easy only)
//   showDots    — all town dots visible from the start (hard hides them, so the
//                 player has to know the name rather than click around)
//
// The world game also had a globeView flag. There is no globe here — one country
// fits a flat projection without distorting the distances the game runs on — so
// that field is gone rather than left dead.
export const DIFFICULTIES = {
  hard:     { maxGuesses: 6, showGrid: false, showRings: false, showDots: false },
  moderate: { maxGuesses: 6, showGrid: true,  showRings: false, showDots: true  },
  easy:     { maxGuesses: 6, showGrid: true,  showRings: true,  showDots: true  },
};
