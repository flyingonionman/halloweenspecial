import { useMemo, useState } from 'react'
import {
  BUILDINGS,
  CLASSES,
  CONFIG,
  ELEMENTS,
  RARITIES,
  buildingCost,
  buildingLevel,
  build,
  buyUnit,
  canBuild,
  canBuy,
  canUpgrade,
  civTier,
  computeSynergies,
  growthMultiplier,
  income,
  moveToBench,
  moveToTroop,
  rarityOdds,
  releaseRefund,
  releaseUnit,
  unitPower,
  upgradeCost,
  upgradeUnit,
  type Element,
  type Rarity,
  type UnitClass,
} from '../../game'
import { useGame } from '../useGame'
import { UnitCard } from '../components/UnitCard'
import { CLASS_GLYPH, ELEMENT_COLOR, RARITY_COLOR, fmtPop } from '../theme'

type Tab = 'market' | 'civ'

export function EraScreen() {
  const [tab, setTab] = useState<Tab>('market')
  return (
    <div className="era">
      <section className="era-main">
        <nav className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'market'} className={tab === 'market' ? 'on' : ''} onClick={() => setTab('market')}>
            Market
          </button>
          <button role="tab" aria-selected={tab === 'civ'} className={tab === 'civ' ? 'on' : ''} onClick={() => setTab('civ')}>
            Civilization
          </button>
        </nav>
        {tab === 'market' ? <Market /> : <CivPanel />}
      </section>
      <TroopPanel />
    </div>
  )
}

// ── Market ────────────────────────────────────────────────────────────

type Sort = 'power' | 'price' | 'rarity'

function Market() {
  const [s, dispatch] = useGame()
  const [rarity, setRarity] = useState<Rarity | 'all'>('all')
  const [cls, setCls] = useState<UnitClass | 'all'>('all')
  const [el, setEl] = useState<Element | 'all'>('all')
  const [affordable, setAffordable] = useState(false)
  const [sort, setSort] = useState<Sort>('power')

  const offers = useMemo(() => {
    const list = s.shop.filter(
      (o) =>
        (rarity === 'all' || o.unit.rarity === rarity) &&
        (cls === 'all' || o.unit.cls === cls) &&
        (el === 'all' || o.unit.element === el) &&
        (!affordable || o.price <= s.civ.money),
    )
    const key = {
      power: (o: (typeof list)[number]) => -unitPower(o.unit),
      price: (o: (typeof list)[number]) => o.price,
      rarity: (o: (typeof list)[number]) => -RARITIES.indexOf(o.unit.rarity) * 1e6 - unitPower(o.unit),
    }[sort]
    return list.sort((a, b) => key(a) - key(b))
  }, [s.shop, s.civ.money, rarity, cls, el, affordable, sort])

  const rarityCounts = useMemo(() => {
    const c: Partial<Record<Rarity, number>> = {}
    for (const o of s.shop) c[o.unit.rarity] = (c[o.unit.rarity] ?? 0) + 1
    return c
  }, [s.shop])

  const full = s.troop.length >= CONFIG.troopSize && s.bench.length >= CONFIG.benchSize

  return (
    <div className="market">
      <div className="market-head">
        <p className="lede">
          {s.shop.length} souls answer the muster this era. The market rerolls when the era ends; your bench does not.
        </p>
        <div className="filters">
          <Chips
            label="Rarity"
            value={rarity}
            onChange={setRarity}
            options={RARITIES.filter((r) => rarityCounts[r])}
            render={(r) => (
              <>
                <i className="dot" style={{ background: RARITY_COLOR[r] }} /> {r} <small>{rarityCounts[r]}</small>
              </>
            )}
          />
          <Chips label="Class" value={cls} onChange={setCls} options={CLASSES} render={(c) => <>{CLASS_GLYPH[c]} {c}</>} />
          <Chips
            label="Element"
            value={el}
            onChange={setEl}
            options={ELEMENTS}
            render={(e) => (
              <>
                <i className="dot" style={{ background: ELEMENT_COLOR[e] }} /> {e}
              </>
            )}
          />
          <div className="chips">
            <span className="chips-label">Sort</span>
            {(['power', 'price', 'rarity'] as Sort[]).map((k) => (
              <button key={k} className={`chip ${sort === k ? 'on' : ''}`} onClick={() => setSort(k)}>
                {k}
              </button>
            ))}
            <button className={`chip ${affordable ? 'on' : ''}`} onClick={() => setAffordable(!affordable)}>
              affordable only
            </button>
          </div>
        </div>
        {full && <p className="warn">Troop and bench are full. Release a unit to buy more.</p>}
      </div>

      <div className="offer-grid">
        {offers.map((o) => (
          <UnitCard
            key={o.unit.uid}
            unit={o.unit}
            dim={o.price > s.civ.money}
            footer={
              <button className="btn btn-buy" disabled={!canBuy(s, o.unit.uid)} onClick={() => dispatch((st) => buyUnit(st, o.unit.uid))}>
                Recruit <b className="gold">{o.price}</b>
              </button>
            }
          />
        ))}
        {offers.length === 0 && <p className="empty">No one matching those filters this era.</p>}
      </div>
    </div>
  )
}

