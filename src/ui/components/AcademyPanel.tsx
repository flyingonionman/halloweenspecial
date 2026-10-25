/**
 * Opened from an academy's tile. Growing an academy (dedicating it, raising
 * it, evolving it into a higher-tier affinity) costs an upfront payment plus a
 * standing throughput commitment: essence per turn, taken from your income for
 * as long as it stands. Changes take effect next turn.
 */
import { useState } from 'react'
import {
  AFFINITY_DEFS,
  AFFINITY_LABEL,
  CONFIG,
  RESOURCE_LABEL,
  academyBlock,
  academyCommitment,
  academyFlow,
  academyMoveCost,
  academyMoves,
  affinityOdds,
  city,
  commitAcademy,
  flowShortfall,
  netYields,
  pointOdds,
  shortfall,
  tileAt,
  type AcademyMove,
  type Affinity,
  type Cost,
  type Hex,
} from '../../game'
import { useGame } from '../useGame'
import { deny } from '../toast'
import { CostChips } from './BuildingBits'
import { AFFINITY_COLOR, AFFINITY_GLYPH, RESOURCE_COLOR, RESOURCE_GLYPH } from '../theme'

const pct = (v: number) => `${Math.round(v * 100)}%`
const article = (word: string) => `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`

/** Essence per turn, e.g. "♨2 ▲2 /turn". */
export function FlowChips({ flow, sign = '' }: { flow: Cost; sign?: string }) {
  const parts = Object.entries(flow).filter(([, v]) => v! > 0) as [keyof typeof RESOURCE_GLYPH, number][]
  if (!parts.length) return <span className="flow-chips muted">no upkeep</span>
  return (
    <span className="flow-chips" title="Essence per turn, taken from your income">
      {parts.map(([k, v]) => (
        <span key={k} style={{ color: RESOURCE_COLOR[k] }} title={`${v} ${RESOURCE_LABEL[k]} per turn`}>
          {sign}
          {v}
          {RESOURCE_GLYPH[k]}
        </span>
      ))}
      <small>/turn</small>
    </span>
  )
}

export function AcademyPanel({ hex }: { hex: Hex }) {
  const [s] = useGame()
  const b = tileAt(s.map, hex)!.building!
  const now = b.affinity && b.level > 0 ? { affinity: b.affinity, level: b.level } : null
  const committed = academyCommitment(b)
  return (
    <div className="academy" data-help="kind:research">
      <span className="label">
        {now ? (
          <>
            <span style={{ color: AFFINITY_COLOR[now.affinity] }}>
              {AFFINITY_GLYPH[now.affinity]} {AFFINITY_LABEL[now.affinity]}
            </span>{' '}
            academy · Lv{now.level}/{CONFIG.affinity.maxLevel}
          </>
        ) : (
          'Empty academy'
        )}
      </span>
      {b.pending && (
        <p className="ac-pending">
          Next turn: {b.pending.affinity !== b.affinity ? `${b.affinity ? 'becomes' : 'opens as'} ${article(AFFINITY_LABEL[b.pending.affinity])} academy` : `rises to Lv${b.pending.level}`}.
        </p>
      )}
      {b.starved && <p className="ac-starved">Starved: last turn's upkeep couldn't be paid, so it teaches nothing. Raise your income of its essences.</p>}
      {committed && (
        <div className="ac-upkeep" data-help="kind:research">
          <span>Upkeep</span>
          <FlowChips flow={academyFlow(committed.affinity, committed.level)} sign="−" />
        </div>
      )}
      {now && <Births affinity={now.affinity} level={now.level} />}
      {b.pending ? <p className="muted">One change per turn: come back next turn to grow it further.</p> : <Moves hex={hex} />}
    </div>
  )
}

function Births({ affinity, level }: { affinity: Affinity; level: number }) {
  const [s] = useGame()
  const odds = affinityOdds(city(s).academies).affinities.find((x) => x.affinity === affinity)
  return (
    <dl className="city-stats">
      <div data-help="birth-odds">
        <dt>Citizens born {AFFINITY_LABEL[affinity]}</dt>
        <dd>{odds ? pct(odds.chance) : '—'}</dd>
      </div>
      <div data-help="birth-odds">
        <dt>From this academy</dt>
        <dd className="mono">
          {pointOdds(level)
            .map((p, i) => `${i + 1}pt ${pct(p)}`)
            .join(' · ')}
        </dd>
      </div>
    </dl>
  )
}

