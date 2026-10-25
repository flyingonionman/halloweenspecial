import { useState } from 'react'
import { canUpgrade, upgradeUnit, unitUpgradeCost, type Unit } from '../../game'
import { useGame } from '../useGame'
import { CostChips } from './BuildingBits'

/**
 * Levelling a unit is expensive, so it takes a double-click. A single click
 * just says so. The full cost (gold + materials) is always shown.
 */
export function LevelUpButton({ unit, compact }: { unit: Unit; compact?: boolean }) {
  const [s, dispatch] = useGame()
  const [hint, setHint] = useState(false)
  const cost = unitUpgradeCost(s, unit)
  if (!cost) return <span className="lvl-max">Max level</span>
  return (
    <button
      className={`btn btn-small lvl-btn ${hint ? 'hint' : ''}`}
      data-help="level"
      disabled={!canUpgrade(s, unit.uid)}
      title="Double-click to level up"
      onClick={() => {
        setHint(true)
        window.setTimeout(() => setHint(false), 1400)
      }}
      onDoubleClick={() => {
        setHint(false)
        dispatch((st) => upgradeUnit(st, unit.uid))
      }}
    >
      <span className="lvl-label">{hint ? 'double-click' : compact ? `Lv${unit.level + 1}` : `Level ${unit.level} → ${unit.level + 1}`}</span>
      <CostChips cost={cost} />
    </button>
  )
}
