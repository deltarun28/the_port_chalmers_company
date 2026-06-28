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

    return { ...state, guesses: [...state.guesses] };
  }

  function getState() {
    return { ...state, guesses: [...state.guesses] };
  }

  return { submitGuess, getState };
}
