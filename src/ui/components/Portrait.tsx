/**
 * Procedural bust portrait for a unit, seeded by its uid so a citizen always
 * looks the same. Headgear reads the unit type at a glance; the backdrop is
 * its main affinity; the frame is its rarity.
 */
import { primaryAffinity, type Unit } from '../../game'
import { RARITY_COLOR, unitColor } from '../theme'

const SKIN = ['#f1d2b6', '#e0b18c', '#c98f63', '#a86c45', '#7c4a2c', '#d9c2a5', '#b8c9a0', '#9fb2c9']
const HAIR = ['#2b1d14', '#5a3a22', '#8a5a2b', '#c9a15a', '#d8d2c4', '#6b2b1e', '#1e1e24']

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

export function Portrait({ unit, size = 72 }: { unit: Unit; size?: number }) {
  const r = hash(unit.uid + unit.name)
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]!
  const skin = pick(SKIN)
  const hair = pick(HAIR)
  const aff = unitColor(primaryAffinity(unit.affinities))
  const frame = RARITY_COLOR[unit.rarity]
  const beard = r() < 0.35
  const scar = r() < 0.2
  const eyeY = 41 + r() * 2
  const faceW = 15 + r() * 3
  const id = `p-${unit.uid}`

  return (
    <svg width={size} height={size} viewBox="0 0 80 80" className="portrait" aria-hidden>
      <defs>
        <radialGradient id={`${id}-bg`} cx="50%" cy="35%" r="75%">
          <stop offset="0" stopColor={aff} stopOpacity="0.55" />
          <stop offset="1" stopColor="#120e0c" />
        </radialGradient>
        <clipPath id={`${id}-clip`}>
          <rect x="3" y="3" width="74" height="74" rx="6" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect width="80" height="80" fill={`url(#${id}-bg)`} />
        {/* shoulders */}
        <path d="M8 82 Q10 60 40 58 Q70 60 72 82 Z" fill={aff} opacity="0.85" />
        <path d="M8 82 Q10 60 40 58 Q70 60 72 82 Z" fill="#000" opacity="0.35" />
        {/* neck + face */}
        <rect x="34" y="50" width="12" height="10" fill={skin} />
        <ellipse cx="40" cy="42" rx={faceW} ry="18" fill={skin} />
        {/* hair behind */}
        <path d={`M${40 - faceW} 40 Q40 ${18 + r() * 4} ${40 + faceW} 40 L${40 + faceW} 34 Q40 20 ${40 - faceW} 34 Z`} fill={hair} />
        {/* eyes & brows */}
        <ellipse cx="34" cy={eyeY} rx="2" ry="2.2" fill="#1a1210" />
        <ellipse cx="46" cy={eyeY} rx="2" ry="2.2" fill="#1a1210" />
        <path d={`M30 ${eyeY - 5} L37 ${eyeY - 4 + r() * 2}`} stroke={hair} strokeWidth="1.8" strokeLinecap="round" />
        <path d={`M50 ${eyeY - 5} L43 ${eyeY - 4 + r() * 2}`} stroke={hair} strokeWidth="1.8" strokeLinecap="round" />
        {/* mouth */}
        <path d={`M35 ${eyeY + 10} Q40 ${eyeY + 11 + (r() - 0.5) * 3} 45 ${eyeY + 10}`} stroke="#5a2a1e" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        {beard && <path d={`M${40 - faceW + 2} 46 Q40 68 ${40 + faceW - 2} 46 Q40 56 ${40 - faceW + 2} 46 Z`} fill={hair} />}
        {scar && <path d={`M47 ${eyeY - 7} L51 ${eyeY + 5}`} stroke="#8a3b2e" strokeWidth="1.2" />}
        <Headgear type={unit.type} hair={hair} aff={aff} faceW={faceW} />
      </g>
      <rect x="2" y="2" width="76" height="76" rx="7" fill="none" stroke={frame} strokeWidth="3" />
    </svg>
  )
}

function Headgear({ type, hair, aff, faceW }: { type: Unit['type']; hair: string; aff: string; faceW: number }) {
  const steel = '#a9a59c'
  const dark = '#3a3430'
  switch (type) {
    case 'tank':
      // great helm with a visor slit
      return (
        <g>
          <path d={`M${40 - faceW - 2} 50 L${40 - faceW - 2} 32 Q40 14 ${40 + faceW + 2} 32 L${40 + faceW + 2} 50 Z`} fill={steel} stroke={dark} strokeWidth="1.2" />
          <rect x={40 - faceW + 1} y="39" width={faceW * 2 - 2} height="4" fill={dark} />
          <path d="M40 22 L40 50" stroke={dark} strokeWidth="1" opacity="0.5" />
        </g>
      )
    case 'fighter':
      // open helm with horns
      return (
        <g>
          <path d={`M${40 - faceW - 1} 36 Q40 18 ${40 + faceW + 1} 36 L${40 + faceW + 1} 32 Q40 14 ${40 - faceW - 1} 32 Z`} fill={steel} stroke={dark} strokeWidth="1" />
          <path d={`M${40 - faceW} 30 Q${40 - faceW - 8} 22 ${40 - faceW - 6} 12`} stroke="#e8dcc4" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d={`M${40 + faceW} 30 Q${40 + faceW + 8} 22 ${40 + faceW + 6} 12`} stroke="#e8dcc4" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
      )
    case 'ranger':
      // hood
      return (
        <path
          d={`M${40 - faceW - 5} 60 Q${40 - faceW - 6} 26 40 18 Q${40 + faceW + 6} 26 ${40 + faceW + 5} 60 L${40 + faceW - 1} 60 Q${40 + faceW} 30 40 26 Q${40 - faceW} 30 ${40 - faceW + 1} 60 Z`}
          fill="#3f5a32"
          stroke="#1f2c18"
          strokeWidth="1"
        />
      )
    case 'mage':
      // tall pointed hat
      return (
        <g>
          <path d="M22 32 Q40 28 58 32 L54 35 Q40 32 26 35 Z" fill={aff} stroke={dark} strokeWidth="1" />
          <path d="M28 33 L44 4 L52 33 Z" fill={aff} stroke={dark} strokeWidth="1" />
          <circle cx="44" cy="5" r="2" fill="#fff3c4" />
        </g>
      )
    case 'healer':
      // circlet over loose hair
      return (
        <g>
          <path d={`M${40 - faceW - 3} 56 Q${40 - faceW - 4} 30 40 24 Q${40 + faceW + 4} 30 ${40 + faceW + 3} 56`} stroke={hair} strokeWidth="5" fill="none" />
          <path d={`M${40 - faceW} 32 Q40 27 ${40 + faceW} 32`} stroke="#e9b44c" strokeWidth="2" fill="none" />
          <circle cx="40" cy="28.5" r="2.2" fill={aff} stroke="#e9b44c" strokeWidth="0.8" />
        </g>
      )
  }
}
