/**
 * The city board: a Catan-style hex map in 3D. Renders the WorldMap only —
 * all rules live in the game core; this reports hovers and clicks.
 */
import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html, Line, MapControls } from '@react-three/drei'
import * as THREE from 'three'
import {
  BUILDING_DEFS,
  hexKey,
  hexToWorld,
  neighbors,
  type Affinity,
  type Hex,
  type PlacedBuilding,
  type TerrainId,
  type Tile,
  type WorldMap,
} from '../../game'
import { AFFINITY_COLOR, RESOURCE_COLOR, TERRAIN_COLOR } from '../theme'

export interface TilePreview {
  text: string
  best: boolean
}

interface Props {
  map: WorldMap
  selected: Hex | null
  frontier: Set<string>
  /** When a building is armed for placement: label per valid tile key. */
  previews: Record<string, TilePreview> | null
  onSelect: (h: Hex | null) => void
}

const HEIGHT: Record<TerrainId, number> = {
  plains: 0.22,
  lake: 0.1,
  forest: 0.28,
  hills: 0.42,
  mountains: 0.62,
  steppe: 0.24,
  tundra: 0.3,
  volcanic: 0.46,
  leyfield: 0.3,
  highlands: 0.55,
}

const SHADE = new THREE.Color('#140f0c')

/** Stable pseudo-random in [0,1) per tile and salt. */
function jitter(h: Hex, salt: number) {
  const x = Math.sin(h.q * 127.1 + h.r * 311.7 + salt * 74.7) * 43758.5453
  return x - Math.floor(x)
}

export function Board3D(props: Props) {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 15, 12.5], fov: 40 }} onPointerMissed={() => props.onSelect(null)}>
      <color attach="background" args={['#120e0c']} />
      <fog attach="fog" args={['#120e0c', 22, 42]} />
      <hemisphereLight args={['#ffe6c0', '#241a14', 0.55]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[9, 16, 7]}
        intensity={1.7}
        color="#fff1d8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0004}
      />
      <MapControls makeDefault enableDamping dampingFactor={0.12} minDistance={7} maxDistance={26} maxPolarAngle={1.15} minPolarAngle={0.3} />
      <Sea />
      <Tiles {...props} />
      <Border map={props.map} />
    </Canvas>
  )
}

function Sea() {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.06} receiveShadow>
      <circleGeometry args={[40, 64]} />
      <meshStandardMaterial color="#17252b" roughness={0.35} metalness={0.2} />
    </mesh>
  )
}

function Tiles({ map, selected, frontier, previews, onSelect }: Props) {
  const [hover, setHover] = useState<string | null>(null)
  return (
    <group>
      {map.tiles.map((t) => {
        const k = hexKey(t)
        return (
          <TileMesh
            key={k}
            tile={t}
            hovered={hover === k}
            selected={!!selected && selected.q === t.q && selected.r === t.r}
            frontier={frontier.has(k)}
            preview={previews?.[k] ?? null}
            dimmed={!!previews && !previews[k]}
            onHover={(on) => setHover(on ? k : (h) => (h === k ? null : h))}
            onSelect={onSelect}
          />
        )
      })}
    </group>
  )
}

const hexGeo = new THREE.CylinderGeometry(0.96, 0.98, 1, 6)
const ringGeo = new THREE.RingGeometry(0.78, 0.9, 6, 1)

interface TileProps {
  tile: Tile
  hovered: boolean
  selected: boolean
  frontier: boolean
  preview: TilePreview | null
  dimmed: boolean
  onHover: (on: boolean) => void
  onSelect: (h: Hex) => void
}

