export function calcScore(guessCount, won) {
  if (!won) return 0;
  if (guessCount <= 2) return 200;
  if (guessCount === 3) return 180;
  if (guessCount === 4) return 120;
  if (guessCount === 5) return 80;
  return 30; // 6 guesses
}
