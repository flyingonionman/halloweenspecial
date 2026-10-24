import { createContext, useContext, useSyncExternalStore } from 'react'
import type { GameState, GameStore } from '../game'

export const GameContext = createContext<GameStore | null>(null)

export function useStore(): GameStore {
  const store = useContext(GameContext)
  if (!store) throw new Error('useStore outside GameContext')
  return store
}

export function useGame(): [GameState, GameStore['dispatch']] {
  const store = useStore()
  const state = useSyncExternalStore(store.subscribe, store.get)
  return [state, store.dispatch]
}
