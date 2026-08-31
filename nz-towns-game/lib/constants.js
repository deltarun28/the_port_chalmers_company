// Values shared by the modules that turn a distance into something the player
// sees. Kept in one place so the heat bar, the share card and the rings cannot
// drift apart.

// The longest distance between any two towns in towns.json (Cape Reinga to
// Bluff is 1,401km; the furthest actual pair is 1,358km). The world game used
// 20,000km — half the earth's circumference — and every scale in the UI was
// built around that number, so all of them have to be rescaled here.
export const MAX_DISTANCE = 1400;
