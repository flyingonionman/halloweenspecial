import type { BuildingDef, BuildingId, Cost } from '../../game'
import { costParts } from '../format'
import { AFFINITY_COLOR, AFFINITY_GLYPH, KIND_COLOR, RESOURCE_COLOR, RESOURCE_GLYPH } from '../theme'


const GLYPH: Record<BuildingId, string> = {
  capital: '♜',
  farm: '❦',
  fishery: '≈',
  market: '⚖',
  'trading-post': '⇄',
  mine: '⛏',
  church: '☀',
  crypt: '☾',
  academy: '✦',
  barracks: '⚔',
  walls: '▦',
  armory: '⛨',
}

export function BuildingGlyph({ def }: { def: BuildingDef }) {
  if (def.affinity) return <span style={{ color: AFFINITY_COLOR[def.affinity] }}>{AFFINITY_GLYPH[def.affinity]}</span>
  return <span style={{ color: KIND_COLOR[def.kind] }}>{GLYPH[def.id]}</span>
}

/** Cost chips, shown plainly; what's missing is reported when you try to pay (see toast.tsx). */
export function CostChips({ cost }: { cost: Cost }) {
  return (
    <span className="cost">
      {costParts(cost).map(({ key, amount }) => (
        <span key={key} style={{ color: RESOURCE_COLOR[key] }}>
          {RESOURCE_GLYPH[key]}
          {amount}
        </span>
      ))}
    </span>
  )
}
