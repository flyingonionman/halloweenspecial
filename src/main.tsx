import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createGameStore } from './game'
import { GameContext } from './ui/useGame'
import { App } from './ui/App'
import './ui/styles.css'

const seedParam = new URLSearchParams(location.search).get('seed')
const store = createGameStore(seedParam ? Number(seedParam) : undefined)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameContext value={store}>
      <App />
    </GameContext>
  </StrictMode>,
)
