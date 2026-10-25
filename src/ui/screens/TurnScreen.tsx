import { useEffect, useMemo, useState } from 'react'
import {
  AFFINITIES,
  AFFINITY_LABEL,
  BUILDINGS,
  BUILDING_DEFS,
  CONFIG,
  MATERIALS,
  RARITIES,
  RESOURCE_LABEL,
  STOCK_RESOURCES,
  TERRAIN_DEFS,
  absTurn,
  affinityBirthWeights,
  affinityOdds,
  birthRarityOdds,
  birthsPerTurn,
  buildBlock,
  campLoot,
  campRarityHint,
  canDoTask,
  canRecruit,
  canTrade,
  canUpgradeBuilding,
  city,
  claimBlock,
  claimCost,
  claimTile,
  demolish,
  demolishRefund,
  doTask,
  evaluateBuilding,
  frontier,
  hexKey,
  ownedTiles,
  placeBuilding,
  raidBlock,
  raidCamp,
  recruit,
  taskText,
  taskTitle,
  territoryCap,
  tileAt,
  trade,
  upgradeBuilding,
  type BuildingDef,
  type BuildingId,
  type BuildingKind,
  type Cost,
  type Hex,
  type Material,
} from '../../game'
import { useGame } from '../useGame'
import { Board3D, type TilePreview } from '../board/Board3D'
import { UnitCard } from '../components/UnitCard'
import { TroopPanel } from '../components/TroopPanel'
import { costParts, fmtOutputs, outputParts, outputScore } from '../format'
import { AFFINITY_COLOR, AFFINITY_GLYPH, KIND_COLOR, RARITY_COLOR, RESOURCE_COLOR, RESOURCE_GLYPH, TERRAIN_COLOR } from '../theme'

type Tab = 'tile' | 'muster' | 'troop' | 'deeds' | 'scout'

