import { useEffect, useMemo, useState } from 'react'
import {
  AFFINITY_DEFS,
  AFFINITY_LABEL,
  BUILDINGS,
  BUILDING_DEFS,
  CONFIG,
  MATERIALS,
  RARITIES,
  RESOURCE_LABEL,
  STOCK_RESOURCES,
  TERRAIN_DEFS,
  TYPE_DEFS,
  affinityOdds,
  birthRarityOdds,
  buildBlock,
  buildCost,
  buildingName,
  canOffer,
  claimEarthCost,
  offerLight,
  campLoot,
  campRarityHint,
  canRecruit,
  canReroll,
  canTrade,
  canUpgradeBuilding,
  city,
  civTier,
  claimBlock,
  claimCost,
  claimTile,
  demolish,
  demolishRefund,
  effectiveYields,
  evaluateBuilding,
  frontier,
  growthRate,
  hexKey,
  moraleMult,
  moraleRegen,
  ownedTiles,
  placeBuilding,
  raidBlock,
  raidCamp,
  recruit,
  rerollCost,
  rerollMuster,
  territoryCap,
  tierProgress,
  tileAt,
  trade,
  upgradeBuilding,
  type BuildingId,
  type GameState,
  type Hex,
  type Material,
  type Outputs,
  type ResourceId,
} from '../../game'
import { useGame } from '../useGame'
import { Board3D, type TileOverlay, type TilePreview } from '../board/Board3D'
import { BuildPanel } from '../board/BuildPanel'
import { TroopPanel } from '../components/TroopPanel'
import { Portrait } from '../components/Portrait'
import { UnitDetail } from '../components/UnitDetail'
import { AcademyPanel } from '../components/AcademyPanel'
import { useRequirementCheck } from '../toast'
import { BuildingGlyph, CostChips } from '../components/BuildingBits'
import { fmtOutputs, outputParts, outputScore } from '../format'
import { AFFINITY_COLOR, AFFINITY_GLYPH, KIND_COLOR, PLAIN_COLOR, RARITY_COLOR, RESOURCE_COLOR, RESOURCE_GLYPH, TERRAIN_COLOR, fmtPop } from '../theme'

// ── Map lenses (the eye toggle) ───────────────────────────────────────

type Lens = 'normal' | 'resources' | 'buildings'
const LENSES: Lens[] = ['normal', 'resources', 'buildings']
const LENS_LABEL: Record<Lens, string> = { normal: 'Normal view', resources: 'Resources', buildings: 'Buildings' }

/** Glyph-and-number summary of a tile's output, e.g. "♨3 ▧1". */
const compact = (o: Outputs) =>
  (Object.entries(o) as [string, number][])
    .filter(([k, v]) => v > 0 && k in RESOURCE_GLYPH)
    .map(([k, v]) => `${RESOURCE_GLYPH[k as ResourceId]}${v}`)
    .join(' ')

function lensOverlays(s: GameState, lens: Lens): Record<string, TileOverlay> | null {
  if (lens === 'normal') return null
  const c = city(s)
  const out: Record<string, TileOverlay> = {}
  for (const t of s.map.tiles) {
    const k = hexKey(t)
    if (lens === 'resources') {
      // Owned: what it actually makes. Wild: what it would give.
      const o = t.owned ? (c.tiles[k]?.output ?? {}) : { [TERRAIN_DEFS[t.terrain].resource]: TERRAIN_DEFS[t.terrain].rawYield }
      const main = (Object.entries(o) as [string, number][]).filter(([r]) => r in RESOURCE_COLOR).sort((a, b) => b[1] - a[1])[0]
      if (!main) continue
      // Wild tiles get the tint only; labels on every tile are too much.
      out[k] = { color: RESOURCE_COLOR[main[0] as ResourceId], text: t.owned ? compact(o) : '', faint: !t.owned }
    } else {
      if (t.camp) {
        out[k] = { color: '#c94a3a', text: `☠ ${t.camp.name}`, faint: !frontier(s.map).some((f) => f.q === t.q && f.r === t.r) }
        continue
      }
      const b = t.building
      if (!b) continue
      const def = BUILDING_DEFS[b.id]
      const color = b.affinity ? AFFINITY_COLOR[b.affinity] : KIND_COLOR[def.kind]
      const name =
        b.id === 'academy'
          ? b.affinity
            ? `${AFFINITY_GLYPH[b.affinity]} ${AFFINITY_LABEL[b.affinity]} Lv${b.level}`
            : 'Empty academy'
          : `${buildingName(b.id, b.level)}${def.maxLevel > 1 && !def.levelNames ? ` Lv${b.level}` : ''}`
      out[k] = { color, text: name }
    }
  }
  return out
}

