/**
 * The build panel along the bottom of the board: group tabs → a gallery of
 * buildings → a detail view with every stat and a turning 3D model. "Place"
 * arms the building for the board, where each valid tile previews its output.
 */
import { useMemo, useState } from 'react'
import {
  BUILDINGS,
  BUILDING_DEFS,
  CONFIG,
  TERRAIN_DEFS,
  buildBlock,
  evaluateBuilding,
  ownedTiles,
  type AdjacencyRule,
  type BuildingDef,
  type BuildingId,
  type BuildingKind,
} from '../../game'
import { useGame } from '../useGame'
import { BuildingGlyph, CostChips } from '../components/BuildingBits'
import { fmtOutputs, outputScore } from '../format'
import { AFFINITY_COLOR, KIND_COLOR, TERRAIN_COLOR } from '../theme'
import { BuildingPreview } from './Board3D'

const GROUPS: { kind: BuildingKind; label: string }[] = [
  { kind: 'civic', label: 'Civic' },
  { kind: 'extractor', label: 'Extract' },
  { kind: 'military', label: 'Military' },
  { kind: 'research', label: 'Academies' },
]

const KIND_LABEL: Record<BuildingKind, string> = {
  capital: 'Capital',
  civic: 'Civic',
  extractor: 'Extractor',
  military: 'Military',
  research: 'Academy',
}

const accent = (b: BuildingDef) => (b.affinity ? AFFINITY_COLOR[b.affinity] : KIND_COLOR[b.kind])

interface Props {
  armed: BuildingId | null
  onArm: (id: BuildingId | null) => void
}

export function BuildPanel({ armed, onArm }: Props) {
  const [group, setGroup] = useState<BuildingKind>('civic')
  const [detail, setDetail] = useState<BuildingId | null>(null)
  const [open, setOpen] = useState(true)

  return (
    <div className={`build-panel ${open ? '' : 'collapsed'} ${detail && open ? 'detail' : ''}`} data-help="buildbar">
      <div className="bp-tabs">
        {GROUPS.map((g) => (
          <button
            key={g.kind}
            className={group === g.kind && open ? 'on' : ''}
            style={{ '--kind': KIND_COLOR[g.kind] } as React.CSSProperties}
            onClick={() => {
              setGroup(g.kind)
              setDetail(null)
              setOpen(true)
            }}
          >
            {g.label}
          </button>
        ))}
        <button className="bp-toggle" aria-label={open ? 'Collapse build panel' : 'Expand build panel'} onClick={() => setOpen(!open)}>
          {open ? '▾' : '▴'}
        </button>
      </div>
      {open && (
        <div className="bp-body">
          {detail ? (
            <BuildingDetail id={detail} armed={armed === detail} onBack={() => setDetail(null)} onArm={onArm} />
          ) : (
            <Gallery kind={group} armed={armed} onOpen={setDetail} />
          )}
        </div>
      )}
    </div>
  )
}

function Gallery({ kind, armed, onOpen }: { kind: BuildingKind; armed: BuildingId | null; onOpen: (id: BuildingId) => void }) {
  const [s] = useGame()
  const counts = useMemo(() => {
    const m = new Map<BuildingId, number>()
    for (const t of s.map.tiles) if (t.building) m.set(t.building.id, (m.get(t.building.id) ?? 0) + 1)
    return m
  }, [s.map])

  return (
    <div className="bp-gallery">
      {BUILDINGS.filter((b) => b.kind === kind).map((b) => {
        const affordable = (Object.entries(b.cost(1)) as [keyof typeof s.stock, number][]).every(([k, v]) => s.stock[k] >= v)
        const n = counts.get(b.id) ?? 0
        const done = !!b.unique && n > 0
        return (
          <button
            key={b.id}
            className={`bp-card ${armed === b.id ? 'armed' : ''} ${affordable ? '' : 'poor'} ${done ? 'done' : ''}`}
            style={{ '--accent': accent(b) } as React.CSSProperties}
            onClick={() => onOpen(b.id)}
          >
            <span className="bp-card-art">
              <BuildingGlyph def={b} />
            </span>
            <span className="bp-card-name">{b.name}</span>
            <span className="bp-card-out">{b.kind === 'research' ? `${b.affinity} level` : fmtOutputs(b.base)}</span>
            <CostChips cost={b.cost(1)} />
            {n > 0 && <span className="bp-card-badge">{done ? 'built' : `×${n}`}</span>}
          </button>
        )
      })}
    </div>
  )
}

