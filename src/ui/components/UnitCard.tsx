import type { ReactNode } from 'react'
import { AFFINITY_LABEL, TYPE_DEFS, affinityEntries, primaryAffinity, unitPower, unitStats, type AffinityPoints, type Unit } from '../../game'
import { AFFINITY_COLOR, AFFINITY_GLYPH, RARITY_COLOR, TYPE_GLYPH } from '../theme'

interface Props {
  unit: Unit
  footer?: ReactNode
  compact?: boolean
  dim?: boolean
}

export function UnitCard({ unit, footer, compact, dim }: Props) {
  const stats = unitStats(unit)
  const type = TYPE_DEFS[unit.type]
  return (
    <article
      className={`unit-card ${compact ? 'compact' : ''} ${dim ? 'dim' : ''}`}
      style={{ '--rarity': RARITY_COLOR[unit.rarity], '--element': AFFINITY_COLOR[primaryAffinity(unit.affinities)] } as React.CSSProperties}
      title={`${type.label} (${type.damage} damage) · ${type.abilityLabel}: ${type.abilityText}`}
    >
      <div className="uc-head">
        <span className="uc-glyph" aria-hidden data-help={`type:${unit.type}`}>
          {TYPE_GLYPH[unit.type]}
        </span>
        <div className="uc-id">
          <div className="uc-name">{unit.name}</div>
          <div className="uc-tags">
            <span className="uc-rarity" data-help={`rarity:${unit.rarity}`}>
              {unit.rarity}
            </span>
            <span data-help={`type:${unit.type}`}>{type.label}</span>
          </div>
        </div>
        <div className="uc-level" data-help={unit.battlesSurvived > 0 ? 'veteran' : 'level'} title={`Level ${unit.level}${unit.battlesSurvived ? ` · survived ${unit.battlesSurvived}` : ''}`}>
          <span>Lv</span>
          {unit.level}
          {unit.battlesSurvived > 0 && <i className="uc-vet">{'★'.repeat(Math.min(3, unit.battlesSurvived))}</i>}
        </div>
      </div>
      <AffinityChips points={unit.affinities} />
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

export function AffinityChips({ points }: { points: AffinityPoints }) {
  return (
    <div className="aff-chips">
      {affinityEntries(points).map(([a, n]) => (
        <span key={a} className="aff-chip" data-help={`affinity:${a}`} style={{ '--aff': AFFINITY_COLOR[a] } as React.CSSProperties}>
          <i>{AFFINITY_GLYPH[a]}</i>
          {AFFINITY_LABEL[a]}
          <b>{n}</b>
        </span>
      ))}
    </div>
  )
}

function Stat({ k, v, strong }: { k: string; v: number | string; strong?: boolean }) {
  return (
    <div className={strong ? 'strong' : ''} data-help={`stat:${k.toLowerCase()}`}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  )
}
