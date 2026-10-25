/**
 * The Lexicon: every element in the game, generated from the game data so it
 * can't drift. Everything is shown up front (nothing is gated on progress yet).
 */
import { useEffect, useState } from 'react'
import {
  AFFINITIES,
  AFFINITY_LABEL,
  AFFINITY_RESOURCE,
  AFFINITY_TERRAIN,
  BASE_SYNERGIES,
  BUILDING_DEFS,
  COMPOUND_SYNERGIES,
  CONFIG,
  EFFECT_TEXT,
  RARITIES,
  RESOURCE_LABEL,
  SPECIES,
  SPECIES_IDS,
  TERRAINS,
  TERRAIN_DEFS,
  TYPE_DEFS,
  UNIT_TYPES,
  academyId,
  type Affinity,
  type AdjacencyRule,
  type BuildingDef,
  type Cost,
  type EffectKey,
  type SynergyDef,
} from '../../game'
import { fmtOutputs } from '../format'
import {
  AFFINITY_COLOR,
  AFFINITY_GLYPH,
  KIND_COLOR,
  RARITY_COLOR,
  RESOURCE_COLOR,
  RESOURCE_GLYPH,
  SPECIES_GLYPH,
  TERRAIN_COLOR,
  TYPE_GLYPH,
  fmtPop,
} from '../theme'

type Section = 'affinities' | 'buildings' | 'units' | 'species' | 'terrain'

const SECTIONS: [Section, string][] = [
  ['affinities', 'Affinities'],
  ['buildings', 'Buildings'],
  ['units', 'Units'],
  ['species', 'Species'],
  ['terrain', 'Terrain'],
]

const pct = (v: number) => `${Math.round(v * 100)}%`

export function Lexicon({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>('affinities')
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet lexicon" role="dialog" aria-label="Lexicon">
        <header className="lex-head">
          <h2>Lexicon</h2>
          <nav className="lex-nav">
            {SECTIONS.map(([id, label]) => (
              <button key={id} className={section === id ? 'on' : ''} onClick={() => setSection(id)}>
                {label}
              </button>
            ))}
          </nav>
          <button className="help-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="lex-body">
          {section === 'affinities' && <Affinities />}
          {section === 'buildings' && <Buildings />}
          {section === 'units' && <Units />}
          {section === 'species' && <Species />}
          {section === 'terrain' && <Terrain />}
        </div>
      </div>
    </div>
  )
}

// ── Shared bits ───────────────────────────────────────────────────────

function Cost({ cost }: { cost: Cost }) {
  const parts = (Object.entries(cost) as [keyof typeof RESOURCE_COLOR, number][]).filter(([, v]) => v > 0)
  return (
    <span className="cost">
      {parts.map(([k, v]) => (
        <span key={k} style={{ color: RESOURCE_COLOR[k] }} data-help={`resource:${k}`}>
          {RESOURCE_GLYPH[k]}
          {v}
        </span>
      ))}
    </span>
  )
}

const ruleTarget = (r: AdjacencyRule, self: BuildingDef) =>
  'terrain' in r.per
    ? TERRAIN_DEFS[r.per.terrain].label
    : 'building' in r.per
      ? BUILDING_DEFS[r.per.building].name
      : self.allowed !== 'any' && self.allowed[0]
        ? TERRAIN_DEFS[self.allowed[0]].label
        : 'same terrain'

function Adjacency({ def }: { def: BuildingDef }) {
  if (!def.adjacency.length) return <span className="muted">No adjacency bonus.</span>
  return (
    <ul className="lex-adj">
      {def.adjacency.map((r, i) => (
        <li key={i}>
          <span className="adj-arrow">⬡</span> {fmtOutputs(r.add)} per adjacent <b>{ruleTarget(r, def)}</b>
          {r.cap ? <small> (max {r.cap})</small> : null}
        </li>
      ))}
    </ul>
  )
}

/** Other buildings whose adjacency rules point at this building or terrain. */
function fedBy(match: (r: AdjacencyRule) => boolean, exclude?: string): BuildingDef[] {
  return Object.values(BUILDING_DEFS).filter((b) => b.id !== exclude && b.adjacency.some(match))
}

function tierText(def: SynergyDef) {
  return (Object.entries(def.tiers) as [EffectKey, readonly number[]][]).map(([k, v]) => (
    <div key={k} className="lex-tiers">
      {v.map((x, i) => (
        <span key={i}>
          <small>T{i + 1}</small> {EFFECT_TEXT[k](x)}
        </span>
      ))}
    </div>
  ))
}

// ── Affinities ────────────────────────────────────────────────────────

