/**
 * The Lexicon: every element in the game, generated from the game data so it
 * can't drift. Everything is shown up front (nothing is gated on progress yet).
 */
import { useEffect, useState } from 'react'
import {
  attackTicks,
  moveTicks,
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
  baseOutput,
  buildingName,
  landOf,
  researchCost,
  academyFlow,
  BIOMES,
  BIOME_SPECIALS,
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

const ruleTarget = (r: AdjacencyRule, _self: BuildingDef) =>
  'terrain' in r.per
    ? (typeof r.per.terrain === 'string' ? [r.per.terrain] : r.per.terrain).map((t) => TERRAIN_DEFS[t].label).join(' or ')
    : 'building' in r.per
      ? BUILDING_DEFS[r.per.building].name
      : 'tile of the same terrain'

function Adjacency({ def }: { def: BuildingDef }) {
  if (!def.adjacency.length) return <span className="muted">No adjacency bonus.</span>
  return (
    <ul className="lex-adj">
      {def.adjacency.map((r, i) => (
        <li key={i}>
          <span className="adj-arrow">⬡</span> {r.add === 'tile' ? '+1 of the tile’s resource' : fmtOutputs(r.add)} per adjacent <b>{ruleTarget(r, def)}</b>
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
        Affinities come only from academies, never from land: citizens are born plain unless an academy dedicated to an affinity gives them one. You dedicate and
        raise academies with the essences of an affinity’s tier-1 roots. Tier 1 mostly feeds your economy. Higher affinities open once each parent has an academy at
        Lv{CONFIG.affinity.unlockLevel}. Troop points set each synergy’s <b>tier</b> ({CONFIG.affinity.thresholds.join(' / ')}); your best academy of it sets the{' '}
        <b>strength</b>. Most synergies empower only the units with the affinity; ones marked <i>whole troop</i> empower everyone.
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
                    {d.parents.length
                      ? `${d.parents.map((p) => AFFINITY_LABEL[p]).join(' + ')} · `
                      : landOf(a).length
                        ? `essence from ${landOf(a).map((x) => TERRAIN_DEFS[x].label).join(', ')} · `
                        : a === 'light' ? 'essence from a Church · ' : 'essence from a Crypt · '}
                    {d.tier === 1 ? 'dedicate for' : 'evolve for'} <Cost cost={researchCost(a, 1)} /> + {Object.entries(academyFlow(a, 1)).map(([k, v]) => `${v}${RESOURCE_GLYPH[k as keyof typeof RESOURCE_GLYPH]}`).join(' ')}/turn
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

const BUILDING_GROUPS: { label: string; kinds: BuildingDef['kind'][] }[] = [
  { label: 'Gathering & research', kinds: ['gather', 'research'] },
  { label: 'Civic & faith', kinds: ['capital', 'civic', 'faith'] },
  { label: 'Military', kinds: ['military'] },
]

function Buildings() {
  return (
    <div>
      <p className="lede">
        Every building is built from stone. One Mine line digs whatever its tile holds and grows into a Quarry, then an Excavator. Academies, as many as you
        like, are dedicated to an affinity with essences and are the only source of affinities at birth. Adjacency rules (⬡) are how placement pays off.
      </p>
      {BUILDING_GROUPS.map((g) => (
        <section key={g.label}>
          <h3 className="section-title">{g.label}</h3>
          <div className="lex-grid">
            {Object.values(BUILDING_DEFS)
              .filter((b) => g.kinds.includes(b.kind))
              .map((b) => (
                <BuildingCard key={b.id} b={b} />
              ))}
          </div>
        </section>
      ))}
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
        <span className="label">Gives</span>{' '}
        <span className="mono">{b.id === 'mine' ? 'the tile’s resource: raw yield + level' : b.id === 'academy' ? 'citizens with its affinity' : fmtOutputs(baseOutput(b, 'plains'))}</span>
      </div>
      <div className="lex-row">
        <span className="label">On</span> {b.allowed === 'any' ? 'any land' : b.allowed.length ? b.allowed.map((t) => TERRAIN_DEFS[t].label).join(', ') : 'start only'}
        {b.unique && <span className="lex-tag">unique</span>}
      </div>
      <Adjacency def={b} />
      {b.maxLevel > 1 && b.id !== 'academy' && (
        <ol className="lex-levels">
          {Array.from({ length: b.maxLevel }, (_, i) => (
            <li key={i}>
              <span className="lex-lv">{b.levelNames ? buildingName(b.id, i + 1) : `Lv${i + 1}`}</span>
              <Cost cost={b.cost(i + 1)} />
            </li>
          ))}
        </ol>
      )}
      {feeders.length > 0 && <p className="lex-feeds">Boosts neighbouring {feeders.map((f) => f.name).join(', ')}.</p>}
    </div>
  )
}

// ── Units ─────────────────────────────────────────────────────────────

function Units() {
  return (
    <div>
      <p className="lede">A unit’s type is how it fights. Its affinities only feed synergies. Its rarity comes from your population when it was born.</p>

      <h3 className="section-title">How a fight runs</h3>
      <p className="muted">
        Battles are fought on a hex arena, {CONFIG.combat.arenaRadius * 2 + 1} cells across, one unit per cell, in ticks ({CONFIG.combat.ticksPerSecond} a second). Every action
        takes whole ticks: a step to the next cell, an attack (it lands part way through the swing), a skill. <b>Tanks grab aggro</b>: fighters, rangers and mages go for
        any enemy tank they can reach before anyone else. Healers mostly heal and hex the strongest enemy when nobody is hurt. After{' '}
        {CONFIG.combat.overtimeAfter / CONFIG.combat.ticksPerSecond}s, overtime ramps damage up and healing down.
      </p>

      <h3 className="section-title">Skills</h3>
      <p className="muted">
        Every unit has one skill, set by its type: all Fighters Cleave, all Tanks Taunt, and so on. Skills fill from <b>energy</b>: +{CONFIG.combat.energyPerAttack} each time
        the unit attacks, +{CONFIG.combat.energyPerHit} each time it’s hit. When energy is full the unit casts its skill instead of a normal attack, then starts again from
        zero. Skills scale with the unit’s attack, so rarity, level and ATK bonuses all make them hit harder; ability-power and energy-gain synergies (Arcane, Spellblade…)
        make them stronger or faster.
      </p>
      <table className="lex-table">
        <thead>
          <tr>
            <th>Skill</th>
            <th>Type</th>
            <th>Energy</th>
            <th>Casts after</th>
            <th>Effect</th>
          </tr>
        </thead>
        <tbody>
          {UNIT_TYPES.map((t) => {
            const d = TYPE_DEFS[t]
            const attacks = Math.ceil(d.base.maxEnergy / CONFIG.combat.energyPerAttack)
            return (
              <tr key={t}>
                <td>
                  <b>{d.abilityLabel}</b>
                </td>
                <td data-help={`type:${t}`}>
                  {TYPE_GLYPH[t]} {d.label}
                </td>
                <td>{d.base.maxEnergy}</td>
                <td>
                  ~{attacks} attack{attacks === 1 ? '' : 's'}
                </td>
                <td className="wrap">{d.abilityText}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h3 className="section-title">Types</h3>
      <table className="lex-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>HP</th>
            <th>ATK</th>
            <th>DEF</th>
            <th title="Cells">Reach</th>
            <th title="Ticks one attack takes">Attack</th>
            <th title="Ticks one step takes">Step</th>
            <th>Damage</th>
            <th>Goes for</th>
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
                <td>{attackTicks(d.base.atkSpeed)}t</td>
                <td>{moveTicks(d.base.moveSpeed)}t</td>
                <td>{d.damage}</td>
                <td className="wrap">{d.targeting}</td>
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
          <th>Built on it</th>
          <th>Buildable</th>
        </tr>
      </thead>
      <tbody>
        {TERRAINS.map((t) => {
          const d = TERRAIN_DEFS[t]
          const biomes = BIOMES.filter((b) => b === t || BIOME_SPECIALS[b].includes(t))
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
              <td>
                {t === 'lake' ? 'Fishery' : t === 'plains' ? 'Farm' : 'Mine'}
                {biomes.length > 0 && <small className="muted"> · {biomes.map((b) => TERRAIN_DEFS[b].label).join(', ')} biome</small>}
              </td>
              <td>{d.buildable ? 'yes' : 'no'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
