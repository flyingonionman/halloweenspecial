/**
 * The city board: a Catan-style hex map in 3D. Renders the WorldMap only —
 * all rules live in the game core; this reports hovers and clicks.
 */
import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, Line, MapControls, Stars } from '@react-three/drei'
import * as THREE from 'three'
import {
  BUILDING_DEFS,
  TERRAIN_DEFS,
  hexKey,
  hexToWorld,
  neighbors,
  type Affinity,
  type BuildingId,
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

/** Top-surface height per terrain. Spread wide so relief reads at a glance. */
const HEIGHT: Record<TerrainId, number> = {
  plains: 0.2,
  lake: 0.07,
  forest: 0.28,
  hills: 0.5,
  mountains: 0.9,
  steppe: 0.24,
  tundra: 0.34,
  volcanic: 0.58,
  leyfield: 0.3,
  highlands: 0.72,
}

/** How far each prism sinks below the surface, so the curved planet never shows under a tile. */
const SINK = 0.5

const SHADE = new THREE.Color('#0d0b10')

// ── Planet curvature ──────────────────────────────────────────────────

/** Radius of the world sphere; the capital sits on its north pole at y = 0. */
const PLANET_R = 40
const UP = new THREE.Vector3(0, 1, 0)

/** Where a flat board position lands on the planet, and the rotation that makes its tile face outward. */
function planetPose(x: number, z: number) {
  const d2 = Math.min(x * x + z * z, PLANET_R * PLANET_R * 0.9)
  const y = Math.sqrt(PLANET_R * PLANET_R - d2) - PLANET_R
  const normal = new THREE.Vector3(x, y + PLANET_R, z).normalize()
  return { position: new THREE.Vector3(x, y, z), quaternion: new THREE.Quaternion().setFromUnitVectors(UP, normal) }
}

// ── Terrain surface textures (procedural, no downloads) ───────────────

const textureCache = new Map<TerrainId, THREE.CanvasTexture>()

/** A 128px painterly swatch per terrain: base colour plus marks that read as grass, rock, ice, lava… */
function terrainTexture(t: TerrainId): THREE.CanvasTexture {
  const hit = textureCache.get(t)
  if (hit) return hit
  const size = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const g = cv.getContext('2d')!
  const base = new THREE.Color(TERRAIN_COLOR[t])
  g.fillStyle = `#${base.getHexString()}`
  g.fillRect(0, 0, size, size)
  let seed = t.length * 977
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const tone = (k: number, a = 1) => {
    const c = base.clone().multiplyScalar(k)
    return `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${a})`
  }
  const strokes = (n: number, len: number, colors: string[], width = 1.5) => {
    for (let i = 0; i < n; i++) {
      const x = rnd() * size
      const y = rnd() * size
      const a = rnd() * Math.PI
      g.strokeStyle = colors[i % colors.length]!
      g.lineWidth = width
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len)
      g.stroke()
    }
  }
  const dots = (n: number, r: number, colors: string[]) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = colors[i % colors.length]!
      g.beginPath()
      g.arc(rnd() * size, rnd() * size, r * (0.5 + rnd()), 0, Math.PI * 2)
      g.fill()
    }
  }
  switch (t) {
    case 'plains':
      strokes(260, 5, [tone(1.25), tone(0.8), tone(1.1)], 1.2)
      break
    case 'steppe':
      strokes(220, 7, [tone(1.2), tone(0.78)], 1.1)
      break
    case 'forest':
      dots(90, 7, [tone(0.7, 0.8), tone(1.2, 0.6), tone(0.55, 0.7)])
      break
    case 'hills':
      for (let i = 0; i < 9; i++) {
        g.strokeStyle = tone(i % 2 ? 0.75 : 1.2, 0.8)
        g.lineWidth = 2
        g.beginPath()
        g.arc(rnd() * size, rnd() * size, 14 + rnd() * 26, 0, Math.PI)
        g.stroke()
      }
      break
    case 'mountains':
      strokes(70, 18, [tone(0.6), tone(1.35)], 1.6)
      dots(30, 3, [tone(1.5, 0.8)])
      break
    case 'tundra':
      dots(120, 3, ['rgba(255,255,255,0.8)', 'rgba(150,200,230,0.6)'])
      strokes(30, 14, ['rgba(140,190,220,0.6)'], 1)
      break
    case 'volcanic':
      strokes(28, 24, ['rgba(255,110,40,0.85)', 'rgba(255,170,60,0.6)'], 2)
      dots(40, 3, ['rgba(0,0,0,0.5)'])
      break
    case 'leyfield':
      dots(60, 2.5, ['rgba(220,180,255,0.9)', 'rgba(150,110,240,0.7)'])
      strokes(20, 30, ['rgba(200,160,255,0.35)'], 1)
      break
    case 'highlands':
      strokes(90, 12, [tone(1.3), tone(0.7)], 2)
      break
    case 'lake':
      for (let i = 0; i < 14; i++) {
        g.strokeStyle = 'rgba(200,235,255,0.35)'
        g.lineWidth = 1.2
        g.beginPath()
        g.arc(rnd() * size, rnd() * size, 6 + rnd() * 12, 0.2, Math.PI - 0.2)
        g.stroke()
      }
      break
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  textureCache.set(t, tex)
  return tex
}

