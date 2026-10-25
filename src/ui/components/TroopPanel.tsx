/**
 * The Troop tab: an overview on top (team comp + compact synergies), then
 * your troop and bench as portrait grids. A portrait opens the unit inline,
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
  releaseRefund,
  releaseUnit,
  synergyEffects,
  troopSize,
  type Effects,
  type Unit,
} from '../../game'
import { useState } from 'react'
import { useGame } from '../useGame'
import { UnitDetail } from './UnitDetail'
import { AffinityBadge } from './UnitCard'
import { Portrait } from './Portrait'
import { AFFINITY_COLOR, AFFINITY_GLYPH, RARITY_COLOR, TYPE_GLYPH } from '../theme'

export const effectsText = (fx: Effects) =>
  (Object.entries(fx) as [keyof typeof EFFECT_TEXT, number][]).map(([k, v]) => EFFECT_TEXT[k](v)).join(', ')


export function TroopPanel() {
  const [s, dispatch] = useGame()
  const [detail, setDetail] = useState<string | null>(null)
  const detailUnit = detail ? [...s.troop, ...s.bench].find((u) => u.uid === detail) : undefined
  const size = troopSize(s)
  const c = city(s)
  const synergies = computeSynergies(s.troop, c.affinityLevels)
  // Grouped by affinity tier; within a tier, active synergies and bigger stacks first.
  const sorted = [...synergies].sort(
    (a, b) => AFFINITY_DEFS[a.def.id].tier - AFFINITY_DEFS[b.def.id].tier || b.tier - a.tier || b.points[0]! - a.points[0]!,
  )

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
          <p className="empty">No one is deployed. Recruit in the Muster tab and enlist citizens.</p>
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

      <h3 className="section-title" data-help="troop">
        Deployed
      </h3>
      <div className="portrait-grid">
        {Array.from({ length: size }, (_, i) => {
          const u = s.troop[i]
          return u ? <UnitTile key={u.uid} unit={u} onOpen={() => setDetail(u.uid)} /> : <div key={`empty-${i}`} className="portrait-tile slot-empty">empty post</div>
        })}
      </div>

      <h3 className="section-title" data-help="bench">
        Bench <small>{s.bench.length}/{CONFIG.benchSize}</small>
      </h3>
      {s.bench.length === 0 ? (
        <p className="empty">Benched units stay with you between battles.</p>
      ) : (
        <div className="portrait-grid">
          {s.bench.map((u) => (
            <UnitTile key={u.uid} unit={u} onOpen={() => setDetail(u.uid)} />
          ))}
        </div>
      )}
    </div>
  )
}

/** A unit as a face tile: portrait, name, rarity + type, level and veteran stars. */
function UnitTile({ unit, onOpen }: { unit: Unit; onOpen: () => void }) {
  return (
    <button className="portrait-tile" onClick={onOpen} title={unit.name}>
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