export function TurnScreen() {
  const [s, dispatch] = useGame()
  const [selected, setSelected] = useState<Hex | null>(null)
  const [armed, setArmed] = useState<BuildingId | null>(null)
  const [tab, setTab] = useState<Tab>('muster')

  const frontierKeys = useMemo(() => new Set(frontier(s.map).map(hexKey)), [s.map])

  const previews = useMemo(() => {
    if (!armed) return null
    const out: Record<string, TilePreview> = {}
    let best = -Infinity
    const scored: [string, number, string][] = []
    for (const t of ownedTiles(s.map)) {
      const block = buildBlock(s, t, armed)
      if (block && block !== 'cost') continue
      const o = evaluateBuilding(s.map, t, armed).output
      const score = outputScore(o)
      best = Math.max(best, score)
      scored.push([hexKey(t), score, fmtOutputs(o)])
    }
    for (const [k, score, text] of scored) out[k] = { text, best: score === best && scored.length > 1 }
    return out
  }, [s, armed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setArmed(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onSelect = (h: Hex | null) => {
    if (armed && h) {
      if (!buildBlock(s, h, armed)) {
        dispatch((st) => placeBuilding(st, h, armed))
        setSelected(h)
        setTab('tile')
        setArmed(null)
      }
      return
    }
    setSelected(h)
    if (h) setTab('tile')
  }

  return (
    <div className="turn">
      <EconomyRail />
      <section className="board-wrap">
        <Board3D map={s.map} selected={selected} frontier={frontierKeys} previews={previews} onSelect={onSelect} />
        <BuildBar armed={armed} onArm={(id) => setArmed(armed === id ? null : id)} />
        {armed && (
          <div className="armed-hint">
            Placing <b>{BUILDING_DEFS[armed].name}</b>. Click a highlighted tile. <kbd>Esc</kbd> to cancel.
          </div>
        )}
      </section>
      <aside className="side">
        <nav className="side-tabs">
          {(
            [
              ['tile', 'Tile'],
              ['muster', `Muster ${s.muster.length}`],
              ['troop', 'Troop'],
              ['deeds', s.deedDone ? 'Deeds ✓' : 'Deeds •'],
              ['scout', 'Scout'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} className={`${tab === id ? 'on' : ''} ${id === 'deeds' && !s.deedDone ? 'pending' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="side-body">
          {tab === 'tile' && <TilePanel hex={selected} onSelect={onSelect} />}
          {tab === 'muster' && <MusterPanel />}
          {tab === 'troop' && <TroopPanel />}
          {tab === 'deeds' && (
            <DeedsPanel
              onFocusTile={(h) => {
                setSelected(h)
                setTab('tile')
              }}
            />
          )}
          {tab === 'scout' && <ScoutPanel />}
        </div>
      </aside>
    </div>
  )
}

// ── Economy rail ──────────────────────────────────────────────────────

function EconomyRail() {
  const [s, dispatch] = useGame()
  const c = city(s)
  const owned = ownedTiles(s.map).length
  const aff = affinityOdds(affinityBirthWeights(c))
  const rar = birthRarityOdds(s.population, s.species)
  const [give, setGive] = useState<Material>('timber')
  const [get, setGet] = useState<Material>('iron')

  return (
    <aside className="rail">
      <h3 className="section-title first">Stores</h3>
      <ul className="stock">
        {STOCK_RESOURCES.map((r) => (
          <li key={r} className={s.stock[r] === 0 && !c.yields[r] ? 'none' : ''}>
            <span className="res-glyph" style={{ color: RESOURCE_COLOR[r] }}>
              {RESOURCE_GLYPH[r]}
            </span>
            <span className="res-name">{RESOURCE_LABEL[r]}</span>
            <span className="res-amt">{s.stock[r]}</span>
            <span className="res-delta">{c.yields[r] ? `+${c.yields[r]}` : ''}</span>
          </li>
        ))}
      </ul>

      <dl className="city-stats">
        <div>
          <dt>
            <span style={{ color: RESOURCE_COLOR.food }}>{RESOURCE_GLYPH.food}</span> Food
          </dt>
          <dd>{c.yields.food}</dd>
        </div>
        <div>
          <dt>Growth</dt>
          <dd>+{Math.round((c.growth + s.growthBoost) * 100)}%</dd>
        </div>
        <div>
          <dt>Births</dt>
          <dd>{birthsPerTurn(c.births, s.species)}/turn</dd>
        </div>
        <div>
          <dt>Land</dt>
          <dd>
            {owned}/{territoryCap(s)}
          </dd>
        </div>
        {(c.atkPct > 0 || c.hpPct > 0 || c.defPct > 0) && (
          <div className="wide">
            <dt>Troop</dt>
            <dd>{fmtOutputs({ atkPct: c.atkPct, hpPct: c.hpPct, defPct: c.defPct })}</dd>
          </div>
        )}
      </dl>

      <h3 className="section-title">Births</h3>
      <div className="odds-bar thin" title="Rarity odds">
        {RARITIES.map((r) =>
          rar[r] > 0 ? (
            <span key={r} style={{ flexGrow: rar[r], background: RARITY_COLOR[r] }} title={`${r}: ${(rar[r] * 100).toFixed(1)}%`} />
          ) : null,
        )}
      </div>
      <ul className="aff-odds">
        {[...AFFINITIES]
          .sort((a, b) => aff[b] - aff[a])
          .map((a) => (
            <li key={a} title={`Academy Lv${c.affinityLevels[a]} · attune ${c.attune[a]}`}>
              <span style={{ color: AFFINITY_COLOR[a] }}>{AFFINITY_GLYPH[a]}</span>
              <span className="aff-name">{AFFINITY_LABEL[a]}</span>
              <span className="aff-bar">
                <i style={{ width: `${aff[a] * 100}%`, background: AFFINITY_COLOR[a] }} />
              </span>
              <span className="aff-pct">{Math.round(aff[a] * 100)}%</span>
              {c.affinityLevels[a] > 0 && <span className="aff-lv">Lv{c.affinityLevels[a]}</span>}
            </li>
          ))}
      </ul>

      {c.tradeRate !== null && (
        <>
          <h3 className="section-title">Trade {c.tradeRate}:1</h3>
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
        </>
      )}

      <h3 className="section-title">Chronicle</h3>
      <ol className="chronicle">
        {[...s.log].reverse().slice(0, 8).map((l, i) => (
          <li key={i}>
            <small>
              R{l.round + 1}·T{l.turn + 1}
            </small>{' '}
            {l.text}
          </li>
        ))}
      </ol>
    </aside>
  )
}

// ── Build bar ─────────────────────────────────────────────────────────

const GROUPS: { kind: BuildingKind; label: string }[] = [
  { kind: 'civic', label: 'Civic' },
  { kind: 'extractor', label: 'Extract' },
  { kind: 'military', label: 'Military' },
  { kind: 'research', label: 'Academies' },
]

function BuildBar({ armed, onArm }: { armed: BuildingId | null; onArm: (id: BuildingId) => void }) {
  const [s] = useGame()
  const [group, setGroup] = useState<BuildingKind>('civic')
  const built = new Set(s.map.tiles.map((t) => t.building?.id))
  return (
    <div className="buildbar">
      <div className="bb-groups">
        {GROUPS.map((g) => (
          <button key={g.kind} className={group === g.kind ? 'on' : ''} style={{ '--kind': KIND_COLOR[g.kind] } as React.CSSProperties} onClick={() => setGroup(g.kind)}>
            {g.label}
          </button>
        ))}
      </div>
      <div className="bb-items">
        {BUILDINGS.filter((b) => b.kind === group).map((b) => {
          const done = b.unique && built.has(b.id)
          const affordable = (Object.entries(b.cost(1)) as [keyof typeof s.stock, number][]).every(([k, v]) => s.stock[k] >= v)
          return (
            <button
              key={b.id}
              className={`bb-item ${armed === b.id ? 'armed' : ''} ${affordable ? '' : 'poor'}`}
              disabled={done}
              title={`${b.name}: ${b.text}`}
              onClick={() => onArm(b.id)}
            >
              <span className="bb-name">
                <BuildingGlyph def={b} /> {b.name}
              </span>
              <CostChips cost={b.cost(1)} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function BuildingGlyph({ def }: { def: BuildingDef }) {
  if (def.affinity) return <span style={{ color: AFFINITY_COLOR[def.affinity] }}>{AFFINITY_GLYPH[def.affinity]}</span>
  if (def.kind === 'extractor') {
    const r = Object.keys(def.base)[0] as keyof typeof RESOURCE_GLYPH
    return <span style={{ color: RESOURCE_COLOR[r] }}>{RESOURCE_GLYPH[r]}</span>
  }
  const g: Partial<Record<BuildingId, string>> = { farm: '❦', housing: '⌂', market: '⚖', 'trading-post': '⇄', barracks: '⚔', walls: '▦', armory: '⛨' }
  return <span style={{ color: KIND_COLOR[def.kind] }}>{g[def.id] ?? '◆'}</span>
}

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

// ── Tile panel ────────────────────────────────────────────────────────

const CLAIM_REASON = {
  'not-frontier': 'Not on your border.',
  camp: 'A camp holds this tile. Raze it to claim it.',
  cap: 'Your people can’t hold more land yet. Grow your population.',
  gold: 'Not enough gold.',
} as const

const RAID_REASON = {
  'no-camp': '',
  'not-frontier': 'Too far. Expand your border to reach it.',
  'deed-used': 'You’ve already taken this turn’s deed.',
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
      <header className="tile-head" style={{ '--terrain': TERRAIN_COLOR[t.terrain] } as React.CSSProperties}>
        <span className="tile-swatch" />
        <div>
          <h3>{def ? def.name : td.label}</h3>
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
        <div className="tile-output">
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
                  Raise to Lv{t.building!.level + 1} <CostChips cost={def.cost(t.building!.level + 1)} />
                </button>
              )}
            </div>
          )}
          <p className="muted">{def.text}</p>
          <button
            className="btn btn-small btn-ghost"
            onClick={() => confirm(`Demolish ${def.name}? You get back half its cost.`) && dispatch((st) => demolish(st, t))}
          >
            Demolish <CostChips cost={demolishRefund(s, t)} />
          </button>
        </div>
      )}

      {t.owned && !t.building && td.buildable && <BuildOptions hex={t} />}
      {t.owned && !td.buildable && <p className="muted pad">Lakes can’t be built on, but they feed you and boost farms and trading posts beside them.</p>}

      {!t.owned && !t.camp && (
        <div className="tile-actions">
          {isFrontier ? (
            (() => {
              const block = claimBlock(s, t)
              return (
                <>
                  <button className="btn btn-primary" disabled={!!block} onClick={() => dispatch((st) => claimTile(st, t))}>
                    Claim for <b className="gold">{claimCost(s)}</b> gold
                  </button>
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
        <div className="camp-card">
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
                  Raid (uses your deed)
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
  return (
    <div className="build-options">
      <span className="label">Build here</span>
      {options.map(({ b, block, out }) => (
        <button key={b.id} className={`build-opt ${block ? 'poor' : ''}`} disabled={!!block} onClick={() => dispatch((st) => placeBuilding(st, hex, b.id))}>
          <span className="bo-name">
            <BuildingGlyph def={b} /> {b.name}
          </span>
          <span className="bo-out">{outputParts(out).map((p) => p.text).join(' · ') || b.text}</span>
          <CostChips cost={b.cost(1)} />
        </button>
      ))}
    </div>
  )
}

// ── Muster ────────────────────────────────────────────────────────────

function MusterPanel() {
  const [s, dispatch] = useGame()
  const now = absTurn(s)
  const sorted = [...s.muster].sort((a, b) => a.leavesAfter - b.leavesAfter)
  return (
    <div>
      <p className="lede pad-b">
        Citizens born to your land. Each waits {CONFIG.muster.lifespan} turns to be recruited, then moves on. Recruits join your troop, or your bench if it’s full.
      </p>
      <div className="muster-list">
        {sorted.length === 0 && <p className="empty">No one is waiting. More are born each turn.</p>}
        {sorted.map((c) => {
          const left = c.leavesAfter - now
          return (
            <UnitCard
              key={c.unit.uid}
              unit={c.unit}
              dim={c.price > s.stock.gold}
              footer={
                <div className="uc-actions">
                  <button className="btn btn-buy" disabled={!canRecruit(s, c.unit.uid)} onClick={() => dispatch((st) => recruit(st, c.unit.uid))}>
                    Recruit <b className="gold">{c.price}</b>
                  </button>
                  <span className={`leaves ${left <= 1 ? 'soon' : ''}`}>{left <= 0 ? 'leaving' : `${left}t`}</span>
                </div>
              }
            />
          )
        })}
      </div>
    </div>
  )
}

// ── Deeds ─────────────────────────────────────────────────────────────

function DeedsPanel({ onFocusTile }: { onFocusTile: (h: Hex) => void }) {
  const [s, dispatch] = useGame()
  const camps = s.map.tiles.filter((t) => t.camp)
  const reachable = camps.filter((t) => frontier(s.map).some((f) => f.q === t.q && f.r === t.r))
  return (
    <div>
      <p className="lede pad-b">
        One deed per turn. Tasks are safe. Raiding a camp is real combat: units can die, but it pays and claims the land.
        {s.deedDone && <b> You’ve taken this turn’s deed.</b>}
      </p>
      <div className="tasks">
        {s.tasks.map((t) => (
          <button key={t.id} className="task" disabled={!canDoTask(s, t.id)} onClick={() => dispatch((st) => doTask(st, t.id))}>
            <span className="task-title">{taskTitle(t)}</span>
            <span className="task-text">{taskText(t)}</span>
          </button>
        ))}
      </div>
      <h3 className="section-title">Camps</h3>
      {camps.length === 0 && <p className="empty">The land is quiet.</p>}
      <ul className="camp-list">
        {camps.map((t) => (
          <li key={hexKey(t)}>
            <button className="linkish" onClick={() => onFocusTile(t)}>
              ☠ {t.camp!.name} <small>{'I'.repeat(t.camp!.strength)}</small>
            </button>
            <span className={reachable.includes(t) ? 'ok' : 'muted'}>{reachable.includes(t) ? 'on your border' : 'out of reach'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Scout ─────────────────────────────────────────────────────────────

function ScoutPanel() {
  const [s] = useGame()
  const g = s.ghost
  if (!g) return null
  const turnsLeft = CONFIG.turnsPerRound - s.turn
  return (
    <div>
      <div className="scout-head">
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
          . You meet them after turn {CONFIG.turnsPerRound}: {turnsLeft} turn{turnsLeft === 1 ? '' : 's'} from now.
        </p>
        <p className="muted">
          Their works: {fmtOutputs({ atkPct: g.bonuses.atkMult - 1, hpPct: g.bonuses.hpMult - 1, defPct: g.bonuses.defMult - 1 }) || 'none'}
        </p>
      </div>
      <div className="muster-list">
        {g.troop.map((u) => (
          <UnitCard key={u.uid} unit={u} />
        ))}
      </div>
    </div>
  )
}