function ruleText(r: AdjacencyRule, self: BuildingDef) {
  const who =
    'terrain' in r.per
      ? TERRAIN_DEFS[r.per.terrain].label
      : 'building' in r.per
        ? BUILDING_DEFS[r.per.building].name
        : self.allowed !== 'any' && self.allowed[0]
          ? TERRAIN_DEFS[self.allowed[0]].label
          : 'same terrain'
  return { gain: fmtOutputs(r.add), who, cap: r.cap }
}

function BuildingDetail({ id, armed, onBack, onArm }: { id: BuildingId; armed: boolean; onBack: () => void; onArm: Props['onArm'] }) {
  const [s] = useGame()
  const b = BUILDING_DEFS[id]
  const built = s.map.tiles.filter((t) => t.building?.id === id)
  const done = !!b.unique && built.length > 0
  const boosts = Object.values(BUILDING_DEFS).filter((o) => o.id !== id && o.adjacency.some((r) => 'building' in r.per && r.per.building === id))

  // Best spot you own right now, with adjacency applied.
  const best = useMemo(() => {
    let top: { score: number; text: string; terrain: string } | null = null
    for (const t of ownedTiles(s.map)) {
      const block = buildBlock(s, t, id)
      if (block && block !== 'cost') continue
      const o = evaluateBuilding(s.map, t, id).output
      const score = outputScore(o)
      if (!top || score > top.score) top = { score, text: fmtOutputs(o), terrain: TERRAIN_DEFS[t.terrain].label }
    }
    return top
  }, [s, id])

  const placeTerrain = b.allowed === 'any' ? 'plains' : (b.allowed[0] ?? 'plains')

  return (
    <div className="bp-detail" style={{ '--accent': accent(b) } as React.CSSProperties}>
      <div className="bp-info">
        <header>
          <button className="bp-back" onClick={onBack} aria-label="Back to gallery">
            ←
          </button>
          <div>
            <span className="help-kind">{KIND_LABEL[b.kind]}</span>
            <h3 data-help={`building:${id}`}>
              <BuildingGlyph def={b} /> {b.name}
            </h3>
          </div>
          <button className={`btn ${armed ? 'btn-war' : 'btn-primary'} bp-place`} disabled={done} onClick={() => onArm(armed ? null : id)}>
            {done ? 'Already built' : armed ? 'Placing… (Esc)' : 'Place'}
          </button>
        </header>
        <p className="bp-text">{b.text}</p>

        <dl className="bp-stats">
          <div>
            <dt>Cost</dt>
            <dd>
              <CostChips cost={b.cost(1)} />
            </dd>
          </div>
          {b.kind !== 'research' && (
            <div>
              <dt>Base output</dt>
              <dd className="mono">{fmtOutputs(b.base)}</dd>
            </div>
          )}
          <div>
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
          <div>
            <dt>You have</dt>
            <dd>{built.length || 'none'}</dd>
          </div>
          <div className="wide">
            <dt>Best spot now</dt>
            <dd className="mono">{best ? `${best.text} on ${best.terrain}` : 'no valid tile in your land'}</dd>
          </div>
        </dl>

        <h4>Adjacency</h4>
        {b.adjacency.length ? (
          <ul className="bp-adj">
            {b.adjacency.map((r, i) => {
              const t = ruleText(r, b)
              return (
                <li key={i}>
                  <b className="mono">{t.gain}</b> for each neighbouring <b>{t.who}</b>
                  {t.cap ? <small> (up to {t.cap})</small> : null}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="muted">No adjacency bonus: place it anywhere it fits.</p>
        )}
        {boosts.length > 0 && <p className="lex-feeds">Also boosts neighbouring {boosts.map((o) => o.name).join(', ')}.</p>}

        {b.kind === 'research' && (
          <>
            <h4>Upgrade tree</h4>
            <ol className="lex-levels">
              {Array.from({ length: b.maxLevel }, (_, i) => {
                const L = i + 1
                const A = CONFIG.affinity
                return (
                  <li key={L}>
                    <span className="lex-lv">Lv{L}</span>
                    <CostChips cost={b.cost(L)} />
                    <span className="lex-lv-gives">
                      synergies ×{A.levelMult[L]} · carriers +{Math.round(A.combatBonusPerLevel * L * 100)}% HP/ATK · births +{A.birthWeight.perLevel * L}
                    </span>
                  </li>
                )
              })}
            </ol>
          </>
        )}
      </div>
      <div className="bp-model">
        <BuildingPreview id={id} terrain={placeTerrain} />
      </div>
    </div>
  )
}
