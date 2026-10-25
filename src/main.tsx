import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createGameStore } from './game'
import { GameContext } from './ui/useGame'
import { App } from './ui/App'
import './ui/styles.css'
import './ui/turn.css'
import './ui/help/help.css'
import './ui/sheets.css'
import './ui/panels.css'
import './ui/layout.css'

const seedParam = new URLSearchParams(location.search).get('seed')
const store = createGameStore(seedParam ? Number(seedParam) : undefined)

// Dev only: drive the game from the console or test scripts, e.g.
// __hs.store.dispatch((s) => __hs.game.placeBuilding(s, { q: 1, r: 0 }, 'academy'))
if (import.meta.env.DEV) void import('./game').then((game) => Object.assign(window, { __hs: { store, game } }))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameContext value={store}>
      <App />
    </GameContext>
  </StrictMode>,
)