const TileMesh = function TileMesh({ tile, hovered, selected, frontier, preview, dimmed, onHover, onSelect }: TileProps) {
  const group = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const [x, z] = hexToWorld(tile)
  const h = HEIGHT[tile.terrain]

  const color = useMemo(() => {
    const c = new THREE.Color(TERRAIN_COLOR[tile.terrain])
    if (!tile.owned) c.lerp(SHADE, frontier ? 0.4 : 0.72)
    if (dimmed) c.lerp(SHADE, 0.35)
    return c
  }, [tile.terrain, tile.owned, frontier, dimmed])

  useFrame((state, dt) => {
    const g = group.current
    if (!g) return
    const target = hovered ? 0.08 : 0
    g.position.y += (target - g.position.y) * Math.min(1, dt * 14)
    if (ring.current) {
      const m = ring.current.material as THREE.MeshBasicMaterial
      m.opacity = 0.65 + 0.3 * Math.sin(state.clock.elapsedTime * 4)
    }
  })

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > 6) return // was a drag
    onSelect({ q: tile.q, r: tile.r })
  }

  return (
    <group position={[x, 0, z]}>
      <group ref={group}>
        <mesh
          geometry={hexGeo}
          scale={[1, h, 1]}
          position-y={h / 2}
          castShadow
          receiveShadow
          onClick={click}
          onPointerOver={(e) => {
            e.stopPropagation()
            onHover(true)
          }}
          onPointerOut={() => onHover(false)}
        >
          {tile.terrain === 'lake' ? (
            <meshStandardMaterial color={color} roughness={0.15} metalness={0.3} flatShading />
          ) : (
            <meshStandardMaterial color={color} roughness={0.92} flatShading emissive={hovered ? '#3a2a18' : '#000000'} />
          )}
        </mesh>
        <group position-y={h}>
          {!tile.building && <Props terrain={tile.terrain} hex={tile} dim={!tile.owned} />}
          {tile.building && <BuildingMesh building={tile.building} />}
          {tile.camp && <CampMesh strength={tile.camp.strength} />}
          {selected && (
            <mesh ref={ring} geometry={ringGeo} rotation-x={-Math.PI / 2} position-y={0.02}>
              <meshBasicMaterial color="#ff8a3d" transparent opacity={0.9} side={THREE.DoubleSide} />
            </mesh>
          )}
          {preview && (
            <Html position={[0, 0.9, 0]} center distanceFactor={11} style={{ pointerEvents: 'none' }}>
              <div className={`board-label ${preview.best ? 'best' : ''}`}>{preview.text}</div>
            </Html>
          )}
        </group>
      </group>
    </group>
  )
}

// ── Terrain props ─────────────────────────────────────────────────────

