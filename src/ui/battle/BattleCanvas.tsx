/**
 * WebGL playback of a CombatResult. Orthographic camera, everything on z≈0, so
 * it reads as 2D but sprites/meshes/shaders can go 3D whenever we want.
 *
 * Nothing here runs game logic: it samples `result.frames` at the playback time.
 */
import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CONFIG, FRAME_STRIDE, RARITIES, primaryAffinity, type CombatResult, type UnitType } from '../../game'
import { RARITY_COLOR, TEAM_COLOR, unitColor } from '../theme'

const { fieldWidth: W, fieldHeight: H } = CONFIG.combat

/** Silhouette = unit type, fill = primary affinity, trim = rarity, outer ring = team. */
const TYPE_SIDES: Record<UnitType, number> = { fighter: 3, tank: 4, ranger: 7, mage: 5, healer: 32 }
const TYPE_ROT: Record<UnitType, number> = { fighter: Math.PI / 2, tank: Math.PI / 4, ranger: 0, mage: Math.PI / 2, healer: 0 }

export interface PlaybackClock {
  /** Seconds of sim time elapsed. */
  time: number
  speed: number
  paused: boolean
}

interface Props {
  result: CombatResult
  clock: React.RefObject<PlaybackClock>
  onTick: (frameIndex: number) => void
}

export function BattleCanvas(props: Props) {
  return (
    <Canvas orthographic camera={{ position: [0, 0, 50], zoom: 40, near: 0.1, far: 200 }} dpr={[1, 2]}>
      <FitCamera />
      <Field />
      <Units {...props} />
    </Canvas>
  )
}

function FitCamera() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera
    cam.zoom = Math.min(size.width / (W + 1.5), size.height / (H + 1.5))
    cam.updateProjectionMatrix()
  }, [camera, size])
  return null
}

const fieldVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fieldFrag = /* glsl */ `
  uniform vec2 uSize;
  uniform float uTime;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    vec2 p = vUv * uSize;
    float n = noise(p * 0.7) * 0.6 + noise(p * 3.1) * 0.4;
    vec3 col = mix(vec3(0.075, 0.063, 0.055), vec3(0.12, 0.10, 0.085), n);

    // faint survey grid
    vec2 g = abs(fract(p) - 0.5);
    float grid = smoothstep(0.48, 0.5, max(g.x, g.y));
    col += grid * 0.025;

    // no-man's-land seam with a slow ember flicker
    float seam = 1.0 - smoothstep(0.0, 0.08, abs(p.x - uSize.x * 0.5));
    col += seam * vec3(0.5, 0.2, 0.08) * (0.18 + 0.06 * sin(uTime * 2.0 + p.y));

    // deployment zones
    float left = smoothstep(uSize.x * 0.42, 0.0, p.x);
    float right = smoothstep(uSize.x * 0.58, uSize.x, p.x);
    col += left * vec3(0.04, 0.035, 0.025) + right * vec3(0.05, 0.0, 0.0);

    // vignette
    vec2 c = vUv - 0.5;
    col *= 1.0 - dot(c, c) * 1.1;
    gl_FragColor = vec4(col, 1.0);
  }
`

function Field() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: fieldVert,
        fragmentShader: fieldFrag,
        uniforms: { uSize: { value: new THREE.Vector2(W, H) }, uTime: { value: 0 } },
      }),
    [],
  )
  useFrame((_, dt) => {
    material.uniforms.uTime!.value += dt
  })
  return (
    <mesh position={[0, 0, -1]} material={material}>
      <planeGeometry args={[W, H]} />
    </mesh>
  )
}

interface UnitRefs {
  group: THREE.Group
  body: THREE.Mesh
  hp: THREE.Mesh
  shield: THREE.Mesh
  energy: THREE.Mesh
  bodyMat: THREE.MeshBasicMaterial
  trimMat: THREE.MeshBasicMaterial
  ringMat: THREE.MeshBasicMaterial
}

const BAR_W = 0.9
const MAX_TRACERS = 64
const TRACER_SECONDS = 0.14
const HIT_FLASH_SECONDS = 0.12

