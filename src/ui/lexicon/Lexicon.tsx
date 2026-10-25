/**
 * The Lexicon: every element in the game, generated from the game data so it
 * can't drift. Everything is shown up front (nothing is gated on progress yet).
 */
import { useEffect, useState } from 'react'
import {
  AFFINITIES,
  AFFINITY_DEFS,
  AFFINITY_LABEL,
  BUILDING_DEFS,
  CONFIG,
  EFFECT_TEXT,
  RARITIES,
  RESOURCE_LABEL,
  SPECIES,
  SPECIES_IDS,
  SYNERGY_DEFS,
  TERRAINS,
  TERRAIN_DEFS,
  TYPE_DEFS,
  UNIT_TYPES,
  academyId,
  affinitiesOfTier,
  city,
  isUnlocked,
  type Affinity,
  type AdjacencyRule,
  type BuildingDef,
  type Cost,
  type EffectKey,
  type SynergyDef,
} from '../../game'
import { fmtOutputs } from '../format'
import { useGame } from '../useGame'
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

// ── Affinities: the research tree ─────────────────────────────────────

function Affinities() {
  const [s] = useGame()
  const levels = city(s).affinityLevels
  const COL_W = 210
  const ROW_H = 64
  const tiers = [1, 2, 3, 4].map((t) => affinitiesOfTier(t))
  const rows = Math.max(...tiers.map((t) => t.length))
  const W = COL_W * 4
  const H = rows * ROW_H + 40
  const pos = {} as Record<Affinity, [number, number]>
  tiers.forEach((list, ti) => {
    const offset = ((rows - list.length) * ROW_H) / 2
    list.forEach((a, i) => (pos[a] = [ti * COL_W + 70, 40 + offset + i * ROW_H + ROW_H / 2 - 12]))
  })

  return (
    <div className="lex-affinities">
      <p className="lede">
        Tier 1 comes from your land (or a Church / Crypt) and mostly feeds your economy. Every higher affinity unlocks when its parents’ academies reach Lv
        {CONFIG.affinity.unlockLevel}: then its academy can be built on its site and its citizens start being born. Troop points set each synergy’s <b>tier</b> (
        {CONFIG.affinity.thresholds.join(' / ')}); its academy level sets the <b>strength</b>. Most synergies empower only the units carrying the affinity; ones marked <i>whole troop</i> empower everyone.
      </p>
      <div className="lex-map-wrap">
        <svg className="lex-tree-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Affinity research tree">
          {[1, 2, 3, 4].map((t) => (
            <text key={t} x={(t - 1) * COL_W + 70} y={18} textAnchor="middle" className="lex-tier-label">
              TIER {t}
            </text>
          ))}
          {AFFINITIES.flatMap((a) =>
            AFFINITY_DEFS[a].parents.map((p) => {
              const [x1, y1] = pos[p]
              const [x2, y2] = pos[a]
              const mx = (x1 + x2) / 2
              return (
                <path
                  key={`${p}-${a}`}
                  d={`M${x1 + 26} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2 - 26} ${y2}`}
                  stroke={AFFINITY_COLOR[p]}
                  strokeOpacity={0.55}
                  strokeWidth={2}
                  fill="none"
                />
              )
            }),
          )}
          {AFFINITIES.map((a) => {
            const [x, y] = pos[a]
            const open = isUnlocked(a, levels)
            const d = AFFINITY_DEFS[a]
            return (
              <g key={a} data-help={`affinity:${a}`} className={`lex-node ${open ? '' : 'locked'}`}>
                <circle cx={x} cy={y} r={24} fill="#1a1512" stroke={AFFINITY_COLOR[a]} strokeWidth={d.team ? 3.5 : 2} strokeDasharray={open ? undefined : '4 3'} />
                <text x={x} y={y + 6} textAnchor="middle" className="lex-node-glyph" fill={AFFINITY_COLOR[a]}>
                  {AFFINITY_GLYPH[a]}
                </text>
                <text x={x + 32} y={y + 4} className="lex-node-name">
                  {AFFINITY_LABEL[a]}
                </text>
                {(levels[a] ?? 0) > 0 && (
                  <text x={x + 32} y={y + 18} className="lex-node-sub">
                    Lv{levels[a]}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {[1, 2, 3, 4].map((t) => (
        <section key={t}>
          <h3 className="section-title">Tier {t}</h3>
          <div className="lex-grid">
            {affinitiesOfTier(t).map((a) => {
              const d = AFFINITY_DEFS[a]
              return (
                <div key={a} className="lex-card" style={{ '--accent': AFFINITY_COLOR[a] } as React.CSSProperties}>
                  <h4 data-help={`affinity:${a}`}>
                    <span style={{ color: AFFINITY_COLOR[a] }}>{AFFINITY_GLYPH[a]}</span> {d.label} {d.team && <small className="lex-tag">whole troop</small>}
                  </h4>
                  <p className="muted">
                    {d.parents.length ? `${d.parents.map((p) => AFFINITY_LABEL[p]).join(' + ')} → ` : d.land ? `${d.land.map((x) => TERRAIN_DEFS[x].label).join(', ')} land · ` : ''}
                    {d.academy} on {d.site === 'any' ? 'any land' : d.site.map((x) => TERRAIN_DEFS[x].label).join(', ')}
                  </p>
                  {d.economy && (
                    <div className="lex-tiers">
                      {('resource' in d.economy ? d.economy.values : d.economy.morale).map((v, i) => (
                        <span key={i}>
                          <small>T{i + 1}</small> {'resource' in d.economy! ? `+${Math.round(v * 100)}% ${RESOURCE_LABEL[d.economy.resource]}` : `+${v} morale/turn`}
                        </span>
                      ))}
                    </div>
                  )}
                  {tierText(SYNERGY_DEFS.find((x) => x.id === a)!)}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

// ── Buildings ─────────────────────────────────────────────────────────

function Buildings() {
  const generic = Object.values(BUILDING_DEFS).filter((b) => b.kind === 'civic' || b.kind === 'military' || b.kind === 'capital')
  const extractors = Object.values(BUILDING_DEFS).filter((b) => b.kind === 'extractor')
  return (
    <div>
      <p className="lede">
        Academies are the research tree: one per affinity, built on its site from its materials. Extractors turn terrain into materials. Civic and military buildings work
        anywhere. Adjacency rules (⬡) are how placement pays off.
      </p>
      {[1, 2, 3, 4].map((t) => (
        <section key={t}>
          <h3 className="section-title">Tier {t} academies</h3>
          <div className="lex-grid">
            {affinitiesOfTier(t).map((a) => (
              <AcademyCard key={a} a={a} />
            ))}
          </div>
        </section>
      ))}
      <h3 className="section-title">Extractors</h3>
      <div className="lex-grid">
        {extractors.map((b) => (
          <BuildingCard key={b.id} b={b} />
        ))}
      </div>
      <h3 className="section-title">Civic & military</h3>
      <div className="lex-grid">
        {generic.map((b) => (
          <BuildingCard key={b.id} b={b} />
        ))}
      </div>
    </div>
  )
}

function BuildingCard({ b }: { b: BuildingDef }) {
  const feeders = fedBy((r) => 'building' in r.per && r.per.building === b.id, b.id)
  return (
    <div className="lex-card" style={{ '--accent': KIND_COLOR[b.kind] } as React.CSSProperties}>
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
}

function AcademyCard({ a }: { a: Affinity }) {
  const d = AFFINITY_DEFS[a]
  const b = BUILDING_DEFS[academyId(a)]
  const A = CONFIG.affinity
  return (
    <div className="lex-card" style={{ '--accent': AFFINITY_COLOR[a] } as React.CSSProperties}>
      <h4 data-help={`building:${b.id}`}>
        <span style={{ color: AFFINITY_COLOR[a] }}>{AFFINITY_GLYPH[a]}</span> {d.academy}
      </h4>
      <p className="muted">
        {d.parents.length ? `Unlocks at ${d.parents.map((p) => `${AFFINITY_LABEL[p]} Lv${A.unlockLevel}`).join(' + ')}. ` : ''}
        Built on {d.site === 'any' ? 'any land' : d.site.map((x) => TERRAIN_DEFS[x].label).join(', ')}; attunes to {TERRAIN_DEFS[d.attune].label.toLowerCase()}.
      </p>
      <ol className="lex-levels">
        {Array.from({ length: b.maxLevel }, (_, i) => (
          <li key={i}>
            <span className="lex-lv">Lv{i + 1}</span>
            <Cost cost={b.cost(i + 1)} />
            <span className="lex-lv-gives">synergies ×{A.levelMult[i + 1]}</span>
          </li>
        ))}
      </ol>
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