function Props({ terrain, hex, dim }: { terrain: TerrainId; hex: Hex; dim: boolean }) {
  const j = (s: number) => jitter(hex, s)
  const shade = (c: string) => (dim ? new THREE.Color(c).lerp(SHADE, 0.62) : new THREE.Color(c))
  switch (terrain) {
    case 'forest':
      return (
        <>
          {[0, 1, 2, 3].map((i) => {
            const a = j(i) * Math.PI * 2
            const r = 0.25 + j(i + 9) * 0.4
            const s = 0.7 + j(i + 3) * 0.5
            return (
              <group key={i} position={[Math.cos(a) * r, 0, Math.sin(a) * r]} scale={s}>
                <mesh position-y={0.32} castShadow>
                  <coneGeometry args={[0.18, 0.5, 6]} />
                  <meshStandardMaterial color={shade('#2d5a2a')} flatShading />
                </mesh>
                <mesh position-y={0.06}>
                  <cylinderGeometry args={[0.03, 0.04, 0.12, 5]} />
                  <meshStandardMaterial color={shade('#4a3424')} />
                </mesh>
              </group>
            )
          })}
        </>
      )
    case 'mountains':
      return (
        <>
          <mesh position={[0.05, 0.38, -0.05]} castShadow>
            <coneGeometry args={[0.5, 0.8, 5]} />
            <meshStandardMaterial color={shade('#77746f')} flatShading />
          </mesh>
          <mesh position={[0.05, 0.69, -0.05]}>
            <coneGeometry args={[0.17, 0.2, 5]} />
            <meshStandardMaterial color={shade('#eef2f2')} flatShading />
          </mesh>
          <mesh position={[-0.42, 0.2, 0.3]} castShadow>
            <coneGeometry args={[0.28, 0.42, 5]} />
            <meshStandardMaterial color={shade('#6b6965')} flatShading />
          </mesh>
        </>
      )
    case 'hills':
      return (
        <>
          {[0, 1].map((i) => (
            <mesh key={i} position={[(i ? -0.3 : 0.25) + j(i) * 0.1, 0, i ? 0.2 : -0.2]} scale={[1, 0.55, 1]} castShadow>
              <sphereGeometry args={[0.32, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color={shade('#7d6e4a')} flatShading />
            </mesh>
          ))}
        </>
      )
    case 'tundra':
      return (
        <>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[(j(i) - 0.5) * 1, 0.1, (j(i + 5) - 0.5) * 1]} rotation={[j(i) * 3, j(i + 1) * 3, 0]} castShadow>
              <icosahedronGeometry args={[0.1 + j(i + 2) * 0.08, 0]} />
              <meshStandardMaterial color={shade('#eaf6fb')} roughness={0.2} flatShading />
            </mesh>
          ))}
        </>
      )
    case 'volcanic':
      return <Volcano dim={dim} />
    case 'leyfield':
      return <Crystal dim={dim} seed={j(1)} />
    case 'highlands':
      return (
        <>
          <mesh position={[0.1, 0.3, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.18, 0.6, 5]} />
            <meshStandardMaterial color={shade('#5f7773')} flatShading />
          </mesh>
          <mesh position={[-0.3, 0.17, 0.25]} castShadow>
            <cylinderGeometry args={[0.07, 0.13, 0.34, 5]} />
            <meshStandardMaterial color={shade('#6c8682')} flatShading />
          </mesh>
        </>
      )
    case 'steppe':
      return (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[(j(i) - 0.5) * 1.2, 0.07, (j(i + 7) - 0.5) * 1.2]}>
              <coneGeometry args={[0.05, 0.14, 4]} />
              <meshStandardMaterial color={shade('#d6bf72')} flatShading />
            </mesh>
          ))}
        </>
      )
    default:
      return null
  }
}

function Volcano({ dim }: { dim: boolean }) {
  const glow = useRef<THREE.MeshStandardMaterial>(null)
  useFrame((s) => {
    if (glow.current) glow.current.emissiveIntensity = (dim ? 0.6 : 1.6) + Math.sin(s.clock.elapsedTime * 2.2) * 0.5
  })
  return (
    <>
      <mesh position-y={0.25} castShadow>
        <cylinderGeometry args={[0.16, 0.45, 0.5, 7]} />
        <meshStandardMaterial color="#2c211e" flatShading />
      </mesh>
      <mesh position-y={0.5}>
        <cylinderGeometry args={[0.13, 0.13, 0.03, 7]} />
        <meshStandardMaterial ref={glow} color="#ff5a1a" emissive="#ff4a10" emissiveIntensity={1.5} />
      </mesh>
    </>
  )
}

function Crystal({ dim, seed }: { dim: boolean; seed: number }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((s) => {
    if (!ref.current) return
    ref.current.rotation.y = s.clock.elapsedTime * 0.6 + seed * 6
    ref.current.position.y = 0.42 + Math.sin(s.clock.elapsedTime * 1.4 + seed * 6) * 0.05
  })
  return (
    <mesh ref={ref} castShadow>
      <octahedronGeometry args={[0.2, 0]} />
      <meshStandardMaterial color="#b892f0" emissive="#7a4fd0" emissiveIntensity={dim ? 0.3 : 0.9} roughness={0.2} flatShading />
    </mesh>
  )
}

// ── Buildings ─────────────────────────────────────────────────────────

