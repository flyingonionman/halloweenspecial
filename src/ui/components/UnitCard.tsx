import type { ReactNode } from 'react'
import { CLASS_DEFS, ELEMENT_DEFS, unitPower, unitStats, type Unit } from '../../game'
import { CLASS_GLYPH, ELEMENT_COLOR, RARITY_COLOR } from '../theme'

interface Props {
  unit: Unit
  footer?: ReactNode
  compact?: boolean
  dim?: boolean
}

export function UnitCard({ unit, footer, compact, dim }: Props) {
  const stats = unitStats(unit)
  const cls = CLASS_DEFS[unit.cls]
  const el = ELEMENT_DEFS[unit.element]
  return (
    <article
      className={`unit-card ${compact ? 'compact' : ''} ${dim ? 'dim' : ''}`}
      style={{ '--rarity': RARITY_COLOR[unit.rarity], '--element': ELEMENT_COLOR[unit.element] } as React.CSSProperties}
      title={`${cls.abilityLabel}: ${cls.abilityText}\n${el.label}: ${el.passiveText}`}
    >
      <div className="uc-head">
        <span className="uc-glyph" aria-hidden>
          {CLASS_GLYPH[unit.cls]}
        </span>
        <div className="uc-id">
          <div className="uc-name">{unit.name}</div>
          <div className="uc-tags">
            <span className="uc-rarity">{unit.rarity}</span>
            <span>{el.label}</span>
            <span>{cls.label}</span>
          </div>
        </div>
        <div className="uc-level" title={`Level ${unit.level}${unit.battlesSurvived ? ` · survived ${unit.battlesSurvived}` : ''}`}>
          <span>Lv</span>
          {unit.level}
          {unit.battlesSurvived > 0 && <i className="uc-vet">{'★'.repeat(Math.min(3, unit.battlesSurvived))}</i>}
        </div>
      </div>
      {!compact && (
        <dl className="uc-stats">
          <Stat k="HP" v={stats.hp} />
          <Stat k="ATK" v={stats.atk} />
          <Stat k="DEF" v={stats.def} />
          <Stat k="RNG" v={stats.range.toFixed(1)} />
          <Stat k="PWR" v={unitPower(unit)} strong />
        </dl>
      )}
      {footer && <div className="uc-foot">{footer}</div>}
    </article>
  )
}

function Stat({ k, v, strong }: { k: string; v: number | string; strong?: boolean }) {
  return (
    <div className={strong ? 'strong' : ''}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  )
}
