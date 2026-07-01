// Core game state for a single round (one mystery capital).
// Pure logic — no DOM, no fetches.  index.html creates a fresh instance
// at the start of each of the 5 rounds via createGame(target, distances, difficulty).
//
// State shape returned by submitGuess() and getState():
//   {
//     target:      capital object (the answer),
//     guesses:     [ { ...capitalObj, distance, correct }, … ],
//     attempts:    number of guesses made,
//     maxAttempts: from DIFFICULTIES[difficulty].maxGuesses,
//     status:      'playing' | 'won' | 'lost'
//   }
//
// distances is the pre-loaded distances.json map (O(1) lookup).
// Key format: "GuessCity→TargetCity" (matches the generated table).

import { DIFFICULTIES } from './difficulty.js';

export function createGame(target, distances, difficulty = 'moderate') {
  const { maxGuesses } = DIFFICULTIES[difficulty];
  const state = {
    target,
    guesses: [],
    attempts: 0,
    maxAttempts: maxGuesses,
    status: 'playing',
  };

  function submitGuess(capital) {
    if (state.status !== 'playing') return { ...state };

    const key = `${capital.capital}→${state.target.capital}`;
    const distance = distances[key] ?? null;
    const isCorrect = capital.capital === state.target.capital;

    state.guesses.push({ ...capital, distance, correct: isCorrect });
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
