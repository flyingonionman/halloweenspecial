/**
 * The Build tab: one flat list in loose sections → a detail view with every
 * stat and a turning 3D model. "Place" arms the building for the board, where
 * each valid tile previews its output.
 */
import { useMemo, useState } from 'react'
import {
  BUILDINGS,
  BUILDING_DEFS,
  TERRAIN_DEFS,
  baseOutput,
  buildCost,
  buildingName,
  type AdjacencyRule,
  type BuildingDef,
  type BuildingId,
  type BuildingKind,
  type TerrainId,
} from '../../game'
import { useGame } from '../useGame'
import { BuildingGlyph, CostChips } from '../components/BuildingBits'
import { fmtOutputs } from '../format'
import { useRequirementCheck } from '../toast'
import { AFFINITY_COLOR, KIND_COLOR, TERRAIN_COLOR } from '../theme'
import { BuildingPreview } from './Board3D'

export const SECTIONS: { kind: BuildingKind; label: string }[] = [
  { kind: 'gather', label: 'Gathering' },
  { kind: 'civic', label: 'Civic' },
  { kind: 'research', label: 'Research' },
  { kind: 'faith', label: 'Faith' },
  { kind: 'military', label: 'Military' },
]

const KIND_LABEL: Record<BuildingKind, string> = {
  capital: 'Capital',
  gather: 'Gathering',
  civic: 'Civic',
  faith: 'Faith',
  military: 'Military',
  research: 'Research',
}

const accent = (b: BuildingDef) => (b.affinity ? AFFINITY_COLOR[b.affinity] : KIND_COLOR[b.kind])

/** What the list shows on the right: a fixed output, or what it does. */
function outputSummary(b: BuildingDef) {
  if (b.id === 'mine') return 'tile’s resource'
  if (b.id === 'academy') return 'research'
  const base = baseOutput(b, 'plains')
  return Object.keys(base).length ? fmtOutputs(base) : '—'
}

interface Props {
  armed: BuildingId | null
  onArm: (id: BuildingId | null) => void
}

