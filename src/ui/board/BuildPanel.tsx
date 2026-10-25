/**
 * The Build tab: group tabs → a gallery of buildings → a detail view with
 * every stat and a turning 3D model. "Place" arms the building for the board,
 * where each valid tile previews its output.
 */
import { useMemo, useState } from 'react'
import {
  AFFINITY_DEFS,
  AFFINITY_LABEL,
  BUILDINGS,
  BUILDING_DEFS,
  CONFIG,
  TERRAIN_DEFS,
  buildBlock,
  city,
  evaluateBuilding,
  isUnlocked,
  ownedTiles,
  type AdjacencyRule,
  type BuildingDef,
  type BuildingId,
  type BuildingKind,
} from '../../game'
import { useGame } from '../useGame'
import { BuildingGlyph, CostChips } from '../components/BuildingBits'
import { fmtOutputs, outputScore } from '../format'
import { AFFINITY_COLOR, AFFINITY_GLYPH, KIND_COLOR, TERRAIN_COLOR } from '../theme'
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
  const [detail, setDetail] = useState<BuildingId | null>(null)
  const [s] = useGame()
  const levels = city(s).affinityLevels

  if (detail) return <BuildingDetail id={detail} armed={armed === detail} onBack={() => setDetail(null)} onArm={onArm} />

  // One list: everything you can build right now, in loose sections. Locked academies stay out of sight.
  const sections: { label: string; help?: string; items: BuildingDef[] }[] = [
    ...GROUPS.filter((g) => g.kind !== 'research').map((g) => ({ label: g.label, help: `kind:${g.kind}`, items: BUILDINGS.filter((b) => b.kind === g.kind) })),
    ...[1, 2, 3, 4].map((tier) => ({
      label: `Academies · tier ${tier}`,
      help: 'kind:research',
      items: BUILDINGS.filter((b) => b.affinity && AFFINITY_DEFS[b.affinity].tier === tier && isUnlocked(b.affinity, levels)),
    })),
  ].filter((sec) => sec.items.length > 0)

  return (
    <div className="build-tab">
      {sections.map((sec) => (
        <section key={sec.label}>
          <h4 className="bp-tier" data-help={sec.help}>
            {sec.label}
          </h4>
          <div className="bp-list">
            {sec.items.map((b) => (
              <Card key={b.id} b={b} armed={armed === b.id} onOpen={() => setDetail(b.id)} note={b.affinity ? `${AFFINITY_GLYPH[b.affinity]} ${AFFINITY_LABEL[b.affinity]}` : undefined} />
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

function Card({ b, armed, onOpen, note, locked }: { b: BuildingDef; armed: boolean; onOpen: () => void; note?: string; locked?: boolean }) {
  const [s] = useGame()
  const counts = useCounts()
  const n = counts.get(b.id) ?? 0
  const level = s.map.tiles.find((t) => t.building?.id === b.id)?.building?.level
  const affordable = (Object.entries(b.cost(1)) as [keyof typeof s.stock, number][]).every(([k, v]) => s.stock[k] >= v)
  const owned = n > 0 ? (b.maxLevel > 1 ? `Lv${level}` : b.unique ? 'built' : `×${n}`) : null
  return (
    <button
      className={`bp-row ${armed ? 'armed' : ''} ${affordable ? '' : 'poor'} ${locked ? 'locked' : ''}`}
      style={{ '--accent': accent(b) } as React.CSSProperties}
      onClick={onOpen}
    >
      <span className="bp-row-glyph">{locked ? '🔒' : <BuildingGlyph def={b} />}</span>
      <span className="bp-row-name">
        {b.name}
        {owned && <small className="bp-row-owned">{owned}</small>}
        {note && <small className="bp-row-note">{note}</small>}
      </span>
      <span className="bp-row-right">
        {!locked && <CostChips cost={b.cost(1)} />}
        <span className="bp-row-out">{Object.keys(b.base).length ? fmtOutputs(b.base) : b.kind === 'research' ? 'affinity level' : '—'}</span>
      </span>
    </button>
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
  const levels = city(s).affinityLevels
  const aff = b.affinity ? AFFINITY_DEFS[b.affinity] : null
  const locked = !!aff && !isUnlocked(aff.id, levels)
  const built = s.map.tiles.filter((t) => t.building?.id === id)
  const done = !!b.unique && built.length > 0
  const boosts = Object.values(BUILDING_DEFS).filter((o) => o.id !== id && o.adjacency.some((r) => 'building' in r.per && r.per.building === id))

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
      <header>
        <button className="bp-back" onClick={onBack} aria-label="Back to gallery">
          ←
        </button>
        <div>
          <span className="help-kind">
            {KIND_LABEL[b.kind]}
            {aff && ` · tier ${aff.tier}`}
          </span>
          <h3 data-help={`building:${id}`}>
            <BuildingGlyph def={b} /> {b.name}
          </h3>
        </div>
      </header>
      <div className="bp-model">
        <BuildingPreview id={id} terrain={placeTerrain} />
      </div>
      <button className={`btn ${armed ? 'btn-war' : 'btn-primary'} bp-place`} disabled={done || locked} onClick={() => onArm(armed ? null : id)}>
        {locked ? 'Locked' : done ? 'Already built' : armed ? 'Placing… click a tile (Esc)' : 'Place on the board'}
      </button>
      <p className="bp-text">{aff ? aff.flavour : b.text}</p>

      {aff && aff.parents.length > 0 && (
        <div className={`bp-recipe ${locked ? 'locked' : ''}`}>
          <span className="label">Unlocks with</span>
          {aff.parents.map((p) => (
            <span key={p} className="bp-parent" data-help={`affinity:${p}`} style={{ color: AFFINITY_COLOR[p] }}>
              {AFFINITY_GLYPH[p]} {AFFINITY_LABEL[p]} Lv{levels[p] ?? 0}/{CONFIG.affinity.unlockLevel}
            </span>
          ))}
        </div>
      )}

      <dl className="bp-stats">
        <div>
          <dt>Cost</dt>
          <dd>
            <CostChips cost={b.cost(1)} />
          </dd>
        </div>
        <div>
          <dt>{aff ? 'Level' : 'Base output'}</dt>
          <dd className="mono">{aff ? `${levels[aff.id] ?? 0}/${b.maxLevel}` : fmtOutputs(b.base)}</dd>
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
        <div className="wide">
          <dt>Best spot now</dt>
          <dd className="mono">{best ? `${best.text} on ${best.terrain}` : 'no valid tile in your land'}</dd>
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
      {aff && b.maxLevel > 1 && (
        <ol className="lex-levels">
          {Array.from({ length: b.maxLevel }, (_, i) => (
            <li key={i}>
              <span className="lex-lv">Lv{i + 1}</span>
              <CostChips cost={b.cost(i + 1)} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