function Units({ result, clock, onTick }: Props) {
  const refs = useRef<(UnitRefs | null)[]>([])
  const lastTick = useRef(-1)

  const tracer = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_TRACERS * 6), 3))
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_TRACERS * 6), 3))
    geo.setDrawRange(0, 0)
    return geo
  }, [])

  const attacks = useMemo(() => result.events.filter((e) => e.kind === 'attack'), [result])
  const teamColors = useMemo(() => [new THREE.Color('#f3d9a4'), new THREE.Color('#ff5a4a')], [])

  useFrame((_, dt) => {
    const c = clock.current
    if (!c.paused) c.time = Math.min(result.duration, c.time + dt * c.speed)
    const fi = Math.min(result.frames.length - 1, Math.floor(c.time / result.tick))
    const frame = result.frames[fi]!
    const now = fi * result.tick

    // Who got hit recently (for flash) and which attacks to draw as tracers.
    const flash = new Set<number>()
    const pos = tracer.attributes.position!.array as Float32Array
    const col = tracer.attributes.color!.array as Float32Array
    let n = 0
    for (let i = attacks.length - 1; i >= 0; i--) {
      const e = attacks[i]!
      if (e.kind !== 'attack' || e.t > now) continue
      if (e.t < now - Math.max(TRACER_SECONDS, HIT_FLASH_SECONDS)) break
      if (now - e.t <= HIT_FLASH_SECONDS) flash.add(e.to)
      if (n < MAX_TRACERS && now - e.t <= TRACER_SECONDS) {
        const a = e.from * FRAME_STRIDE
        const b = e.to * FRAME_STRIDE
        pos.set([frame[a]! - W / 2, frame[a + 1]! - H / 2, 0.5, frame[b]! - W / 2, frame[b + 1]! - H / 2, 0.5], n * 6)
        const tc = teamColors[result.roster[e.from]!.team]!
        col.set([tc.r, tc.g, tc.b, tc.r * 0.4, tc.g * 0.4, tc.b * 0.4], n * 6)
        n++
      }
    }
    tracer.setDrawRange(0, n * 2)
    tracer.attributes.position!.needsUpdate = true
    tracer.attributes.color!.needsUpdate = true

    result.roster.forEach((r, i) => {
      const u = refs.current[i]
      if (!u) return
      const o = i * FRAME_STRIDE
      const [x, y, hp, shield, energy] = [frame[o]!, frame[o + 1]!, frame[o + 2]!, frame[o + 3]!, frame[o + 4]!]
      u.group.position.set(x - W / 2, y - H / 2, 0)
      const alive = hp > 0
      const hpFrac = Math.max(0, hp / r.maxHp)
      setBar(u.hp, hpFrac)
      setBar(u.shield, Math.min(1, shield / r.maxHp))
      setBar(u.energy, Math.min(1, energy / r.maxEnergy))
      u.hp.visible = u.shield.visible = u.energy.visible = alive
      const op = alive ? 1 : 0.18
      u.bodyMat.opacity = u.trimMat.opacity = u.ringMat.opacity = op
      const s = flash.has(r.id) && alive ? 1.18 : 1
      u.body.scale.setScalar(s)
    })

    if (fi !== lastTick.current && (fi % 2 === 0 || fi === result.frames.length - 1)) {
      lastTick.current = fi
      onTick(fi)
    }
  })

  return (
    <>
      <lineSegments geometry={tracer}>
        <lineBasicMaterial vertexColors transparent opacity={0.9} />
      </lineSegments>
      {result.roster.map((r, i) => (
        <UnitMesh
          key={r.id}
          type={r.type}
          element={unitColor(primaryAffinity(r.affinities))}
          trim={RARITY_COLOR[r.rarity]}
          team={TEAM_COLOR[r.team]}
          scale={0.85 + 0.06 * RARITIES.indexOf(r.rarity)}
          onRefs={(refsForUnit) => (refs.current[i] = refsForUnit)}
        />
      ))}
    </>
  )
}

function setBar(mesh: THREE.Mesh, frac: number) {
  mesh.scale.x = Math.max(0.0001, frac)
  mesh.position.x = -BAR_W / 2 + (BAR_W * frac) / 2
}

function UnitMesh({
  type,
  element,
  trim,
  team,
  scale,
  onRefs,
}: {
  type: UnitType
  element: string
  trim: string
  team: string
  scale: number
  onRefs: (r: UnitRefs | null) => void
}) {
  const group = useRef<THREE.Group>(null)
  const body = useRef<THREE.Mesh>(null)
  const hp = useRef<THREE.Mesh>(null)
  const shield = useRef<THREE.Mesh>(null)
  const energy = useRef<THREE.Mesh>(null)

  const mats = useMemo(
    () => ({
      body: new THREE.MeshBasicMaterial({ color: element, transparent: true }),
      trim: new THREE.MeshBasicMaterial({ color: trim, transparent: true }),
      ring: new THREE.MeshBasicMaterial({ color: team, transparent: true }),
    }),
    [element, trim, team],
  )

  useEffect(() => {
    onRefs({
      group: group.current!,
      body: body.current!,
      hp: hp.current!,
      shield: shield.current!,
      energy: energy.current!,
      bodyMat: mats.body,
      trimMat: mats.trim,
      ringMat: mats.ring,
    })
    return () => onRefs(null)
  }, [mats, onRefs])

  const sides = TYPE_SIDES[type]
  const rot = TYPE_ROT[type]

  return (
    <group ref={group}>
      <group scale={scale}>
        <mesh material={mats.ring} rotation-z={rot}>
          <circleGeometry args={[0.56, sides]} />
        </mesh>
        <mesh material={mats.trim} position-z={0.01} rotation-z={rot}>
          <circleGeometry args={[0.47, sides]} />
        </mesh>
        <mesh ref={body} material={mats.body} position-z={0.02} rotation-z={rot}>
          <circleGeometry args={[0.38, sides]} />
        </mesh>
      </group>
      <group position={[0, 0.78, 0.1]}>
        <mesh position-z={-0.01}>
          <planeGeometry args={[BAR_W + 0.06, 0.2]} />
          <meshBasicMaterial color="#0c0a09" />
        </mesh>
        <mesh ref={hp}>
          <planeGeometry args={[BAR_W, 0.12]} />
          <meshBasicMaterial color={team} />
        </mesh>
        <mesh ref={shield} position-z={0.01}>
          <planeGeometry args={[BAR_W, 0.12]} />
          <meshBasicMaterial color="#bfe3ff" transparent opacity={0.75} />
        </mesh>
        <mesh ref={energy} position={[0, -0.12, 0]}>
          <planeGeometry args={[BAR_W, 0.04]} />
          <meshBasicMaterial color="#e3a33b" />
        </mesh>
      </group>
    </group>
  )
}