export function BuildPanel({ armed, onArm }: Props) {
  const [detail, setDetail] = useState<BuildingId | null>(null)

  if (detail) return <BuildingDetail id={detail} armed={armed === detail} onBack={() => setDetail(null)} onArm={onArm} />

  return (
    <div className="build-tab">
      <p className="muted">Select a tile to see it and build there, or open a building to place it.</p>
      {SECTIONS.map((sec) => (
        <section key={sec.kind}>
          <h4 className="bp-tier" data-help={`kind:${sec.kind}`}>
            {sec.label}
          </h4>
          <div className="bp-list">
            {BUILDINGS.filter((b) => b.kind === sec.kind).map((b) => (
              <Row key={b.id} b={b} armed={armed === b.id} onOpen={() => setDetail(b.id)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function useCounts() {
  const [s] = useGame()
  return useMemo(() => {
    const m = new Map<BuildingId, number>()
    for (const t of s.map.tiles) if (t.building) m.set(t.building.id, (m.get(t.building.id) ?? 0) + 1)
    return m
  }, [s.map])
}

function Row({ b, armed, onOpen }: { b: BuildingDef; armed: boolean; onOpen: () => void }) {
  const [s] = useGame()
  const counts = useCounts()
  const n = counts.get(b.id) ?? 0
  const level = s.map.tiles.find((t) => t.building?.id === b.id)?.building?.level
  const owned = n > 0 ? (b.unique ? (b.maxLevel > 1 ? `Lv${level}` : 'built') : `×${n}`) : null
  return (
    <button className={`bp-row ${armed ? 'armed' : ''}`} style={{ '--accent': accent(b) } as React.CSSProperties} onClick={onOpen}>
      <span className="bp-row-glyph">
        <BuildingGlyph def={b} />
      </span>
      <span className="bp-row-name">
        {b.name}
        {owned && <small className="bp-row-owned">{owned}</small>}
      </span>
      <span className="bp-row-right">
        <CostChips cost={buildCost(s, b.id)} />
        <span className="bp-row-out">{outputSummary(b)}</span>
      </span>
    </button>
  )
}

function ruleText(r: AdjacencyRule, self: BuildingDef) {
  const who =
    'terrain' in r.per
      ? (typeof r.per.terrain === 'string' ? [r.per.terrain] : r.per.terrain).map((t) => TERRAIN_DEFS[t].label).join(' or ')
      : 'building' in r.per
        ? BUILDING_DEFS[r.per.building].name
        : self.id === 'mine'
          ? 'tile of the same terrain'
          : 'same terrain'
  return { gain: r.add === 'tile' ? '+1 of the tile’s resource' : fmtOutputs(r.add), who, cap: r.cap }
}

function BuildingDetail({ id, armed, onBack, onArm }: { id: BuildingId; armed: boolean; onBack: () => void; onArm: Props['onArm'] }) {
  const [s] = useGame()
  const b = BUILDING_DEFS[id]
  const built = s.map.tiles.filter((t) => t.building?.id === id)
  const done = !!b.unique && built.length > 0
  const boosts = Object.values(BUILDING_DEFS).filter((o) => o.id !== id && o.adjacency.some((r) => 'building' in r.per && r.per.building === id))
  const cost = buildCost(s, id)
  const check = useRequirementCheck()

  const placeTerrain: TerrainId = b.allowed === 'any' ? 'plains' : (b.allowed[0] ?? 'plains')

  return (
    <div className="bp-detail" style={{ '--accent': accent(b) } as React.CSSProperties}>
      <header>
        <button className="bp-back" onClick={onBack} aria-label="Back to the list">
          ←
        </button>
        <div>
          <span className="help-kind">{KIND_LABEL[b.kind]}</span>
          <h3 data-help={`building:${id}`}>
            <BuildingGlyph def={b} /> {b.name}
          </h3>
        </div>
      </header>
      <div className="bp-model">
        <BuildingPreview id={id} terrain={placeTerrain} />
      </div>
      <button
        className={`btn ${armed ? 'btn-war' : 'btn-primary'} bp-place`}
        disabled={done}
        onClick={(e) => (armed ? onArm(null) : check(e.currentTarget, cost) && onArm(id))}
      >
        {done ? 'Already built' : armed ? 'Placing… click a tile (Esc)' : 'Place on the board'}
      </button>
      <p className="bp-text">{b.text}</p>

      <dl className="bp-stats">
        <div>
          <dt>Cost</dt>
          <dd>
            <CostChips cost={cost} />
          </dd>
        </div>
        <div>
          <dt>Output</dt>
          <dd className="mono">{id === 'mine' ? 'raw yield + level' : outputSummary(b)}</dd>
        </div>
        <div className="wide">
          <dt>Placed on</dt>
          <dd>
            {b.allowed === 'any'
              ? 'any land'
              : b.allowed.map((t) => (
                  <span key={t} className="bp-terrain" data-help={`terrain:${t}`}>
                    <i style={{ background: TERRAIN_COLOR[t] }} /> {TERRAIN_DEFS[t].label}
                  </span>
                ))}
            {b.unique && <span className="lex-tag">one only</span>}
          </dd>
        </div>
      </dl>

      {b.adjacency.length > 0 && (
        <ul className="bp-adj">
          {b.adjacency.map((r, i) => {
            const t = ruleText(r, b)
            return (
              <li key={i}>
                <b className="mono">{t.gain}</b> per neighbouring <b>{t.who}</b>
                {t.cap ? <small> (up to {t.cap})</small> : null}
              </li>
            )
          })}
        </ul>
      )}
      {boosts.length > 0 && <p className="lex-feeds">Boosts neighbouring {boosts.map((o) => o.name).join(', ')}.</p>}
      {id === 'academy' && <p className="lex-feeds">Open a built academy’s tile to dedicate it. Offerings cost the essences of the affinity you choose.</p>}
      {b.maxLevel > 1 && id !== 'academy' && (
        <ol className="lex-levels">
          {Array.from({ length: b.maxLevel }, (_, i) => (
            <li key={i}>
              <span className="lex-lv">{b.levelNames ? buildingName(id, i + 1) : `Lv${i + 1}`}</span>
              <CostChips cost={b.cost(i + 1)} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
