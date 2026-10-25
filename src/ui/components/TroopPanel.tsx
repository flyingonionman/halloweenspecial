/**
 * The Army tab: an overview on top (team comp + compact synergies), this
 * turn's muster, then your troop and bench as portrait grids. A portrait opens the unit inline,
 * where it can be levelled, benched/deployed or released.
 */
import {
  AFFINITY_DEFS,
  CONFIG,
  EFFECT_TEXT,
  TYPE_DEFS,
  UNIT_TYPES,
  city,
  computeSynergies,
  moveToBench,
  moveToTroop,
  callMuster,
  canCallMuster,
  canRecruit,
  moraleMult,
  musterCost,
  recruit,
  releaseRefund,
  releaseUnit,
  swapUnits,
  synergyEffects,
  tierFor,
  troopAffinityPoints,
  troopSize,
  type Affinity,
  type AffinityPoints,
  type Effects,
  type Unit,
} from '../../game'
import { useState } from 'react'
import { useGame } from '../useGame'
import { UnitDetail } from './UnitDetail'
import { AffinityBadge } from './UnitCard'
import { Portrait } from './Portrait'
import { deny } from '../toast'
import { AFFINITY_COLOR, AFFINITY_GLYPH, RARITY_COLOR, TYPE_GLYPH } from '../theme'

export const effectsText = (fx: Effects) =>
  (Object.entries(fx) as [keyof typeof EFFECT_TEXT, number][]).map(([k, v]) => EFFECT_TEXT[k](v)).join(', ')