function BuildingMesh({ building }: { building: PlacedBuilding }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    const g = ref.current
    if (g && g.scale.x < 1) g.scale.setScalar(Math.min(1, g.scale.x + dt * 4))
  })
  const def = BUILDING_DEFS[building.id]
  return (
    <group ref={ref} scale={0.01}>
      {def.kind === 'capital' && <Capital />}
      {def.kind === 'extractor' && <Extractor resource={Object.keys(def.base)[0] as keyof typeof RESOURCE_COLOR} />}
      {def.kind === 'research' && <Spire affinity={def.affinity!} level={building.level} />}
      {building.id === 'farm' && <Farm />}
      {building.id === 'housing' && <Housing />}
      {building.id === 'market' && <Market />}
      {building.id === 'trading-post' && <TradingPost />}
      {building.id === 'barracks' && <Barracks />}
      {building.id === 'walls' && <Walls />}
      {building.id === 'armory' && <Armory />}
    </group>
  )
}

const Stone = ({ c = '#b8ad98' }: { c?: string }) => <meshStandardMaterial color={c} flatShading roughness={0.9} />

function Capital() {
  return (
    <>
      <mesh position-y={0.15} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.3, 0.8]} />
        <Stone />
      </mesh>
      <mesh position-y={0.55} castShadow>
        <cylinderGeometry args={[0.2, 0.24, 0.6, 8]} />
        <Stone c="#cfc4ad" />
      </mesh>
      <mesh position-y={0.98} castShadow>
        <coneGeometry args={[0.28, 0.32, 8]} />
        <meshStandardMaterial color="#e9b44c" metalness={0.5} roughness={0.4} flatShading />
      </mesh>
      {[
        [-0.36, -0.36],
        [0.36, -0.36],
        [-0.36, 0.36],
        [0.36, 0.36],
      ].map(([px, pz], i) => (
        <group key={i} position={[px!, 0, pz!]}>
          <mesh position-y={0.3} castShadow>
            <cylinderGeometry args={[0.09, 0.1, 0.6, 6]} />
            <Stone c="#c2b69c" />
          </mesh>
          <mesh position-y={0.67}>
            <coneGeometry args={[0.12, 0.16, 6]} />
            <meshStandardMaterial color="#a33b2c" flatShading />
          </mesh>
        </group>
      ))}
    </>
  )
}

function House({ x = 0, z = 0, s = 1, roof = '#8c3b2a' }: { x?: number; z?: number; s?: number; roof?: string }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position-y={0.11} castShadow receiveShadow>
        <boxGeometry args={[0.26, 0.22, 0.22]} />
        <meshStandardMaterial color="#e6d6b5" flatShading />
      </mesh>
      <mesh position-y={0.28} rotation-y={Math.PI / 4} castShadow>
        <coneGeometry args={[0.22, 0.16, 4]} />
        <meshStandardMaterial color={roof} flatShading />
      </mesh>
    </group>
  )
}

function Extractor({ resource }: { resource: keyof typeof RESOURCE_COLOR }) {
  return (
    <>
      <House x={-0.18} z={0.1} roof="#5a4632" />
      <mesh position={[0.25, 0.12, -0.15]} castShadow>
        <dodecahedronGeometry args={[0.14, 0]} />
        <meshStandardMaterial color={RESOURCE_COLOR[resource]} flatShading emissive={RESOURCE_COLOR[resource]} emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[0.32, 0.06, 0.16]} castShadow>
        <dodecahedronGeometry args={[0.08, 0]} />
        <meshStandardMaterial color={RESOURCE_COLOR[resource]} flatShading />
      </mesh>
    </>
  )
}

function Farm() {
  return (
    <>
      {[-0.3, -0.1, 0.1, 0.3].map((px, i) => (
        <mesh key={i} position={[px, 0.03, 0.12]} receiveShadow>
          <boxGeometry args={[0.16, 0.06, 0.6]} />
          <meshStandardMaterial color={i % 2 ? '#c9b356' : '#a7b04c'} flatShading />
        </mesh>
      ))}
      <House x={0.05} z={-0.42} s={0.9} roof="#9b4a2c" />
    </>
  )
}

