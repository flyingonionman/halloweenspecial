/**
 * Minimal observable store. The game core knows nothing about React; the UI
 * subscribes via useSyncExternalStore (see src/ui/useGame.ts).
 */
import { newGame, type GameState } from './game'

export type Action = (s: GameState) => GameState

export interface GameStore {
  get(): GameState
  dispatch(action: Action): void
  reset(seed?: number): void
  subscribe(listener: () => void): () => void
}

export function createGameStore(seed?: number): GameStore {
  let state = newGame(seed)
  const listeners = new Set<() => void>()
  const set = (next: GameState) => {
    if (next === state) return
    state = next
    listeners.forEach((l) => l())
  }
  return {
    get: () => state,
    dispatch: (action) => set(action(state)),
    reset: (s) => set(newGame(s)),
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}