/** Stable pseudo-random in [0,1) per tile and salt. */
function jitter(h: Hex, salt: number) {
  const x = Math.sin(h.q * 127.1 + h.r * 311.7 + salt * 74.7) * 43758.5453
  return x - Math.floor(x)
}

export function Board3D(props: Props) {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 15, 12.5], fov: 40, far: 400 }} onPointerMissed={() => props.onSelect(null)}>
      <fog attach="fog" args={['#1c2240', 16, 46]} />
      <NightSky />
      <hemisphereLight args={['#b9c8ff', '#2a1f18', 0.55]} />
      <ambientLight intensity={0.3} />
      {/* moonlight: the key light, cool and high */}
      <directionalLight
        position={[-10, 18, -6]}
        intensity={1.5}
        color="#dfe6ff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0004}
      />
      {/* warm fill from the front so terrain colour stays true */}
      <directionalLight position={[8, 10, 12]} intensity={0.9} color="#ffd9a8" />
      {/* the city's hearth glow */}
      <pointLight position={[0, 1.6, 0]} color="#ffb060" intensity={6} distance={7} decay={1.6} />
      <MapControls makeDefault enableDamping dampingFactor={0.12} minDistance={7} maxDistance={28} maxPolarAngle={1.25} minPolarAngle={0.3} />
      <EndlessOcean />
      <Tiles {...props} />
      <Border map={props.map} />
    </Canvas>
  )
}

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const skyFrag = /* glsl */ `
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y, -0.2, 1.0);
    vec3 horizon = vec3(0.13, 0.12, 0.26);
    vec3 zenith = vec3(0.012, 0.018, 0.06);
    vec3 col = mix(horizon, zenith, smoothstep(-0.05, 0.6, h));
    // faint aurora-ish band low on the horizon
    col += vec3(0.06, 0.02, 0.09) * exp(-pow((h - 0.08) * 9.0, 2.0));
    gl_FragColor = vec4(col, 1.0);
  }
`

/** Night-sky skybox: gradient dome, stars and a moon. Ignores fog. */
function NightSky() {
  const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, fog: false, depthWrite: false }), [])
  return (
    <>
      <mesh material={mat} renderOrder={-1}>
        <sphereGeometry args={[300, 32, 16]} />
      </mesh>
      <Stars radius={180} depth={60} count={5000} factor={5} saturation={0.15} fade speed={0.6} />
      <mesh position={[-90, 70, -140]}>
        <sphereGeometry args={[7, 32, 16]} />
        <meshBasicMaterial color="#f4ecd6" fog={false} />
      </mesh>
      <mesh position={[-90, 70, -140]}>
        <sphereGeometry args={[11, 32, 16]} />
        <meshBasicMaterial color="#c9d6ff" transparent opacity={0.08} fog={false} />
      </mesh>
    </>
  )
}

/** The world below the board: an ocean sphere whose north pole sits just under the capital. */
/** Sea level: the curved land dome rises out of it, and its rim sinks below. */
const SEA_Y = -1.0
/** Roughly where the last ring of tiles ends. */
const EDGE_R = 9.4