type RightTab = 'tile' | 'muster' | 'troop' | 'build' | 'scout'
type LeftTab = 'population' | 'resources'

export function TurnScreen() {
  const [s, dispatch] = useGame()
  const [selected, setSelected] = useState<Hex | null>(null)
  const [armed, setArmed] = useState<BuildingId | null>(null)
  const [tab, setTab] = useState<RightTab>('muster')
  const [left, setLeft] = useState<LeftTab>('population')

  const frontierKeys = useMemo(() => new Set(frontier(s.map).map(hexKey)), [s.map])
  const check = useRequirementCheck()

  // Placement: what the building would make on each valid tile. No "best spot" highlight: players can think.
  const previews = useMemo(() => {
    if (!armed) return null
    const out: Record<string, TilePreview> = {}
    for (const t of ownedTiles(s.map)) {
      const block = buildBlock(s, t, armed)
      if (block && block !== 'cost') continue
      out[hexKey(t)] = { text: fmtOutputs(evaluateBuilding(s.map, t, armed).output), best: false }
    }
    return out
  }, [s, armed])

  const [lens, setLens] = useState<Lens>('normal')
  const overlays = useMemo(() => lensOverlays(s, lens), [s, lens])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setArmed(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onSelect = (h: Hex | null) => {
    if (armed && h) {
      const block = buildBlock(s, h, armed)
      if (block === 'cost') check(null, buildCost(s, armed))
      if (!block) {
        dispatch((st) => placeBuilding(st, h, armed))
        setSelected(h)
        setArmed(null)
      }
      return
    }
    setSelected(h)
    if (h) setTab('tile')
  }

  const RIGHT: [RightTab, string][] = [
    ['tile', 'Tile'],
    ['muster', 'Muster'],
    ['troop', `Troop ${s.troop.length}`],
    ['build', 'Build'],
    ['scout', 'Scout'],
  ]

  return (
    <div className="turn">
      <aside className="rail">
        <nav className="side-tabs">
          {(
            [
              ['population', 'Population'],
              ['resources', 'Resources'],
            ] as [LeftTab, string][]
          ).map(([id, label]) => (
            <button key={id} className={left === id ? 'on' : ''} onClick={() => setLeft(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="rail-body">{left === 'population' ? <PopulationTab /> : <ResourcesTab />}</div>
      </aside>
      <section className="board-wrap">
        <Board3D map={s.map} selected={selected} frontier={frontierKeys} previews={previews} overlays={overlays} onSelect={onSelect} />
        <button
          className={`lens-toggle ${lens !== 'normal' ? 'on' : ''}`}
          onClick={() => setLens(LENSES[(LENSES.indexOf(lens) + 1) % LENSES.length]!)}
          title="Cycle the map view"
          aria-label={`Map view: ${LENS_LABEL[lens]}. Click to cycle.`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          {LENS_LABEL[lens]}
          <small>{LENSES.indexOf(lens) + 1}/{LENSES.length}</small>
        </button>
        {armed && (
          <div className="armed-hint">
            Placing <b>{BUILDING_DEFS[armed].name}</b>. Click a highlighted tile. <kbd>Esc</kbd> to cancel.
          </div>
        )}
      </section>
      <aside className="side">
        <nav className="side-tabs">
          {RIGHT.map(([id, label]) => (
            <button key={id} data-help={`tab:${id}`} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="side-body">
          {tab === 'tile' && <TilePanel hex={selected} onSelect={onSelect} />}
          {tab === 'muster' && <MusterPanel />}
          {tab === 'troop' && <TroopPanel />}
          {tab === 'build' && <BuildPanel armed={armed} onArm={setArmed} />}
          {tab === 'scout' && <ScoutPanel onFocusTile={(h) => onSelect(h)} />}
        </div>
      </aside>
    </div>
  )
}

// ── Left: population ──────────────────────────────────────────────────

function PopulationTab() {
  const [s] = useGame()
  const c = city(s)
  const rar = birthRarityOdds(s.population, s.species)
  const tp = tierProgress(s.population)
  const odds = affinityOdds(c.academies)
  // Grouped by tier, most likely first within each tier.
  const born = [...odds.affinities].sort((x, y) => AFFINITY_DEFS[x.affinity].tier - AFFINITY_DEFS[y.affinity].tier || y.chance - x.chance)

  return (
    <div className="pop-tab">
      <div className="pop-hero" data-help="population">
        <span className="label">Population</span>
        <b>{s.population.toLocaleString()}</b>
        <span className="pop-sub">
          <span data-help="growth">+{Math.round(growthRate(s) * 100)}% / turn</span> ·{' '}
          <span data-help="tier" style={{ color: RARITY_COLOR[civTier(s.population)] }}>
            {civTier(s.population)} tier
          </span>
        </span>
      </div>

      <h3 className="section-title" data-help="birth-odds">
        Rarity of new citizens
      </h3>
      <ul className="rarity-odds">
        {RARITIES.map((r) => {
          const locked = rar[r] === 0
          return (
            <li key={r} className={locked ? 'locked' : r === tp.tier ? 'current' : ''} data-help={`rarity:${r}`} style={{ '--rarity': RARITY_COLOR[r] } as React.CSSProperties}>
              <span className="ro-name">{r}</span>
              <span className="ro-bar">
                <i style={{ width: `${rar[r] * 100}%` }} />
              </span>
              <span className="ro-pct">{locked ? `at ${fmtPop(CONFIG.rarityThresholds[r])}` : `${(rar[r] * 100).toFixed(rar[r] < 0.1 ? 1 : 0)}%`}</span>
            </li>
          )
        })}
      </ul>
      {tp.next && (
        <div className="tier-climb" data-help="tier">
          <div className="tc-label">
            <span style={{ color: RARITY_COLOR[tp.next] }}>{tp.next}</span> at {fmtPop(tp.nextAt!)}
          </div>
          <div className="tc-bar">
            <i style={{ width: `${tp.progress * 100}%`, background: RARITY_COLOR[tp.tier] }} />
          </div>
        </div>
      )}

      <h3 className="section-title" data-help="birth-odds">
        Affinities of new citizens
      </h3>
      <ul className="aff-odds">
        <li data-help="birth-odds">
          <span style={{ color: PLAIN_COLOR }}>○</span>
          <span className="aff-name">No affinity</span>
          <span className="aff-bar">
            <i style={{ width: `${odds.none * 100}%`, background: PLAIN_COLOR }} />
          </span>
          <span className="aff-pct">{Math.round(odds.none * 100)}%</span>
        </li>
        {born.map(({ affinity: a, chance, points }, i) => [
          i === 0 || AFFINITY_DEFS[a].tier !== AFFINITY_DEFS[born[i - 1]!.affinity].tier ? (
            <li key={`t${AFFINITY_DEFS[a].tier}`} className="aff-tier">
              Tier {AFFINITY_DEFS[a].tier}
            </li>
          ) : null,
          <li key={a} data-help={`affinity:${a}`} title={points.map((p, k) => `${k + 1} pt: ${Math.round(p * 100)}%`).join(' · ')}>
            <span style={{ color: AFFINITY_COLOR[a] }}>{AFFINITY_GLYPH[a]}</span>
            <span className="aff-name">
              {AFFINITY_LABEL[a]}
              {points.length > 1 && <small> up to {points.length} pt</small>}
            </span>
            <span className="aff-bar">
              <i style={{ width: `${chance * 100}%`, background: AFFINITY_COLOR[a] }} />
            </span>
            <span className="aff-pct">{Math.round(chance * 100)}%</span>
          </li>,
        ])}
        {!born.length && (
          <li className="muted" style={{ display: 'block' }} data-help="kind:research">
            Nobody is born with an affinity until you build an academy and dedicate it.
          </li>
        )}
      </ul>
    </div>
  )
}

// ── Left: resources ───────────────────────────────────────────────────

function ResourcesTab() {
  const [s] = useGame()
  const c = city(s)
  const y = effectiveYields(s)

  return (
    <div className="res-tab">
      <div className="morale-box" data-help="morale">
        <div className="mb-head">
          <span>Morale</span>
          <b>{s.morale}</b>
          <small>
            +{moraleRegen(s)}/turn · fields ×{moraleMult(s.morale).toFixed(2)}
          </small>
        </div>
        <div className="mb-bar">
          <i style={{ width: `${(s.morale / CONFIG.morale.max) * 100}%` }} />
        </div>
      </div>

      <ul className="stock-grid">
        {STOCK_RESOURCES.map((r) => (
          <li key={r} className={s.stock[r] === 0 && !y[r] ? 'none' : ''} data-help={`resource:${r}`}>
            <span className="res-glyph" style={{ color: RESOURCE_COLOR[r] }}>
              {RESOURCE_GLYPH[r]}
            </span>
            <span className="res-name">{RESOURCE_LABEL[r]}</span>
            <span className="res-amt">{s.stock[r]}</span>
            <span className="res-delta">{y[r] ? `+${y[r]}` : ''}</span>
          </li>
        ))}
        <li data-help="food">
          <span className="res-glyph" style={{ color: RESOURCE_COLOR.food }}>
            {RESOURCE_GLYPH.food}
          </span>
          <span className="res-name">Food</span>
          <span className="res-amt" />
          <span className="res-delta">+{y.food}</span>
        </li>
      </ul>

      <dl className="city-stats">
        <div data-help="land">
          <dt>Land</dt>
          <dd>
            {ownedTiles(s.map).length}/{territoryCap(s)}
          </dd>
        </div>
        <div data-help="claim">
          <dt>Next claim</dt>
          <dd>
            {claimCost(s)} gold / {claimEarthCost(s)} mud
          </dd>
        </div>
        <div className="wide" data-help="troop-bonus">
          <dt>Troop bonuses</dt>
          <dd>{c.atkPct || c.hpPct || c.defPct ? fmtOutputs({ atkPct: c.atkPct, hpPct: c.hpPct, defPct: c.defPct }) : 'none yet'}</dd>
        </div>
      </dl>

      <ol className="chronicle" data-help="chronicle">
        {[...s.log].reverse().slice(0, 4).map((l, i) => (
          <li key={i}>
            <small>
              R{l.round + 1}·T{l.turn + 1}
            </small>{' '}
            {l.text}
          </li>
        ))}
      </ol>
    </div>
  )
}

// ── Right: tile ───────────────────────────────────────────────────────

const CLAIM_REASON = {
  'not-frontier': 'Not on your border.',
  camp: 'A camp holds this tile. Raze it to claim it.',
  cap: 'Your people can’t hold more land yet. Grow your population.',
  gold: 'Not enough gold.',
  earth: 'Not enough mud.',
} as const

/** Opened from the Trading Post's tile. */
function TradeBox() {
  const [s, dispatch] = useGame()
  const rate = city(s).tradeRate
  const [give, setGive] = useState<Material>('stone')
  const [get, setGet] = useState<Material>('fire')
  if (rate === null) return null
  return (
    <div className="trade-box">
      <span className="label" data-help="trade">
        Trade {rate}:1
      </span>
      <div className="trade">
        <select value={give} onChange={(e) => setGive(e.target.value as Material)}>
          {MATERIALS.map((m) => (
            <option key={m} value={m}>
              {RESOURCE_LABEL[m]} ({s.stock[m]})
            </option>
          ))}
        </select>
        <span>→</span>
        <select value={get} onChange={(e) => setGet(e.target.value as Material)}>
          {MATERIALS.map((m) => (
            <option key={m} value={m}>
              {RESOURCE_LABEL[m]}
            </option>
          ))}
        </select>
        <button className="btn btn-small" disabled={!canTrade(s, give, get)} onClick={() => dispatch((st) => trade(st, give, get))}>
          Trade
        </button>
      </div>
    </div>
  )
}

/** Opened from a Church's tile: light's secondary role. */
function OfferBox() {
  const [s, dispatch] = useGame()
  const f = CONFIG.faith
  return (
    <div className="trade-box">
      <span className="label" data-help="resource:light">
        Offering
      </span>
      <button className="btn btn-small" disabled={!canOffer(s)} onClick={() => dispatch(offerLight)}>
        Offer <CostChips cost={{ light: f.lightPerOffering }} /> for +{f.moralePerOffering} morale
      </button>
    </div>
  )
}

const RAID_REASON = {
  'no-camp': '',
  'not-frontier': 'Too far. Expand your border to reach it.',
  'no-troop': 'You need a troop to raid.',
} as const

function TilePanel({ hex, onSelect }: { hex: Hex | null; onSelect: (h: Hex | null) => void }) {
  const [s, dispatch] = useGame()
  if (!hex) return <p className="empty pad">Select a tile on the board. Drag to pan, scroll to zoom, right-drag to rotate.</p>
  const t = tileAt(s.map, hex)!
  const td = TERRAIN_DEFS[t.terrain]
  const c = city(s)
  const out = t.owned ? c.tiles[hexKey(t)] : null
  const isFrontier = frontier(s.map).some((f) => f.q === t.q && f.r === t.r)
  const def = t.building && BUILDING_DEFS[t.building.id]

  return (
    <div className="tile-panel">
      <header className="tile-head" style={{ '--terrain': TERRAIN_COLOR[t.terrain] } as React.CSSProperties} data-help={def ? `building:${def.id}` : `terrain:${t.terrain}`}>
        <span className="tile-swatch" />
        <div>
          <h3>{def ? buildingName(def.id, t.building!.level) : td.label}</h3>
          <p>
            {td.label} · yields {RESOURCE_LABEL[td.resource]}
            {td.affinity && (
              <>
                {' '}· breeds <span style={{ color: AFFINITY_COLOR[td.affinity] }}>{AFFINITY_LABEL[td.affinity]}</span>
              </>
            )}
          </p>
        </div>
        <span className={`tile-status ${t.owned ? 'owned' : isFrontier ? 'frontier' : ''}`}>{t.owned ? 'yours' : isFrontier ? 'border' : 'wild'}</span>
      </header>

      {out && (
        <div className="tile-output" data-help="tile-output">
          <span className="label">Produces</span>
          <div className="out-total">{fmtOutputs(out.output)}</div>
          <ul className="out-lines">
            {out.lines.map((l, i) => (
              <li key={i}>
                <span>{l.text}</span>
                <span>{fmtOutputs(l.add)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {def && def.kind !== 'capital' && (
        <div className="tile-actions">
          {def.maxLevel > 1 && (
            <div className="row">
              <span>
                Level {t.building!.level}/{def.maxLevel}
              </span>
              {t.building!.level < def.maxLevel && (
                <button className="btn btn-small" disabled={!canUpgradeBuilding(s, t)} onClick={() => dispatch((st) => upgradeBuilding(st, t))}>
                  {def.levelNames ? `Upgrade to ${buildingName(def.id, t.building!.level + 1)}` : `Raise to Lv${t.building!.level + 1}`}{' '}
                  <CostChips cost={def.cost(t.building!.level + 1)} />
                </button>
              )}
            </div>
          )}
          <button
            className="btn btn-small btn-ghost"
            data-help="demolish"
            onClick={() => confirm(`Demolish ${def.name}? You get back half its cost.`) && dispatch((st) => demolish(st, t))}
          >
            Demolish <CostChips cost={demolishRefund(s, t)} />
          </button>
        </div>
      )}

      {t.owned && def?.id === 'academy' && <AcademyPanel hex={t} />}
      {t.owned && def?.id === 'trading-post' && <TradeBox />}
      {t.owned && def?.id === 'church' && <OfferBox />}

      {t.owned && !t.building && <BuildOptions hex={t} />}

      {!t.owned && !t.camp && (
        <div className="tile-actions">
          {isFrontier ? (
            (() => {
              const gold = claimBlock(s, t, 'gold')
              const earth = claimBlock(s, t, 'earth')
              const block = gold && earth ? (gold === 'gold' ? earth : gold) : null
              return (
                <>
                  <div className="row">
                    <button className="btn btn-primary" data-help="claim" disabled={!!gold} onClick={() => dispatch((st) => claimTile(st, t, 'gold'))}>
                      Claim · <b className="gold">{claimCost(s)}</b> gold
                    </button>
                    <button className="btn" data-help="resource:earth" disabled={!!earth} onClick={() => dispatch((st) => claimTile(st, t, 'earth'))}>
                      Claim · <CostChips cost={{ earth: claimEarthCost(s) }} />
                    </button>
                  </div>
                  {block && <p className="muted">{CLAIM_REASON[block]}</p>}
                </>
              )
            })()
          ) : (
            <p className="muted">Wild land. Expand your border to reach it.</p>
          )}
        </div>
      )}

      {t.camp && (
        <div className="camp-card" data-help="camp">
          <h4>
            ☠ {t.camp.name} <small>{'I'.repeat(t.camp.strength)}</small>
          </h4>
          <p className="muted">
            About {CONFIG.camps.sizeByStrength[t.camp.strength]} defenders, up to{' '}
            <span style={{ color: RARITY_COLOR[campRarityHint(t.camp, s.round)] }}>{campRarityHint(t.camp, s.round)}</span>. Your units can die.
          </p>
          <p>
            Loot: <b className="gold">{campLoot(t.camp.strength, s.round).gold}</b> gold
            {td.resource !== 'food' && (
              <>
                , {campLoot(t.camp.strength, s.round).resource} {RESOURCE_LABEL[td.resource]}
              </>
            )}
            , and the tile.
          </p>
          {(() => {
            const block = raidBlock(s, t)
            return (
              <>
                <button className="btn btn-war" disabled={!!block} onClick={() => dispatch((st) => raidCamp(st, t))}>
                  Raid
                </button>
                {block && <p className="muted">{RAID_REASON[block]}</p>}
              </>
            )
          })()}
        </div>
      )}
      <button className="btn btn-small btn-ghost close" onClick={() => onSelect(null)}>
        Deselect
      </button>
    </div>
  )
}

function BuildOptions({ hex }: { hex: Hex }) {
  const [s, dispatch] = useGame()
  const options = BUILDINGS.map((b) => ({ b, block: buildBlock(s, hex, b.id) }))
    .filter(({ block }) => block === null || block === 'cost')
    .map(({ b, block }) => ({ b, block, out: evaluateBuilding(s.map, hex, b.id).output }))
    .sort((x, y) => Number(!!x.block) - Number(!!y.block) || outputScore(y.out) - outputScore(x.out))
    .slice(0, 6)
  return (
    <div className="build-options">
      <span className="label" data-help="adjacency">
        Best builds here
      </span>
      {options.map(({ b, block, out }) => (
        <button key={b.id} className={`build-opt ${block ? 'poor' : ''}`} disabled={!!block} onClick={() => dispatch((st) => placeBuilding(st, hex, b.id))}>
          <span className="bo-name">
            <BuildingGlyph def={b} /> {b.name}
          </span>
          <span className="bo-out">{outputParts(out).map((p) => p.text).join(' · ') || '—'}</span>
          <CostChips cost={b.cost(1)} />
        </button>
      ))}
    </div>
  )
}

// ── Right: muster ─────────────────────────────────────────────────────

function MusterPanel() {
  const [s, dispatch] = useGame()
  const [open, setOpen] = useState<string | null>(null)
  const current = open ? s.muster.find((m) => m.unit.uid === open) : undefined

  if (current) {
    return (
      <UnitDetail
        inline
        unit={current.unit}
        s={s}
        inTroop={false}
        onClose={() => setOpen(null)}
        actions={
          <button
            className="btn btn-primary"
            disabled={!canRecruit(s, current.unit.uid)}
            onClick={() => {
              dispatch((st) => recruit(st, current.unit.uid))
              setOpen(null)
            }}
          >
            Recruit <b className="morale-cost">✦{current.price}</b>
          </button>
        }
      />
    )
  }

  return (
    <div>
      <div className="muster-head">
        <p className="lede" data-help="muster">
          This turn’s muster. Recruit with <b>morale</b>; a new muster is called next turn.
        </p>
        <button className="btn btn-small" data-help="reroll" disabled={!canReroll(s)} onClick={() => dispatch(rerollMuster)}>
          ↻ Reroll <b className="morale-cost">✦{rerollCost(s)}</b>
        </button>
      </div>
      <div className="muster-morale" data-help="morale">
        ✦ {s.morale} morale · fields ×{moraleMult(s.morale).toFixed(2)}
      </div>
      {s.muster.length === 0 && <p className="empty">Everyone answered. A new muster is called next turn.</p>}
      <div className="portrait-grid">
        {s.muster.map((c) => (
          <button key={c.unit.uid} className={`portrait-tile ${c.price > s.morale ? 'poor' : ''}`} onClick={() => setOpen(c.unit.uid)} title={c.unit.name}>
            <Portrait unit={c.unit} size={84} />
            <span className="pt-name">{c.unit.name.split(' ').slice(0, 2).join(' ')}</span>
            <span className="pt-meta">
              <span style={{ color: RARITY_COLOR[c.unit.rarity] }}>{c.unit.rarity}</span> {TYPE_DEFS[c.unit.type].label}
            </span>
            <span className="pt-foot">
              <b className="morale-cost">✦{c.price}</b>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Right: scout ──────────────────────────────────────────────────────

function ScoutPanel({ onFocusTile }: { onFocusTile: (h: Hex) => void }) {
  const [s] = useGame()
  const g = s.ghost
  if (!g) return null
  const turnsLeft = CONFIG.turnsPerRound - s.turn
  const camps = s.map.tiles.filter((t) => t.camp)
  const border = new Set(frontier(s.map).map(hexKey))
  return (
    <div>
      <div className="scout-head" data-help="scout">
        <span className="label">Round {s.round + 1} opponent</span>
        <h3>{g.name}</h3>
        <p className="muted">
          A {TERRAIN_DEFS[g.homeBiome].label.toLowerCase()} civilization leaning{' '}
          {g.focus.map((a, i) => (
            <span key={a} style={{ color: AFFINITY_COLOR[a] }}>
              {i ? ' & ' : ''}
              {AFFINITY_LABEL[a]}
            </span>
          ))}
          . You meet them in {turnsLeft} turn{turnsLeft === 1 ? '' : 's'}. Lose and your civilization falls.
        </p>
      </div>
      <div className="scout-sealed">
        <span className="scout-seal">⚿</span>
        <p>Their troop stays hidden until the armies meet.</p>
      </div>
      <h3 className="section-title" data-help="camp">
        Camps
      </h3>
      <ul className="camp-list">
        {camps.map((t) => (
          <li key={hexKey(t)}>
            <button className="linkish" onClick={() => onFocusTile(t)}>
              ☠ {t.camp!.name} <small>{'I'.repeat(t.camp!.strength)}</small>
            </button>
            <span className={border.has(hexKey(t)) ? 'ok' : 'muted'}>{border.has(hexKey(t)) ? 'on your border' : 'out of reach'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