/** Dedicate (a dropdown of tier-1 affinities), or raise / evolve rows. */
function Moves({ hex }: { hex: Hex }) {
  const [s] = useGame()
  const moves = academyMoves(s, hex)
  const [pick, setPick] = useState<Affinity>(moves[0]?.affinity ?? 'fire')
  if (!moves.length) return <p className="muted">Mastered.</p>

  if (moves[0]!.kind === 'dedicate') {
    const m = moves.find((x) => x.affinity === pick) ?? moves[0]!
    return (
      <div className="ac-moves">
        <p className="muted">Dedicate it to an element. You pay once now and commit income every turn; it starts teaching next turn.</p>
        <select value={m.affinity} onChange={(e) => setPick(e.target.value as Affinity)} aria-label="Affinity">
          {moves.map((x) => (
            <option key={x.affinity} value={x.affinity}>
              {AFFINITY_GLYPH[x.affinity]} {AFFINITY_LABEL[x.affinity]} ({RESOURCE_LABEL[x.affinity as keyof typeof RESOURCE_LABEL]})
            </option>
          ))}
        </select>
        <MoveRow hex={hex} m={m} label="Dedicate" />
      </div>
    )
  }
  const raise = moves.filter((x) => x.kind === 'raise')
  const evolve = moves.filter((x) => x.kind === 'evolve')
  return (
    <div className="ac-moves">
      {raise.map((m) => (
        <MoveRow key="raise" hex={hex} m={m} label={`Raise to Lv${m.level}`} />
      ))}
      {evolve.length > 0 && (
        <>
          <span className="label">Evolve</span>
          {evolve.map((m) => (
            <MoveRow key={m.affinity} hex={hex} m={m} label={`Into ${AFFINITY_LABEL[m.affinity]}`} named />
          ))}
        </>
      )}
      {!evolve.length && raise[0] && raise[0].level <= CONFIG.affinity.unlockLevel && (
        <p className="muted">At Lv{CONFIG.affinity.unlockLevel} it can evolve into a higher tier (e.g. Fire + Earth → Magma, once both are Lv{CONFIG.affinity.unlockLevel}).</p>
      )}
    </div>
  )
}

function MoveRow({ hex, m, label, named }: { hex: Hex; m: AcademyMove; label: string; named?: boolean }) {
  const [s, dispatch] = useGame()
  const { upfront, extra } = academyMoveCost(s, hex, m)
  const block = academyBlock(s, hex, m)
  const free = netYields(s)
  const missingParents = AFFINITY_DEFS[m.affinity].parents.filter((p) => (city(s).affinityLevels[p] ?? 0) < CONFIG.affinity.unlockLevel)
  return (
    <div className={`ac-move ${block === 'locked' ? 'locked' : ''}`} data-help={`affinity:${m.affinity}`}>
      {named && (
        <span className="ac-name" style={{ color: AFFINITY_COLOR[m.affinity] }}>
          {AFFINITY_GLYPH[m.affinity]} {AFFINITY_LABEL[m.affinity]} <small>T{AFFINITY_DEFS[m.affinity].tier}</small>
        </span>
      )}
      <span className="ac-costs">
        <CostChips cost={upfront} />
        <FlowChips flow={extra} sign="−" />
      </span>
      {block === 'locked' ? (
        <small className="muted">needs {missingParents.map((p) => `${AFFINITY_LABEL[p]} Lv${CONFIG.affinity.unlockLevel}`).join(' + ')}</small>
      ) : (
        <button
          className="btn btn-small btn-primary"
          onClick={(e) => {
            if (block === 'cost') {
              const miss = shortfall(s, upfront)
              return deny(e.currentTarget, `You are missing ${Object.entries(miss).map(([k, v]) => `${v} ${RESOURCE_LABEL[k as keyof typeof RESOURCE_LABEL]}`).join(', ')}.`)
            }
            if (block === 'flow') {
              const miss = flowShortfall(s, hex, m)
              return deny(
                e.currentTarget,
                `Not enough free income: you need ${Object.entries(miss)
                  .map(([k, v]) => `${v} more ${RESOURCE_LABEL[k as keyof typeof RESOURCE_LABEL]}/turn`)
                  .join(', ')} (free now: ${Object.keys(extra)
                  .map((k) => `${Math.max(0, free[k as keyof typeof free])} ${RESOURCE_LABEL[k as keyof typeof RESOURCE_LABEL]}`)
                  .join(', ')}).`,
              )
            }
            if (!block) dispatch((st) => commitAcademy(st, hex, m))
          }}
        >
          {label}
        </button>
      )}
    </div>
  )
}