const noiseGlsl = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`

/** Flat fog bank on the water beyond the last tiles: the edge of the world. */
const mistSheetFrag = /* glsl */ `
  uniform float uTime;
  uniform float uInner;
  varying vec3 vWorld;
  ${noiseGlsl}
  void main() {
    float r = length(vWorld.xz);
    float n = fbm(vWorld.xz * 0.12 + vec2(uTime * 0.03, -uTime * 0.02));
    float band = smoothstep(uInner - 1.0, uInner + 5.0, r);
    float a = band * (0.35 + 0.65 * n);
    gl_FragColor = vec4(mix(vec3(0.42, 0.45, 0.62), vec3(0.75, 0.78, 0.9), n), a * 0.9);
  }
`

/** Rising curtain of mist around the rim, drifting sideways. */
const mistWallFrag = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGlsl}
  void main() {
    float ang = atan(vWorld.z, vWorld.x);
    float n = fbm(vec2(ang * 3.0 + uTime * 0.05, vUv.y * 2.5 - uTime * 0.04));
    float fadeUp = 1.0 - smoothstep(0.1, 1.0, vUv.y);
    float a = fadeUp * smoothstep(0.25, 0.75, n);
    gl_FragColor = vec4(vec3(0.66, 0.7, 0.85), a * 0.55);
  }
`

const worldVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

/** An endless dark ocean that fades into fog, with mist marking where the world ends. */
function EndlessOcean() {
  const sheet = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: worldVert,
        fragmentShader: mistSheetFrag,
        uniforms: { uTime: { value: 0 }, uInner: { value: EDGE_R } },
        transparent: true,
        depthWrite: false,
      }),
    [],
  )
  const wall = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: worldVert,
        fragmentShader: mistWallFrag,
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  )
  useFrame((_, dt) => {
    sheet.uniforms.uTime!.value += dt
    wall.uniforms.uTime!.value += dt
  })
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={SEA_Y} receiveShadow>
        <planeGeometry args={[1200, 1200]} />
        <meshStandardMaterial color="#14283a" roughness={0.25} metalness={0.35} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={SEA_Y + 0.12} material={sheet} renderOrder={2}>
        <ringGeometry args={[EDGE_R - 1.5, 160, 128, 1]} />
      </mesh>
      <mesh position-y={SEA_Y + 1.4} material={wall} renderOrder={3}>
        <cylinderGeometry args={[EDGE_R + 2.2, EDGE_R + 2.2, 3, 96, 1, true]} />
      </mesh>
    </>
  )
}

/** Standalone turntable of one building on a tile, for the build panel. */
export function BuildingPreview({ id, terrain }: { id: BuildingId; terrain: TerrainId }) {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [2.2, 2.0, 2.6], fov: 32 }} gl={{ alpha: true }}>
      <hemisphereLight args={['#c9d4ff', '#2a1f18', 0.7]} />
      <directionalLight position={[3, 5, 2]} intensity={1.8} color="#fff1d8" />
      <directionalLight position={[-3, 2, -3]} intensity={0.6} color="#8fa8ff" />
      <Turntable>
        <mesh geometry={hexGeo} scale={[1, 0.3, 1]} position-y={-0.15}>
          <meshStandardMaterial attach="material-0" color={new THREE.Color(TERRAIN_COLOR[terrain]).multiplyScalar(0.42)} flatShading />
          <meshStandardMaterial attach="material-1" map={terrainTexture(terrain)} />
          <meshStandardMaterial attach="material-2" color="#111" />
        </mesh>
        <BuildingMesh key={id} building={{ id, level: BUILDING_DEFS[id].maxLevel }} />
      </Turntable>
    </Canvas>
  )
}

function Turntable({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.5
  })
  return (
    <group ref={ref} position-y={-0.35}>
      {children}
    </group>
  )
}

