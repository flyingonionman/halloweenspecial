/**
 * ⚙ → Credits. Every third-party asset in the game, with its licence.
 * CC-BY assets *must* stay listed here; add new downloads when they ship.
 */
import { useEffect } from 'react'

interface Credit {
  what: string
  who: string
  license: string
  link?: string
}

const MODELS: Credit[] = [
  {
    what: 'Volcano V1 (volcanic tiles; simplified and recoloured)',
    who: 'JayT3D',
    license: 'CC BY 4.0',
    link: 'https://sketchfab.com/3d-models/volcano-v1-cf92d35ac0c34b71a44870959ed3abc3',
  },
]

const POLY_HAVEN = 'https://polyhaven.com'
const TEXTURES: Credit[] = [
  ['Grass ground', 'plains, forest'],
  ['Gray Rocks', 'mountains'],
  ['Snow 02', 'tundra'],
  ['Brown Mud Leaves 01', 'leyfield'],
  ['Volcanic Rock Tiles', 'volcanic'],
  ['Rocky Terrain', 'hills'],
  ['Forest Ground 06', 'steppe'],
  ['Rocky Terrain 02', 'highlands'],
].map(([what, used]) => ({ what: `${what} (${used})`, who: 'Poly Haven', license: 'CC0', link: POLY_HAVEN }))

const FONTS: Credit[] = [
  { what: 'IM Fell English SC', who: 'Igino Marini', license: 'SIL OFL 1.1', link: 'https://fonts.google.com/specimen/IM+Fell+English+SC' },
  { what: 'Alegreya Sans', who: 'Huerta Tipográfica', license: 'SIL OFL 1.1', link: 'https://fonts.google.com/specimen/Alegreya+Sans' },
  { what: 'Martian Mono', who: 'Evil Martians', license: 'SIL OFL 1.1', link: 'https://fonts.google.com/specimen/Martian+Mono' },
]

const CODE: Credit[] = [
  { what: 'three.js', who: 'three.js authors', license: 'MIT', link: 'https://threejs.org' },
  { what: 'React Three Fiber & drei', who: 'Poimandres', license: 'MIT', link: 'https://github.com/pmndrs' },
  { what: 'React', who: 'Meta', license: 'MIT', link: 'https://react.dev' },
]

function Section({ title, items }: { title: string; items: Credit[] }) {
  return (
    <section>
      <h3 className="section-title">{title}</h3>
      <ul className="credits-list">
        {items.map((c) => (
          <li key={c.what}>
            <span className="cr-what">{c.link ? <a href={c.link} target="_blank" rel="noreferrer">{c.what}</a> : c.what}</span>
            <span className="cr-who">{c.who}</span>
            <span className="cr-license">{c.license}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Credits({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet credits" role="dialog" aria-label="Credits">
        <header className="lex-head">
          <h2>Credits</h2>
          <button className="help-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <Section title="3D models" items={MODELS} />
        <Section title="Textures" items={TEXTURES} />
        <Section title="Fonts" items={FONTS} />
        <Section title="Built with" items={CODE} />
      </div>
    </div>
  )
}