function Chips<T extends string>({
  label,
  value,
  onChange,
  options,
  render,
}: {
  label: string
  value: T | 'all'
  onChange: (v: T | 'all') => void
  options: readonly T[]
  render: (v: T) => React.ReactNode
}) {
  return (
    <div className="chips">
      <span className="chips-label">{label}</span>
      <button className={`chip ${value === 'all' ? 'on' : ''}`} onClick={() => onChange('all')}>
        all
      </button>
      {options.map((o) => (
        <button key={o} className={`chip ${value === o ? 'on' : ''}`} onClick={() => onChange(value === o ? 'all' : o)}>
          {render(o)}
        </button>
      ))}
    </div>
  )
}

// ── Civilization ──────────────────────────────────────────────────────

function CivPanel() {
  const [s, dispatch] = useGame()
  const odds = rarityOdds(s.civ.population)
  const tier = civTier(s.civ.population)
  const nextRarity = RARITIES.find((r) => CONFIG.rarityThresholds[r] > s.civ.population)
  const nextPop = Math.round(s.civ.population * growthMultiplier(s.civ))

  return (
    <div className="civ">
      <div className="civ-stats">
        <div className="big-stat">
          <span className="label">Population</span>
          <span className="value">{s.civ.population.toLocaleString()}</span>
          <span className="sub">
            → {nextPop.toLocaleString()} next era (×{growthMultiplier(s.civ).toFixed(2)})
          </span>
        </div>
        <div className="big-stat">
          <span className="label">Tier</span>
          <span className="value" style={{ color: RARITY_COLOR[tier] }}>
            {tier}
          </span>
          <span className="sub">
            {nextRarity
              ? `${nextRarity} unlocks at ${fmtPop(CONFIG.rarityThresholds[nextRarity])}`
              : 'every rarity unlocked'}
          </span>
        </div>
        <div className="big-stat">
          <span className="label">Income</span>
          <span className="value gold">+{income(s.civ)}</span>
          <span className="sub">per era</span>
        </div>
      </div>

      <div className="odds">
        <span className="label">Muster odds</span>
        <div className="odds-bar">
          {RARITIES.map((r) =>
            odds[r] > 0 ? (
              <span key={r} style={{ flexGrow: odds[r], background: RARITY_COLOR[r] }} title={`${r}: ${(odds[r] * 100).toFixed(1)}%`}>
                {odds[r] > 0.07 && `${r} ${(odds[r] * 100).toFixed(0)}%`}
              </span>
            ) : null,
          )}
        </div>
      </div>

      <h3 className="section-title">Works &amp; buildings</h3>
      <p className="lede">
        Halls favour their tag: more of those units in the market, better quality rolls, and a chance to arrive one rarity
        higher.
      </p>
      <div className="building-grid">
        {BUILDINGS.map((b) => {
          const level = buildingLevel(s.civ, b.id)
          const cost = buildingCost(s.civ, b.id)
          const tagColor = b.tag && (ELEMENT_COLOR as Record<string, string>)[b.tag]
          return (
            <div key={b.id} className={`building ${level > 0 ? 'built' : ''}`}>
              <div className="b-head">
                <span className="b-glyph" style={tagColor ? { color: tagColor } : undefined}>
                  {b.tag && b.tag in CLASS_GLYPH ? CLASS_GLYPH[b.tag as UnitClass] : b.effect === 'growth' ? '❦' : b.effect === 'income' ? '⚖' : '◆'}
                </span>
                <span className="b-name">{b.name}</span>
                <span className="b-pips">
                  {Array.from({ length: CONFIG.buildings.maxLevel }, (_, i) => (
                    <i key={i} className={i < level ? 'on' : ''} />
                  ))}
                </span>
              </div>
              <p className="b-text">{b.text}</p>
              <button className="btn btn-small" disabled={!canBuild(s, b.id)} onClick={() => dispatch((st) => build(st, b.id))}>
                {cost === null ? 'Complete' : (
                  <>
                    {level === 0 ? 'Build' : 'Expand'} <b className="gold">{cost}</b>
                  </>
                )}
              </button>
            </div>
          )
        })}
      </div>

      <p className="stub">Species traits and tech direction: coming next.</p>
    </div>
  )
}