function Tiles({ map, selected, frontier, previews, onSelect }: Props) {
  const [hover, setHover] = useState<string | null>(null)
  const gl = useThree((s) => s.gl)
  // The DOM cursor rules can't see 3D objects, so switch the gauntlet here.
  gl.domElement.style.cursor = hover ? "url('/cursors/gauntlet-hover.svg') 3 2, pointer" : ''
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

const HEX_R = 0.97
const hexGeo = new THREE.CylinderGeometry(HEX_R, HEX_R, 1, 6)
// CylinderGeometry puts a corner on +z; a 6-segment ring needs thetaStart π/6 to line up
// after being laid flat. Outer edge sits exactly on the tile rim.
const ringGeo = new THREE.RingGeometry(HEX_R - 0.12, HEX_R + 0.01, 6, 1, Math.PI / 6)

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
  const pose = useMemo(() => planetPose(...hexToWorld(tile)), [tile.q, tile.r])
  const h = HEIGHT[tile.terrain]

  /** Top tint multiplies the texture: white = full colour, darker = wild/dimmed. */
  const tint = useMemo(() => {
    const c = new THREE.Color('#ffffff')
    if (!tile.owned) c.lerp(SHADE, frontier ? 0.4 : 0.68)
    if (dimmed) c.lerp(SHADE, 0.35)
    return c
  }, [tile.owned, frontier, dimmed])
  const wall = useMemo(() => new THREE.Color(TERRAIN_COLOR[tile.terrain]).multiplyScalar(0.42).multiply(tint), [tile.terrain, tint])
  const tex = terrainTexture(tile.terrain)

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

  const lake = tile.terrain === 'lake'
  const hoverName = tile.camp ? tile.camp.name : tile.building ? BUILDING_DEFS[tile.building.id].name : TERRAIN_DEFS[tile.terrain].label

  return (
    <group position={pose.position} quaternion={pose.quaternion}>
      <group ref={group}>
        <mesh
          geometry={hexGeo}
          scale={[1, h + SINK, 1]}
          position-y={(h - SINK) / 2}
          castShadow
          receiveShadow
          onClick={click}
          onPointerOver={(e) => {
            e.stopPropagation()
            onHover(true)
          }}
          onPointerOut={() => onHover(false)}
        >
          {/* CylinderGeometry groups: 0 = walls, 1 = top, 2 = bottom */}
          <meshStandardMaterial attach="material-0" color={wall} roughness={1} flatShading />
          <meshStandardMaterial
            attach="material-1"
            map={tex}
            color={tint}
            roughness={lake ? 0.15 : 0.9}
            metalness={lake ? 0.3 : 0}
            emissive={hovered ? '#4a3420' : '#000000'}
          />
          <meshStandardMaterial attach="material-2" color={wall} />
        </mesh>
        <group position-y={h}>
          {!tile.building && <Props terrain={tile.terrain} hex={tile} dim={!tile.owned} />}
          {tile.building && <BuildingMesh building={tile.building} />}
          {tile.camp && <CampMesh strength={tile.camp.strength} />}
          {selected && (
            <mesh ref={ring} geometry={ringGeo} rotation-x={-Math.PI / 2} position-y={0.015}>
              <meshBasicMaterial color="#ff9a4a" transparent opacity={0.95} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          )}
          {preview ? (
            <Html position={[0, 0.9, 0]} center distanceFactor={11} style={{ pointerEvents: 'none' }}>
              <div className={`board-label ${preview.best ? 'best' : ''}`}>{preview.text}</div>
            </Html>
          ) : (
            hovered && (
              <Html position={[0, 1.05, 0]} center distanceFactor={11} style={{ pointerEvents: 'none' }}>
                <div className="board-label name">{hoverName}</div>
              </Html>
            )
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
    const v = new THREE.Vector3()
    for (const t of map.tiles) {
      if (!t.owned) continue
      const [cx, cz] = hexToWorld(t)
      const pose = planetPose(cx, cz)
      const y = HEIGHT[t.terrain] + 0.03
      for (const n of neighbors(t)) {
        if (owned.has(hexKey(n))) continue
        const [nx, nz] = hexToWorld(n)
        // In tile-local space: the shared edge sits at the hex apothem, perpendicular to the neighbour direction.
        const len = Math.hypot(nx - cx, nz - cz)
        const dx = (nx - cx) / len
        const dz = (nz - cz) / len
        const apothem = HEX_R * (Math.sqrt(3) / 2)
        const half = HEX_R / 2
        for (const sign of [1, -1]) {
          v.set(dx * apothem - dz * half * sign, y, dz * apothem + dx * half * sign)
          v.applyQuaternion(pose.quaternion).add(pose.position)
          pts.push([v.x, v.y, v.z])
        }
      }
    }
    return pts
  }, [map])
  if (!segments.length) return null
  return <Line points={segments} segments color="#ffb36b" lineWidth={2.2} transparent opacity={0.85} />
}
