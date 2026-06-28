export function createGame(target, distances, maxAttempts = 6) {
  const state = {
    target,
    guesses: [],
    attempts: 0,
    maxAttempts,
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