function Housing() {
  return (
    <>
      <House x={-0.25} z={-0.15} />
      <House x={0.2} z={-0.2} s={1.1} roof="#7a3426" />
      <House x={0} z={0.25} s={0.95} roof="#94452e" />
    </>
  )
}

function Market() {
  const awnings = ['#c94a3a', '#e9b44c', '#5e9be0']
  return (
    <>
      {awnings.map((c, i) => (
        <group key={i} position={[(i - 1) * 0.3, 0, (i % 2) * 0.2 - 0.1]}>
          <mesh position-y={0.08} castShadow>
            <boxGeometry args={[0.22, 0.16, 0.18]} />
            <meshStandardMaterial color="#d9c7a3" flatShading />
          </mesh>
          <mesh position-y={0.2} rotation-z={0.15}>
            <boxGeometry args={[0.28, 0.03, 0.24]} />
            <meshStandardMaterial color={c} flatShading />
          </mesh>
        </group>
      ))}
    </>
  )
}

function TradingPost() {
  return (
    <>
      <mesh position-y={0.12} castShadow>
        <boxGeometry args={[0.5, 0.24, 0.32]} />
        <meshStandardMaterial color="#8a6a46" flatShading />
      </mesh>
      <mesh position={[0, 0.28, 0]} rotation-y={Math.PI / 4}>
        <coneGeometry args={[0.38, 0.18, 4]} />
        <meshStandardMaterial color="#5a4632" flatShading />
      </mesh>
      <Flag x={0.3} color="#e9b44c" />
    </>
  )
}

function Flag({ x = 0, z = 0, color }: { x?: number; z?: number; color: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position-y={0.3}>
        <cylinderGeometry args={[0.012, 0.012, 0.6, 4]} />
        <meshStandardMaterial color="#3a2b20" />
      </mesh>
      <mesh position={[0.08, 0.52, 0]}>
        <boxGeometry args={[0.16, 0.1, 0.01]} />
        <meshStandardMaterial color={color} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function Barracks() {
  return (
    <>
      <mesh position-y={0.13} castShadow receiveShadow>
        <boxGeometry args={[0.7, 0.26, 0.32]} />
        <Stone c="#a89a82" />
      </mesh>
      <mesh position-y={0.32} rotation={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.001, 0.22, 0.14, 4, 1, false, Math.PI / 4]} />
        <meshStandardMaterial color="#8c2e22" flatShading />
      </mesh>
      <Flag x={-0.25} z={0.25} color="#c94a3a" />
      <Flag x={0.25} z={0.25} color="#c94a3a" />
    </>
  )
}

function Walls() {
  return (
    <>
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6
        return (
          <mesh key={i} position={[Math.cos(a) * 0.48, 0.12, Math.sin(a) * 0.48]} rotation-y={-a + Math.PI / 2} castShadow>
            <boxGeometry args={[0.5, 0.24, 0.1]} />
            <Stone c="#9b958b" />
          </mesh>
        )
      })}
      <mesh position-y={0.25} castShadow>
        <cylinderGeometry args={[0.13, 0.15, 0.5, 6]} />
        <Stone c="#aaa49a" />
      </mesh>
    </>
  )
}

function Armory() {
  return (
    <>
      <mesh position-y={0.16} castShadow>
        <boxGeometry args={[0.45, 0.32, 0.45]} />
        <Stone c="#6e665c" />
      </mesh>
      <mesh position-y={0.4} castShadow>
        <boxGeometry args={[0.3, 0.16, 0.3]} />
        <meshStandardMaterial color="#555049" flatShading metalness={0.4} />
      </mesh>
      <mesh position={[0.3, 0.1, 0.3]}>
        <boxGeometry args={[0.14, 0.08, 0.06]} />
        <meshStandardMaterial color="#3d3a37" metalness={0.8} roughness={0.3} />
      </mesh>
    </>
  )
}