export function ArmyPanel() {
  const [s, dispatch] = useGame()
  const [detail, setDetail] = useState<string | null>(null)
  const detailUnit = detail ? [...s.troop, ...s.bench].find((u) => u.uid === detail) : undefined
  const citizen = detail ? s.muster.find((m) => m.unit.uid === detail) : undefined
  const size = troopSize(s)
  const c = city(s)
  const synergies = computeSynergies(s.troop, c.affinityLevels)
  // Grouped by affinity tier; within a tier, active synergies and bigger stacks first.
  const sorted = [...synergies].sort(
    (a, b) => AFFINITY_DEFS[a.def.id].tier - AFFINITY_DEFS[b.def.id].tier || b.tier - a.tier || b.points[0]! - a.points[0]!,
  )

  // Drag a tile onto another to swap places; onto an empty post or the bench to move it there.
  const [dragging, setDragging] = useState<string | null>(null)
  const dropZone = (target: string) => ({
    onDragOver: (e: React.DragEvent) => dragging && e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const uid = dragging
      setDragging(null)
      if (!uid) return
      dispatch((st) => (target === 'troop' ? moveToTroop(st, uid) : target === 'bench' ? moveToBench(st, uid) : swapUnits(st, uid, target)))
    },
  })
  const tile = (u: Unit) => (
    <UnitTile
      key={u.uid}
      unit={u}
      onOpen={() => setDetail(u.uid)}
      className={dragging === u.uid ? 'dragging' : ''}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', u.uid)
        setDragging(u.uid)
      }}
      onDragEnd={() => setDragging(null)}
      {...dropZone(u.uid)}
    />
  )

  if (citizen) {
    return (
      <UnitDetail
        inline
        unit={citizen.unit}
        s={s}
        inTroop={false}
        onClose={() => setDetail(null)}
        actions={
          <button
            className="btn btn-primary"
            onClick={(e) => {
              if (!canRecruit(s, citizen.unit.uid)) {
                deny(e.currentTarget, s.morale < citizen.price ? `You are missing ${citizen.price - s.morale} morale.` : 'Your troop and bench are full.')
                return
              }
              dispatch((st) => recruit(st, citizen.unit.uid))
              setDetail(null)
            }}
          >
            Enlist <b className="morale-cost">✦{citizen.price}</b>
          </button>
        }
      />
    )
  }

  if (detailUnit) {
    const inTroop = s.troop.includes(detailUnit)
    const uid = detailUnit.uid
    return (
      <UnitDetail
        inline
        unit={detailUnit}
        s={s}
        inTroop={inTroop}
        onClose={() => setDetail(null)}
        actions={
          <>
            {inTroop ? (
              <button className="btn btn-small" disabled={s.bench.length >= CONFIG.benchSize} onClick={() => dispatch((st) => moveToBench(st, uid))}>
                Bench
              </button>
            ) : (
              <button className="btn btn-small" onClick={() => dispatch((st) => moveToTroop(st, uid))}>
                {s.troop.length < size ? 'Deploy' : 'Swap in'}
              </button>
            )}
            <button
              className="btn btn-small btn-ghost"
              data-help="release"
              onClick={() => {
                if (!confirm(`Release ${detailUnit.name}? Refund: ${releaseRefund(detailUnit)} morale`)) return
                dispatch((st) => releaseUnit(st, uid))
                setDetail(null)
              }}
            >
              Release ✕
            </button>
          </>
        }
      />
    )
  }

  const comp = UNIT_TYPES.map((t) => ({ t, n: s.troop.filter((u) => u.type === t).length })).filter((x) => x.n > 0)

  return (
    <div className="troop-panel">
      <h3 className="section-title first" data-help="troop">
        Troop <small>{s.troop.length}/{size}</small>
      </h3>

      {/* Overview: team comp, then one compact line per synergy. */}
      <div className="troop-summary">
        {comp.length > 0 ? (
          <div className="ts-comp" data-help="troop">
            {comp.map(({ t, n }) => (
              <span key={t} data-help={`type:${t}`} title={TYPE_DEFS[t].label}>
                {TYPE_GLYPH[t]} {TYPE_DEFS[t].label} <b>×{n}</b>
              </span>
            ))}
          </div>
        ) : (
          <p className="empty">No one is deployed. Recruit below and enlist citizens.</p>
        )}
        {sorted.length > 0 ? (
          <ul className="syn-compact" data-help="synergies">
            {sorted.map((syn) => {
              const a = syn.def.id
              const preview = syn.tier > 0 ? syn.effects : synergyEffects(syn.def, 1, syn.level)
              return (
                <li
                  key={a}
                  className={syn.tier > 0 ? 'active' : ''}
                  data-help={`synergy:${a}`}
                  title={`Tier ${AFFINITY_DEFS[a].tier} affinity · academy Lv${syn.level} (×${CONFIG.affinity.levelMult[syn.level]})`}
                >
                  <span className="syn-tier">
                    {[1, 2, 3, 4].map((t) => (
                      <i key={t} className={t <= syn.tier ? 'on' : ''} />
                    ))}
                  </span>
                  <span className="sc-name" style={{ color: AFFINITY_COLOR[a] }}>
                    {AFFINITY_GLYPH[a]} {syn.def.name}
                  </span>
                  <span className="sc-pts">
                    {syn.points[0]}
                    {syn.nextAt !== null && <small>/{syn.nextAt}</small>}
                  </span>
                  <span className="sc-fx">{effectsText(preview)}</span>
                </li>
              )
            })}
          </ul>
        ) : (
          s.troop.length > 0 && <p className="empty">No synergies: plain citizens carry no affinity. Academies change that.</p>
        )}
      </div>

      <Muster onOpen={setDetail} toBench={s.troop.length >= size} />

      <h3 className="section-title" data-help="troop">
        Deployed
      </h3>
      <div className="portrait-grid">
        {Array.from({ length: size }, (_, i) => {
          const u = s.troop[i]
          return u ? tile(u) : <div key={`empty-${i}`} className="portrait-tile slot-empty" {...dropZone('troop')}>empty post</div>
        })}
      </div>

      <h3 className="section-title" data-help="bench">
        Bench <small>{s.bench.length}/{CONFIG.benchSize}</small>
      </h3>
      <div className="bench-drop" {...dropZone('bench')}>
        {s.bench.length === 0 ? (
          <p className="empty">Benched units stay with you between battles.</p>
        ) : (
          <div className="portrait-grid">{s.bench.map(tile)}</div>
        )}
      </div>
    </div>
  )
}

