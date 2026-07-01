// Maps a completed round outcome to a point value (0–200).
// Called once by index.html at endRound(); the result is stored in roundResults[]
// and summed to produce the session total (max 1000 across 5 rounds).
//
// Scoring table:
//   1–2 guesses → 200   (perfect or near-perfect)
//   3 guesses   → 180
//   4 guesses   → 120
//   5 guesses   → 80
//   6 guesses   → 30
//   failed      → 0     (all 6 guesses wrong; target is revealed)
export function calcScore(guessCount, won) {
  if (!won) return 0;
  if (guessCount <= 2) return 200;
  if (guessCount === 3) return 180;
  if (guessCount === 4) return 120;
  if (guessCount === 5) return 80;
  return 30; // 6 guesses
}