function Spire({ affinity, level }: { affinity: Affinity; level: number }) {
  const orb = useRef<THREE.Mesh>(null)
  const h = 0.5 + level * 0.22
  const color = AFFINITY_COLOR[affinity]
  useFrame((s) => {
    if (orb.current) orb.current.position.y = h + 0.14 + Math.sin(s.clock.elapsedTime * 2) * 0.04
  })
  return (
    <>
      <mesh position-y={0.08} castShadow>
        <cylinderGeometry args={[0.36, 0.4, 0.16, 8]} />
        <Stone c="#b5aa95" />
      </mesh>
      <mesh position-y={h / 2 + 0.1} castShadow>
        <cylinderGeometry args={[0.08, 0.2, h, 6]} />
        <meshStandardMaterial color={new THREE.Color(color).lerp(new THREE.Color('#d8ccb4'), 0.55)} flatShading />
      </mesh>
      <mesh ref={orb}>
        <icosahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6 + level * 0.35} flatShading />
      </mesh>
      {Array.from({ length: level }, (_, i) => (
        <mesh key={i} position={[Math.cos((i / 4) * Math.PI * 2) * 0.3, 0.2, Math.sin((i / 4) * Math.PI * 2) * 0.3]}>
          <boxGeometry args={[0.06, 0.06, 0.06]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
        </mesh>
      ))}
    </>
  )
}

function CampMesh({ strength }: { strength: number }) {
  const flag = useRef<THREE.Mesh>(null)
  useFrame((s) => {
    if (flag.current) flag.current.rotation.y = Math.sin(s.clock.elapsedTime * 3) * 0.3
  })
  return (
    <group>
      {Array.from({ length: strength }, (_, i) => {
        const a = (i / strength) * Math.PI * 2 + 0.6
        return (
          <mesh key={i} position={[Math.cos(a) * 0.3, 0.18, Math.sin(a) * 0.3]} castShadow>
            <coneGeometry args={[0.2, 0.36, 4]} />
            <meshStandardMaterial color="#3b2b2b" flatShading />
          </mesh>
        )
      })}
      <mesh position-y={0.4}>
        <cylinderGeometry args={[0.015, 0.015, 0.8, 4]} />
        <meshStandardMaterial color="#1a1310" />
      </mesh>
      <mesh ref={flag} position={[0.1, 0.72, 0]}>
        <boxGeometry args={[0.22, 0.14, 0.01]} />
        <meshStandardMaterial color="#c43c3c" emissive="#7a1010" emissiveIntensity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[0, 0.3, 0]} color="#ff5a2a" intensity={0.6} distance={1.6} />
    </group>
  )
}

// ── Territory border ──────────────────────────────────────────────────

function Border({ map }: { map: WorldMap }) {
  const segments = useMemo(() => {
    const owned = new Set(map.tiles.filter((t) => t.owned).map(hexKey))
    const pts: [number, number, number][] = []
    for (const t of map.tiles) {
      if (!t.owned) continue
      const [cx, cz] = hexToWorld(t)
      for (const n of neighbors(t)) {
        if (owned.has(hexKey(n))) continue
        const [nx, nz] = hexToWorld(n)
        const mx = (cx + nx) / 2
        const mz = (cz + nz) / 2
        const len = Math.hypot(nx - cx, nz - cz)
        const px = -(nz - cz) / len
        const pz = (nx - cx) / len
        const y = HEIGHT[t.terrain] + 0.03
        pts.push([mx + px * 0.5, y, mz + pz * 0.5], [mx - px * 0.5, y, mz - pz * 0.5])
      }
    }
    return pts
  }, [map])
  if (!segments.length) return null
  return <Line points={segments} segments color="#ffb36b" lineWidth={2.2} transparent opacity={0.85} />
}