/** A unit as a face tile: portrait, name, rarity + type, level and veteran stars. */
function UnitTile({ unit, onOpen, className = '', ...drag }: { unit: Unit; onOpen: () => void } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...drag} className={`portrait-tile ${className}`} onClick={onOpen} title={unit.name}>
      <Portrait unit={unit} size={72} />
      <span className="pt-name">{unit.name.split(' ').slice(0, 2).join(' ')}</span>
      <span className="pt-meta">
        <span style={{ color: RARITY_COLOR[unit.rarity] }}>{unit.rarity}</span> {TYPE_DEFS[unit.type].label}
      </span>
      <AffinityBadge points={unit.affinities} />
      <span className="pt-foot">
        <b className="mono">Lv{unit.level}</b>
        {unit.battlesSurvived > 0 && <span className="pt-vet">{'★'.repeat(Math.min(3, unit.battlesSurvived))}</span>}
      </span>
    </button>
  )
}

/** This turn's muster: recruit for morale, then open a citizen to enlist them. */
function Muster({ onOpen, toBench }: { onOpen: (uid: string) => void; toBench: boolean }) {
  const [s, dispatch] = useGame()
  const totals = troopAffinityPoints(s.troop)
  const recruitNow = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!canCallMuster(s)) return deny(e.currentTarget, `You are missing ${musterCost(s) - s.morale} morale.`)
    dispatch(callMuster)
  }
  const first = s.musterCalls === 0

  return (
    <>
      <h3 className="section-title" data-help="muster">
        Muster
      </h3>
      <div className="muster-head">
        <p className="lede" data-help="muster">
          {first ? (
            <>
              Nobody is waiting. <b>Recruit</b> to call a muster for <b>morale</b>, then enlist who you want.
            </>
          ) : (
            <>
              This turn’s muster. Enlist with <b>morale</b>; recruiting again sends them home and calls new ones.
            </>
          )}
        </p>
        {!first && (
          <button className="btn btn-small" data-help="recruit" onClick={recruitNow}>
            ↻ Recruit again <b className="morale-cost">✦{musterCost(s)}</b>
          </button>
        )}
      </div>
      <div className="muster-morale" data-help="morale">
        ✦ {s.morale} morale · fields ×{moraleMult(s.morale).toFixed(2)}
      </div>
      {first && (
        <button className="btn btn-primary muster-call" data-help="recruit" onClick={recruitNow}>
          Recruit <b className="morale-cost">✦{musterCost(s)}</b>
        </button>
      )}
      {!first && s.muster.length === 0 && <p className="empty">Everyone answered. Recruit again to call more.</p>}
      <div className="portrait-grid">
        {s.muster.map((c) => (
          <button key={c.unit.uid} className={`portrait-tile ${c.price > s.morale ? 'poor' : ''}`} onClick={() => onOpen(c.unit.uid)} title={c.unit.name}>
            <Portrait unit={c.unit} size={84} />
            <span className="pt-name">{c.unit.name.split(' ').slice(0, 2).join(' ')}</span>
            <span className="pt-meta">
              <span style={{ color: RARITY_COLOR[c.unit.rarity] }}>{c.unit.rarity}</span> {TYPE_DEFS[c.unit.type].label}
            </span>
            <AffinityBadge points={c.unit.affinities} />
            <SynergyDelta unit={c.unit} totals={totals} toBench={toBench} />
            <span className="pt-foot">
              <b className="morale-cost">✦{c.price}</b>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

/** What enlisting this citizen adds to the troop's affinity points; ▲ when it reaches a new synergy tier. */
function SynergyDelta({ unit, totals, toBench }: { unit: Unit; totals: AffinityPoints; toBench: boolean }) {
  const gains = Object.entries(unit.affinities) as [Affinity, number][]
  if (gains.length === 0) return null
  if (toBench) return <span className="pt-delta">to bench</span>
  return (
    <>
      {gains.map(([a, n]) => {
        const after = (totals[a] ?? 0) + n
        const next = CONFIG.affinity.thresholds[tierFor(after)]
        const up = tierFor(after) > tierFor(totals[a] ?? 0)
        return (
          <span key={a} className={`pt-delta ${up ? 'up' : ''}`} style={{ color: AFFINITY_COLOR[a] }} title={up ? 'Reaches a new synergy tier' : undefined}>
            +{n} → {after}
            {next !== undefined && <small>/{next}</small>}
            {up && ' ▲'}
          </span>
        )
      })}
    </>
  )
}
