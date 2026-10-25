import type { BuildingDef, BuildingId, Cost } from '../../game'
import { useGame } from '../useGame'
import { costParts } from '../format'
import { AFFINITY_COLOR, AFFINITY_GLYPH, KIND_COLOR, RESOURCE_COLOR, RESOURCE_GLYPH } from '../theme'

const GLYPH: Partial<Record<BuildingId, string>> = { capital: '♜', farm: '❦', market: '⚖', 'trading-post': '⇄', barracks: '⚔', walls: '▦', armory: '⛨' }

export function BuildingGlyph({ def }: { def: BuildingDef }) {
  if (def.affinity) return <span style={{ color: AFFINITY_COLOR[def.affinity] }}>{AFFINITY_GLYPH[def.affinity]}</span>
  if (def.kind === 'extractor') {
    const r = Object.keys(def.base)[0] as keyof typeof RESOURCE_GLYPH
    return <span style={{ color: RESOURCE_COLOR[r] }}>{RESOURCE_GLYPH[r]}</span>
  }
  return <span style={{ color: KIND_COLOR[def.kind] }}>{GLYPH[def.id] ?? '◆'}</span>
}

/** Cost chips; amounts you can't afford are struck through. */
export function CostChips({ cost }: { cost: Cost }) {
  const [s] = useGame()
  return (
    <span className="cost">
      {costParts(cost).map(({ key, amount }) => (
        <span key={key} className={s.stock[key as keyof typeof s.stock] >= amount ? '' : 'short'} style={{ color: RESOURCE_COLOR[key] }}>
          {RESOURCE_GLYPH[key]}
          {amount}
        </span>
      ))}
    </span>
  )
}
