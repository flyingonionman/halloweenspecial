/**
 * A unit as a tall card: the full-body render fills it, rarity and type chips
 * top left, name bottom left, affinity and a corner chip (price, level…)
 * bottom right. Hovering animates the figure. Used by the muster and troop grids.
 */
import { useState, type ReactNode } from 'react'
import { TYPE_DEFS, type Unit } from '../../game'
import { RARITY_COLOR, TYPE_GLYPH } from '../theme'
import { Portrait } from './Portrait'
import { AffinityBadge } from './UnitCard'

export function FigureCard({
  unit,
  corner,
  dim,
  className = '',
  ...rest
}: { unit: Unit; corner?: ReactNode; dim?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [hover, setHover] = useState(false)
  return (
    <button
      {...rest}
      className={`figure-card ${dim ? 'poor' : ''} ${className}`}
      style={{ '--frame': RARITY_COLOR[unit.rarity] } as React.CSSProperties}
      title={unit.name}
      onMouseEnter={(e) => {
        setHover(true)
        rest.onMouseEnter?.(e)
      }}
      onMouseLeave={(e) => {
        setHover(false)
        rest.onMouseLeave?.(e)
      }}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <Portrait unit={unit} animate={hover} bare />
      <span className="fc-top">
        <span className="fc-chip" style={{ color: RARITY_COLOR[unit.rarity] }}>
          {unit.rarity}
        </span>
        <span className="fc-chip">
          {TYPE_GLYPH[unit.type]} {TYPE_DEFS[unit.type].label}
        </span>
      </span>
      <span className="fc-bottom">
        <span className="fc-name">{unit.name.split(' ').slice(0, 2).join(' ')}</span>
        <span className="fc-chips">
          <AffinityBadge points={unit.affinities} />
          {corner && <span className="fc-chip fc-corner">{corner}</span>}
        </span>
      </span>
    </button>
  )
}
