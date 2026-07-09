// Converts a flag emoji to a flag-icons CSS span for cross-browser rendering.
// Flag emojis (e.g. 🇫🇷) are pairs of Unicode Regional Indicator symbols
// (U+1F1E6–U+1F1FF). Subtracting 0x1F1E6 and adding 'A' (0x41) gives the
// ISO 3166-1 alpha-2 letter. flag-icons uses lowercase codes: fi-fr, fi-nz, etc.
// Falls back to the raw emoji string if the input isn't a two-character flag pair.
export function renderFlag(emoji) {
  const pts = [...emoji].map(c => c.codePointAt(0));
  if (pts.length !== 2 || pts[0] < 0x1F1E6 || pts[0] > 0x1F1FF) return emoji;
  const iso = pts.map(p => String.fromCharCode(p - 0x1F1E6 + 65)).join('').toLowerCase();
  return `<span class="fi fi-${iso}"></span>`;
}
