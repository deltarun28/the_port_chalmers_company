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
//   showBearing — show the direction from each guess to the answer
//
// Bearing is the strongest clue in the game: distance alone leaves the answer
// somewhere on a circle, while distance plus direction leaves one point. Hard
// withholds it so that mode still requires triangulation. If that proves too
// punishing, flipping showBearing to true for hard is a one-word change.
//
// The world game also had a globeView flag. There is no globe here — one country
// fits a flat projection without distorting the distances the game runs on — so
// that field is gone rather than left dead.
export const DIFFICULTIES = {
  hard:     { maxGuesses: 6, showGrid: false, showRings: false, showDots: false, showBearing: false },
  moderate: { maxGuesses: 6, showGrid: true,  showRings: false, showDots: true,  showBearing: true  },
  easy:     { maxGuesses: 6, showGrid: true,  showRings: true,  showDots: true,  showBearing: true  },
};