/** Circle order chosen so compound pairs sit next to each other where possible. */
const RING: Affinity[] = ['arcane', 'sword', 'shield', 'earth', 'fire', 'bow', 'wind', 'frost']

function Affinities() {
  const W = 520
  const H = 420
  const cx = W / 2
  const cy = H / 2
  const R = 160
  const pos = Object.fromEntries(
    RING.map((a, i) => {
      const t = (i / RING.length) * Math.PI * 2 - Math.PI / 2
      return [a, [cx + Math.cos(t) * R, cy + Math.sin(t) * R]]
    }),
  ) as Record<Affinity, [number, number]>

  return (
    <div className="lex-affinities">
      <p className="lede">
        Units carry affinity points. Points across your troop unlock a synergy’s <b>tier</b> at {CONFIG.affinity.thresholds.join(' / ')} points; the affinity’s academy
        level sets its <b>strength</b> ({CONFIG.affinity.levelMult.map((m, i) => `Lv${i} ×${m}`).join(', ')}). Lines join affinities that combine into a compound synergy,
        whose tier is the lower of the two.
      </p>
      <div className="lex-map-wrap">
        <svg className="lex-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Affinity combination map">
          {COMPOUND_SYNERGIES.map((c) => {
            const [a, b] = c.components as [Affinity, Affinity]
            const [x1, y1] = pos[a]
            const [x2, y2] = pos[b]
            const mx = (x1 + x2) / 2
            const my = (y1 + y2) / 2
            // push labels outward from the centre so chords stay readable
            const ox = (mx - cx) * 0.12
            const oy = (my - cy) * 0.12
            return (
              <g key={c.id} data-help={`synergy:${c.id}`} className="lex-edge">
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={`url(#g-${c.id})`} strokeWidth={4} strokeLinecap="round" />
                <defs>
                  <linearGradient id={`g-${c.id}`} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
                    <stop offset="0" stopColor={AFFINITY_COLOR[a]} />
                    <stop offset="1" stopColor={AFFINITY_COLOR[b]} />
                  </linearGradient>
                </defs>
                <rect x={mx + ox - 42} y={my + oy - 11} width={84} height={22} rx={3} className="lex-edge-label-bg" />
                <text x={mx + ox} y={my + oy + 5} textAnchor="middle" className="lex-edge-label">
                  {c.name}
                </text>
              </g>
            )
          })}
          {RING.map((a) => {
            const [x, y] = pos[a]
            return (
              <g key={a} data-help={`affinity:${a}`} className="lex-node">
                <circle cx={x} cy={y} r={30} fill="#1a1512" stroke={AFFINITY_COLOR[a]} strokeWidth={2.5} />
                <text x={x} y={y + 2} textAnchor="middle" className="lex-node-glyph" fill={AFFINITY_COLOR[a]}>
                  {AFFINITY_GLYPH[a]}
                </text>
                <text x={x} y={y + 18} textAnchor="middle" className="lex-node-label">
                  {AFFINITY_LABEL[a]}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <h3 className="section-title">Base synergies</h3>
      <div className="lex-grid">
        {BASE_SYNERGIES.map((d) => {
          const a = d.components[0]!
          return (
            <div key={d.id} className="lex-card" style={{ '--accent': AFFINITY_COLOR[a] } as React.CSSProperties}>
              <h4 data-help={`affinity:${a}`}>
                <span style={{ color: AFFINITY_COLOR[a] }}>{AFFINITY_GLYPH[a]}</span> {d.name}
              </h4>
              <p className="muted">
                Born from {TERRAIN_DEFS[AFFINITY_TERRAIN[a]].label.toLowerCase()} · built with {RESOURCE_LABEL[AFFINITY_RESOURCE[a]].toLowerCase()} · combines with{' '}
                {COMPOUND_SYNERGIES.filter((c) => c.components.includes(a))
                  .map((c) => `${AFFINITY_LABEL[c.components.find((x) => x !== a)!]} → ${c.name}`)
                  .join(', ') || 'nothing'}
              </p>
              {tierText(d)}
            </div>
          )
        })}
      </div>

      <h3 className="section-title">Compound synergies</h3>
      <div className="lex-grid">
        {COMPOUND_SYNERGIES.map((d) => (
          <div key={d.id} className="lex-card compound">
            <h4 data-help={`synergy:${d.id}`}>
              {d.components.map((a, i) => (
                <span key={a}>
                  {i ? ' + ' : ''}
                  <span style={{ color: AFFINITY_COLOR[a] }}>
                    {AFFINITY_GLYPH[a]} {AFFINITY_LABEL[a]}
                  </span>
                </span>
              ))}{' '}
              → {d.name}
            </h4>
            {tierText(d)}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Buildings ─────────────────────────────────────────────────────────

function Buildings() {
  const generic = Object.values(BUILDING_DEFS).filter((b) => b.kind === 'civic' || b.kind === 'military' || b.kind === 'capital')
  return (
    <div>
      <p className="lede">
        Each affinity has a home terrain, an extractor that works it, and an academy that sets the affinity’s level. Generic buildings work anywhere. Adjacency rules (⬡) are how
        placement pays off.
      </p>
      <h3 className="section-title">By affinity</h3>
      <div className="lex-aff-buildings">
        {AFFINITIES.map((a) => (
          <AffinityBuildings key={a} a={a} />
        ))}
      </div>

      <h3 className="section-title">Generic</h3>
      <div className="lex-grid">
        {generic.map((b) => {
          const feeders = fedBy((r) => 'building' in r.per && r.per.building === b.id, b.id)
          return (
            <div key={b.id} className="lex-card" style={{ '--accent': KIND_COLOR[b.kind] } as React.CSSProperties}>
              <h4 data-help={`building:${b.id}`}>
                {b.name} <small className="lex-kind">{b.kind}</small>
              </h4>
              <p className="muted">{b.text}</p>
              <div className="lex-row">
                <span className="label">Cost</span> {b.kind === 'capital' ? <span className="muted">—</span> : <Cost cost={b.cost(1)} />}
                <span className="label">Gives</span> <span className="mono">{fmtOutputs(b.base)}</span>
              </div>
              <div className="lex-row">
                <span className="label">On</span> {b.allowed === 'any' ? 'any land' : b.allowed.length ? b.allowed.map((t) => TERRAIN_DEFS[t].label).join(', ') : 'start only'}
                {b.unique && <span className="lex-tag">unique</span>}
              </div>
              <Adjacency def={b} />
              {feeders.length > 0 && <p className="lex-feeds">Boosts neighbouring {feeders.map((f) => f.name).join(', ')}.</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AffinityBuildings({ a }: { a: Affinity }) {
  const terrain = AFFINITY_TERRAIN[a]
  const res = AFFINITY_RESOURCE[a]
  const extractor = Object.values(BUILDING_DEFS).find((b) => b.kind === 'extractor' && b.allowed !== 'any' && b.allowed.includes(terrain))!
  const academy = BUILDING_DEFS[academyId(a)]
  const extractorFeeds = fedBy((r) => 'building' in r.per && r.per.building === extractor.id, extractor.id)
  const terrainFeeds = fedBy((r) => 'terrain' in r.per && r.per.terrain === terrain).filter((b) => b.id !== academy.id)
  const A = CONFIG.affinity

  return (
    <div className="lex-aff-card" style={{ '--accent': AFFINITY_COLOR[a] } as React.CSSProperties}>
      <header>
        <span className="lex-aff-glyph" style={{ color: AFFINITY_COLOR[a] }}>
          {AFFINITY_GLYPH[a]}
        </span>
        <h4 data-help={`affinity:${a}`}>{AFFINITY_LABEL[a]}</h4>
        <span className="lex-chain">
          <span data-help={`terrain:${terrain}`}>
            <i className="lex-hex" style={{ background: TERRAIN_COLOR[terrain] }} /> {TERRAIN_DEFS[terrain].label}
          </span>
          →
          <span data-help={`resource:${res}`} style={{ color: RESOURCE_COLOR[res] }}>
            {RESOURCE_GLYPH[res]} {RESOURCE_LABEL[res]}
          </span>
        </span>
      </header>

      <div className="lex-tree">
        <div className="lex-node-card" data-help={`building:${extractor.id}`}>
          <span className="label">Extractor</span>
          <b>{extractor.name}</b>
          <Cost cost={extractor.cost(1)} />
          <span className="mono">{fmtOutputs(extractor.base)}</span>
          <Adjacency def={extractor} />
          {extractorFeeds.length > 0 && <p className="lex-feeds">Boosts neighbouring {extractorFeeds.map((f) => f.name).join(', ')}.</p>}
        </div>

        <div className="lex-academy" data-help={`building:${academy.id}`}>
          <span className="label">Academy upgrade tree</span>
          <b>{academy.name}</b>
          <ol className="lex-levels">
            {Array.from({ length: academy.maxLevel }, (_, i) => {
              const L = i + 1
              return (
                <li key={L}>
                  <span className="lex-lv">Lv{L}</span>
                  <Cost cost={academy.cost(L)} />
                  <span className="lex-lv-gives">
                    synergies ×{A.levelMult[L]} · carriers +{pct(A.combatBonusPerLevel * L)} HP/ATK · births +{A.birthWeight.perLevel * L} weight
                  </span>
                </li>
              )
            })}
          </ol>
          <Adjacency def={academy} />
          <p className="muted">Each attunement: +{pct(A.combatBonusPerAttune)} HP/ATK for carriers, +{A.birthWeight.perAttune} birth weight.</p>
        </div>
      </div>
      {terrainFeeds.length > 0 && (
        <p className="lex-feeds">
          {TERRAIN_DEFS[terrain].label} tiles also boost neighbouring {terrainFeeds.map((f) => f.name).join(', ')}.
        </p>
      )}
    </div>
  )
}

// ── Units ─────────────────────────────────────────────────────────────

function Units() {
  return (
    <div>
      <p className="lede">A unit’s type is how it fights. Its affinities only feed synergies. Its rarity comes from your population when it was born.</p>
      <h3 className="section-title">Types</h3>
      <table className="lex-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>HP</th>
            <th>ATK</th>
            <th>DEF</th>
            <th>Range</th>
            <th>Atk/s</th>
            <th>Move</th>
            <th>Damage</th>
            <th>Ability</th>
          </tr>
        </thead>
        <tbody>
          {UNIT_TYPES.map((t) => {
            const d = TYPE_DEFS[t]
            return (
              <tr key={t}>
                <td data-help={`type:${t}`}>
                  {TYPE_GLYPH[t]} {d.label}
                </td>
                <td>{d.base.hp}</td>
                <td>{d.base.atk}</td>
                <td>{d.base.def}</td>
                <td>{d.base.range}</td>
                <td>{d.base.atkSpeed}</td>
                <td>{d.base.moveSpeed}</td>
                <td>{d.damage}</td>
                <td className="wrap">
                  <b>{d.abilityLabel}</b> ({d.base.maxEnergy} energy): {d.abilityText}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h3 className="section-title">Rarities</h3>
      <table className="lex-table">
        <thead>
          <tr>
            <th>Rarity</th>
            <th>Unlocks at</th>
            <th>Stats</th>
            <th>Affinity points</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          {RARITIES.map((r) => (
            <tr key={r}>
              <td data-help={`rarity:${r}`} style={{ color: RARITY_COLOR[r], textTransform: 'capitalize' }}>
                {r}
              </td>
              <td>{r === 'common' ? 'always' : fmtPop(CONFIG.rarityThresholds[r])}</td>
              <td>×{CONFIG.rarityStatMult[r]}</td>
              <td>{CONFIG.affinity.pointsByRarity[r]}</td>
              <td>{CONFIG.rarityPrice[r]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Levels 1–{CONFIG.level.max}: +{pct(CONFIG.level.statPerLevel)} base stats each. Quality rolls ×{CONFIG.quality.min}–{CONFIG.quality.max}. Veterans upgrade{' '}
        {pct(CONFIG.level.discountPerBattleSurvived)} cheaper per battle survived (max {pct(CONFIG.level.maxDiscount)}).
      </p>
    </div>
  )
}

// ── Species & terrain ─────────────────────────────────────────────────

function Species() {
  return (
    <div className="lex-grid">
      {SPECIES_IDS.map((id) => (
        <div key={id} className="lex-card">
          <h4 data-help={`species:${id}`}>
            <span className="lex-species-glyph">{SPECIES_GLYPH[id]}</span> {SPECIES[id].name}
          </h4>
          <p className="muted">{SPECIES[id].text}</p>
        </div>
      ))}
    </div>
  )
}

function Terrain() {
  return (
    <table className="lex-table">
      <thead>
        <tr>
          <th>Terrain</th>
          <th>Raw yield</th>
          <th>Affinity</th>
          <th>Extractor</th>
          <th>Buildable</th>
        </tr>
      </thead>
      <tbody>
        {TERRAINS.map((t) => {
          const d = TERRAIN_DEFS[t]
          const ex = Object.values(BUILDING_DEFS).find((b) => b.kind === 'extractor' && b.allowed !== 'any' && b.allowed.includes(t))
          return (
            <tr key={t}>
              <td data-help={`terrain:${t}`}>
                <i className="lex-hex" style={{ background: TERRAIN_COLOR[t] }} /> {d.label}
              </td>
              <td style={{ color: RESOURCE_COLOR[d.resource] }}>
                {RESOURCE_GLYPH[d.resource]} {d.rawYield} {RESOURCE_LABEL[d.resource]}
              </td>
              <td>
                {d.affinity ? (
                  <span style={{ color: AFFINITY_COLOR[d.affinity] }}>
                    {AFFINITY_GLYPH[d.affinity]} {AFFINITY_LABEL[d.affinity]}
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td>{ex?.name ?? (t === 'plains' ? 'Farm' : '—')}</td>
              <td>{d.buildable ? 'yes' : 'no'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
