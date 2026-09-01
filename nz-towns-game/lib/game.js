// Core game state for a single round (one mystery town).
// Pure logic — no DOM, no fetches.  index.html creates a fresh instance
// at the start of each of the 5 rounds via createGame(target, difficulty).
//
// State shape returned by submitGuess() and getState():
//   {
//     target:      town object (the answer),
//     guesses:     [ { ...townObj, distance, bearing, correct }, … ],
//     attempts:    number of guesses made,
//     maxAttempts: from DIFFICULTIES[difficulty].maxGuesses,
//     status:      'playing' | 'won' | 'lost'
//   }

import { DIFFICULTIES } from './difficulty.js';
import { distanceKm, bearingDeg } from './distance.js';

export function createGame(target, difficulty = 'moderate') {
  const { maxGuesses } = DIFFICULTIES[difficulty];
  const state = {
    target,
    guesses: [],
    attempts: 0,
    maxAttempts: maxGuesses,
    status: 'playing',
  };

  function submitGuess(town) {
    if (state.status !== 'playing') return { ...state };

    const isCorrect = town.name === state.target.name;
    const distance = isCorrect ? 0 : distanceKm(town, state.target);
    // Bearing is always computed and stored; whether the player is shown it is
    // a difficulty decision made in the UI, not here.
    const bearing = isCorrect ? null : bearingDeg(town, state.target);

    state.guesses.push({ ...town, distance, bearing, correct: isCorrect });
    state.attempts++;

    if (isCorrect) {
      state.status = 'won';
    } else if (state.attempts >= state.maxAttempts) {
      state.status = 'lost';
    }

    // Return copies so callers cannot accidentally mutate internal state
    return { ...state, guesses: [...state.guesses] };
  }

  function getState() {
    return { ...state, guesses: [...state.guesses] };
  }

  return { submitGuess, getState };
}