// ── Troop & bench ─────────────────────────────────────────────────────

function TroopPanel() {
  const [s, dispatch] = useGame()
  const synergies = computeSynergies(s.troop)
    .sort((a, b) => b.tier - a.tier || b.count - a.count)

  const actions = (uid: string, where: 'troop' | 'bench') => {
    const u = [...s.troop, ...s.bench].find((x) => x.uid === uid)!
    const cost = upgradeCost(u)
    return (
      <div className="uc-actions">
        <button className="btn btn-small" disabled={!canUpgrade(s, uid)} onClick={() => dispatch((st) => upgradeUnit(st, uid))}>
          {cost === null ? 'Max' : (
            <>
              Lv↑ <b className="gold">{cost}</b>
            </>
          )}
        </button>
        {where === 'troop' ? (
          <button className="btn btn-small" disabled={s.bench.length >= CONFIG.benchSize} onClick={() => dispatch((st) => moveToBench(st, uid))}>
            Bench
          </button>
        ) : (
          <button className="btn btn-small" onClick={() => dispatch((st) => moveToTroop(st, uid))}>
            {s.troop.length < CONFIG.troopSize ? 'Deploy' : 'Swap in'}
          </button>
        )}
        <button
          className="btn btn-small btn-ghost"
          title={`Release for ${releaseRefund(u)}`}
          onClick={() => confirm(`Release ${u.name}? Refund: ${releaseRefund(u)}`) && dispatch((st) => releaseUnit(st, uid))}
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <aside className="troop">
      <h2 className="panel-title">
        Troop <small>{s.troop.length}/{CONFIG.troopSize}</small>
      </h2>
      <div className="troop-slots">
        {Array.from({ length: CONFIG.troopSize }, (_, i) => {
          const u = s.troop[i]
          return u ? (
            <UnitCard key={u.uid} unit={u} compact footer={actions(u.uid, 'troop')} />
          ) : (
            <div key={`empty-${i}`} className="slot-empty">
              empty post
            </div>
          )
        })}
      </div>

      <h3 className="section-title">Synergies</h3>
      <ul className="synergies">
        {synergies.length === 0 && <li className="empty">Recruit units to see synergies.</li>}
        {synergies.map((syn) => (
          <li key={syn.def.tag} className={syn.tier >= 0 ? 'active' : ''}>
            <span className="syn-count">
              {syn.count}
              {syn.next !== null && <small>/{syn.next}</small>}
            </span>
            <span className="syn-name">
              {syn.def.name} <small>({syn.def.tag})</small>
            </span>
            <span className="syn-text">{syn.def.describe(Math.max(0, syn.tier))}</span>
          </li>
        ))}
      </ul>

      <h3 className="section-title">
        Bench <small>{s.bench.length}/{CONFIG.benchSize}</small>
      </h3>
      <div className="bench">
        {s.bench.length === 0 && <p className="empty">Benched units keep across eras.</p>}
        {s.bench.map((u) => (
          <UnitCard key={u.uid} unit={u} compact footer={actions(u.uid, 'bench')} />
        ))}
      </div>
    </aside>
  )
}
