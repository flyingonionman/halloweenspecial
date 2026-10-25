/**
 * 3D playback of a CombatResult in the hex arena. Nothing here runs game
 * logic: one frame loop samples the timeline at the clock's (fractional) tick
 * and poses everything: unit models (step hops, swings, casts, hit flashes,
 * deaths), projectiles and skill effects, aggro lines, and the DOM overlay
 * (LoL-style nameplates and floating combat text) projected over the canvas.
 */
import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { FLAG, RARITIES, TYPE_DEFS, UNIT_TYPES, arena, eventsUntil, isRanged, primaryAffinity, type AffinityPoints, type CombatResult, type UnitType } from '../../game'
import { RARITY_COLOR, unitColor } from '../theme'
import { CELL, TPS, actionAt, buildTimeline, frameAt, poseAt, type Timeline } from './playback'
import { MODEL_URL, TEAM_HUE, armRig, dressModel, poseArms, skinOf, type ArmRig } from './models'

export interface PlaybackClock {
  /** Seconds of sim time elapsed. */
  time: number
  speed: number
  paused: boolean
}

export interface ArenaProps {
  result: CombatResult
  clock: React.RefObject<PlaybackClock>
  onTick: (tick: number) => void
  selected: number | null
  onSelect: (id: number | null) => void
  showAggro: boolean
  /** Debug: tint the cells units occupy (a step claims its cell at once). */
  showCells: boolean
  /** DOM layer over the canvas for nameplates and combat text. */
  overlay: React.RefObject<HTMLDivElement | null>
}

export { TEAM_HUE }
const SELECT = '#46e0cf'
UNIT_TYPES.forEach((t) => useGLTF.preload(MODEL_URL(t)))

export function Arena3D(props: ArenaProps) {
  const aspect = 1.6
  const d = 24 / Math.min(1, aspect / 1.4)
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, d * 0.8, d * 0.6], fov: 40, near: 0.5, far: 200 }} onPointerMissed={() => props.onSelect(null)}>
      <color attach="background" args={['#0e0b0a']} />
      <fog attach="fog" args={['#0e0b0a', 34, 80]} />
      <hemisphereLight args={['#b8c2e0', '#3a2c22', 1.6]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[-8, 18, 10]}
        intensity={2.4}
        color="#ffe9c8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-bias={-0.0004}
      />
      <OrbitControls makeDefault target={[0, 0, 0.6]} enableDamping minDistance={9} maxDistance={40} maxPolarAngle={1.25} />
      <ArenaFloor result={props.result} showCells={props.showCells} />
      <Scene {...props} />
    </Canvas>
  )
}

// ── The ring ─────────────────────────────────────────────────────────────

function ArenaFloor({ result, showCells }: { result: CombatResult; showCells: boolean }) {
  const A = arena(result.arenaRadius)
  const R = result.arenaRadius
  const [diff, nor] = useTexture(['/textures/rock_diff.webp', '/textures/rock_nor.webp']) as THREE.Texture[]
  const tiles = useRef<THREE.InstancedMesh>(null)
  const base = useMemo(() => {
    // Stone with a little jitter; each side's deployment rows are faintly warmed in its colour.
    const out: THREE.Color[] = []
    for (const h of A.cells) {
      const col = 2 * h.q + h.r
      const j = ((h.q * 73856093) ^ (h.r * 19349663)) >>> 0
      const c = new THREE.Color('#c4bab0').multiplyScalar(0.9 + ((j % 1000) / 1000) * 0.18)
      if (col <= -5) c.lerp(new THREE.Color(TEAM_HUE[0]), 0.12)
      if (col >= 5) c.lerp(new THREE.Color(TEAM_HUE[1]), 0.12)
      out.push(c)
    }
    return out
  }, [A])

  useEffect(() => {
    const m = tiles.current!
    const mat = new THREE.Matrix4()
    A.cells.forEach((h, i) => {
      const [x, z] = [CELL * Math.sqrt(3) * (h.q + h.r / 2), CELL * 1.5 * h.r]
      m.setMatrixAt(i, mat.makeTranslation(x, -0.12, z))
      m.setColorAt(i, base[i]!)
    })
    m.instanceMatrix.needsUpdate = true
    m.instanceColor!.needsUpdate = true
  }, [A, base])

  // Debug: occupied cells take their occupant's team colour, refreshed every tick.
  useFrame(() => {
    const m = tiles.current
    if (!m) return
    const occ = (m.userData.occ ??= new Int16Array(A.cells.length).fill(-1)) as Int16Array
    const next = new Int16Array(A.cells.length).fill(-1)
    if (showCells) {
      const tick = Math.floor((m.userData.tick as number | undefined) ?? 0)
      const f = frameAt(result, tick)
      for (const r of result.roster) if (f(r.id, 'hp') > 0) next[f(r.id, 'cell')] = r.team
    }
    let dirty = false
    for (let i = 0; i < next.length; i++) {
      if (next[i] === occ[i]) continue
      occ[i] = next[i]!
      m.setColorAt(i, next[i] === -1 ? base[i]! : base[i]!.clone().lerp(new THREE.Color(TEAM_HUE[next[i]!]!), 0.45))
      dirty = true
    }
    if (dirty) m.instanceColor!.needsUpdate = true
  })

  const tileGeo = useMemo(() => new THREE.CylinderGeometry(0.94 * CELL, 0.98 * CELL, 0.24, 6), [])
  const rimR = Math.sqrt(3) * R * CELL + 1.9
  const corners = Array.from({ length: 6 }, (_, k) => {
    const a = (k * Math.PI) / 3
    return [Math.cos(a) * rimR, Math.sin(a) * rimR] as const
  })

  return (
    <group>
      <instancedMesh ref={tiles} args={[tileGeo, undefined, A.cells.length]} receiveShadow name="tiles" userData={{ kind: 'tiles' }}>
        <meshStandardMaterial map={diff} normalMap={nor} roughness={0.95} />
      </instancedMesh>
      {/* Platform under the cells and the outer ground. */}
      <mesh position={[0, -0.55, 0]} rotation-y={Math.PI / 6} receiveShadow>
        <cylinderGeometry args={[rimR + 0.3, rimR + 0.8, 0.8, 6]} />
        <meshStandardMaterial color="#3a332d" roughness={1} />
      </mesh>
      <mesh position={[0, -0.95, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[90, 48]} />
        <meshStandardMaterial color="#17120f" roughness={1} />
      </mesh>
      {/* Low walls between six corner pillars with braziers. */}
      {corners.map(([x, z], k) => {
        const [nx, nz] = corners[(k + 1) % 6]!
        const len = Math.hypot(nx - x, nz - z)
        return (
          <group key={k}>
            <mesh position={[(x + nx) / 2, 0.05, (z + nz) / 2]} rotation-y={-Math.atan2(nz - z, nx - x)} castShadow receiveShadow>
              <boxGeometry args={[len - 0.8, 0.5, 0.4]} />
              <meshStandardMaterial color="#5b5147" roughness={0.95} />
            </mesh>
            <Brazier x={x} z={z} />
          </group>
        )
      })}
    </group>
  )
}

function Brazier({ x, z }: { x: number; z: number }) {
  const flame = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.PointLight>(null)
  const seed = x * 3.1 + z * 1.7
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 7 + seed
    const f = 1 + Math.sin(t) * 0.08 + Math.sin(t * 2.3) * 0.05
    flame.current?.scale.set(1, f * 1.1, 1)
    if (light.current) light.current.intensity = 9 * f
  })
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.32, 0.42, 1.6, 6]} />
        <meshStandardMaterial color="#655a4e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.42, 0.22, 0.25, 6]} />
        <meshStandardMaterial color="#2c2622" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh ref={flame} position={[0, 1.78, 0]}>
        <coneGeometry args={[0.24, 0.6, 6]} />
        <meshBasicMaterial color="#ffae4a" />
      </mesh>
      <pointLight ref={light} position={[0, 2.2, 0]} color="#ff9a48" distance={11} decay={1.6} />
    </group>
  )
}

// ── Units, effects, overlay ──────────────────────────────────────────────

interface Rig {
  root: THREE.Group
  body: THREE.Group
  arms: ArmRig
  mats: THREE.MeshStandardMaterial[]
  ring: THREE.Mesh
  shield: THREE.Mesh
  facing: number
}

const RANGED_FX = { ranger: 'arrow', mage: 'orb', healer: 'orb' } as const
const POOL = { arrow: 36, orb: 36, burst: 24, text: 48 }

function Scene({ result, clock, onTick, selected, onSelect, showAggro, overlay }: ArenaProps) {
  const tl = useMemo<Timeline>(() => buildTimeline(result), [result])
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const gltfs = useGLTF(UNIT_TYPES.map(MODEL_URL))
  const models = useMemo(() => Object.fromEntries(UNIT_TYPES.map((t, i) => [t, gltfs[i]!.scene])) as Record<UnitType, THREE.Group>, [gltfs])

  // Build one rig per roster unit.
  const rigs = useMemo<Rig[]>(
    () =>
      result.roster.map((r) => {
        const { model, mats } = dressModel(models[r.type], { team: TEAM_HUE[r.team], accent: unitColor(primaryAffinity(r.affinities)), skin: skinOf(r.uid) })
        const scale = 1.3 + 0.06 * RARITIES.indexOf(r.rarity)
        model.scale.setScalar(scale)
        const body = new THREE.Group()
        body.add(model)
        const root = new THREE.Group()
        root.add(body)
        // Base ring: team colour, rarity trim.
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.74, 6, 1, Math.PI / 6), new THREE.MeshBasicMaterial({ color: TEAM_HUE[r.team], transparent: true, opacity: 0.9 }))
        ring.rotation.x = -Math.PI / 2
        ring.position.y = 0.015
        const trim = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.58, 6, 1, Math.PI / 6), new THREE.MeshBasicMaterial({ color: RARITY_COLOR[r.rarity], transparent: true, opacity: 0.85 }))
        trim.rotation.x = -Math.PI / 2
        trim.position.y = 0.016
        root.add(ring, trim)
        const shield = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.72, 1),
          new THREE.MeshBasicMaterial({ color: '#bfe3ff', transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }),
        )
        shield.position.y = 0.6
        shield.scale.y = 1.15
        root.add(shield)
        root.userData.unit = r.id
        return { root, body, arms: armRig(model), mats, ring, shield, facing: r.team === 0 ? Math.PI / 2 : -Math.PI / 2 }
      }),
    [result, models],
  )

  // Pools: projectiles and bursts.
  const fx = useMemo(() => {
    const arrowGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.7, 4).rotateX(Math.PI / 2)
    const orbGeo = new THREE.IcosahedronGeometry(0.11, 1)
    const geos = {
      slash: new THREE.TorusGeometry(0.55, 0.05, 3, 12, Math.PI * 0.9),
      ring: new THREE.RingGeometry(0.85, 1, 6, 1, Math.PI / 6),
      ball: new THREE.IcosahedronGeometry(1, 1),
      column: new THREE.CylinderGeometry(0.45, 0.6, 2.4, 8, 1, true),
    }
    const make = (geo: THREE.BufferGeometry, n: number) =>
      Array.from({ length: n }, () => {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
        m.visible = false
        m.frustumCulled = false
        return m
      })
    return { arrows: make(arrowGeo, POOL.arrow), orbs: make(orbGeo, POOL.orb), bursts: make(geos.ball, POOL.burst), geos }
  }, [])

  const aggro = useMemo(() => {
    const n = result.roster.length
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 6), 3))
    g.setDrawRange(0, 0)
    return g
  }, [result])

  const selRing = useMemo(() => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.92, 6, 1, Math.PI / 6), new THREE.MeshBasicMaterial({ color: SELECT, transparent: true, depthTest: false }))
    m.rotation.x = -Math.PI / 2
    m.renderOrder = 5
    m.visible = false
    return m
  }, [])

  // ── DOM overlay: nameplates + floating text
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const dom = useRef<{ plates: HTMLDivElement[]; texts: HTMLDivElement[] } | null>(null)
  useEffect(() => {
    const host = overlay.current
    if (!host) return
    const plates = result.roster.map((r) => {
      const el = document.createElement('div')
      el.className = `np team-${r.team}`
      el.innerHTML = `<div class="np-name"></div><div class="np-row"><b class="np-lv">${r.level}</b><div class="np-bars"><div class="np-hp"><i class="np-fill"></i><i class="np-sh"></i><s style="--seg:${Math.max(4, (100 / r.maxHp) * 100)}%"></s></div><div class="np-en"><i></i></div></div></div><div class="np-st"></div>`
      el.querySelector('.np-name')!.textContent = r.name.length > 16 ? r.name.split(' ')[0]! : r.name
      el.onclick = () => onSelectRef.current(r.id)
      host.appendChild(el)
      return el
    })
    const texts = Array.from({ length: POOL.text }, () => {
      const el = document.createElement('div')
      el.className = 'ft'
      el.style.display = 'none'
      host.appendChild(el)
      return el
    })
    dom.current = { plates, texts }
    return () => {
      plates.forEach((p) => p.remove())
      texts.forEach((p) => p.remove())
      dom.current = null
    }
  }, [result, overlay])

  const lastReport = useRef({ tick: -1, at: 0 })

  // ── The frame loop
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame((state, dt) => {
    const c = clock.current
    if (!c.paused) c.time = Math.min(result.duration, c.time + dt * c.speed)
    const tick = Math.min(result.ticks, c.time * TPS)
    const whole = Math.floor(tick)
    const f = frameAt(result, whole)
    const tiles = state.scene.getObjectByName('tiles')
    if (tiles) tiles.userData.tick = whole

    // Units
    const pos: { x: number; z: number; y: number }[] = []
    for (const r of result.roster) {
      const rig = rigs[r.id]!
      const pose = poseAt(tl, r.id, tick)
      const died = tl.deaths[r.id] ?? Infinity
      const dead = tick >= died
      rig.root.position.set(pose.x, 0, pose.z)
      pos.push({ x: pose.x, z: pose.z, y: 0 })

      // Face the target (or the way we're walking).
      const target = f(r.id, 'target')
      let face = rig.facing
      if (pose.stepping >= 0) {
        const mv = tl.moves[r.id]!.findLast((m) => m.t <= tick)
        if (mv) {
          const [fx0, fz0] = tl.cellXZ[mv.from]!
          const [tx, tz] = tl.cellXZ[mv.to]!
          face = Math.atan2(tx - fx0, tz - fz0)
        }
      } else if (target >= 0 && target !== r.id) {
        const tp = poseAt(tl, target, tick)
        face = Math.atan2(tp.x - pose.x, tp.z - pose.z)
      }
      rig.facing = lerpAngle(rig.facing, face, Math.min(1, dt * 10))
      rig.body.rotation.y = rig.facing

      // Swing / cast.
      const act = dead ? null : actionAt(tl, r.id, tick)
      // The arms do the work (the weapon stays in the fist): wind up until the blow lands, carry
      // through it, then ease back to the stance. Casts also lift the caster a little.
      let lunge = 0
      let lift = 0
      let windup = 0
      let strike = 0
      if (act) {
        const p = act.phase
        const ease = (x: number) => x * x * (3 - 2 * x)
        const fade = p <= 1.3 ? 1 : Math.max(0, 1 - (p - 1.3) / 0.7)
        windup = (p < 1 ? ease(p) : 1) * fade
        strike = (p < 1 ? 0 : ease(Math.min(1, (p - 1) / 0.3))) * fade
        if (act.kind === 'cast') lift = 0.16 * windup
        else if (!isRanged(r.type)) lunge = (-0.06 * (1 - strike) + 0.2 * strike) * windup
      }
      poseArms(rig.arms, r.type, windup, strike)

      // Hit flash.
      const lastHit = tl.hitsTaken[r.id]!.findLast((t) => t <= tick)
      const flash = lastHit !== undefined && tick - lastHit < 1.6 ? 1 - (tick - lastHit) / 1.6 : 0
      for (const m of rig.mats) {
        if (flash > 0) {
          m.emissive.setRGB(1, 0.9, 0.85)
          m.emissiveIntensity = flash * 0.9
        } else {
          m.emissive.copy(m.userData.baseEmissive as THREE.Color)
          m.emissiveIntensity = m.userData.baseIntensity as number
        }
      }

      // Death: topple, then sink through the floor.
      if (dead) {
        const k = Math.min(1, (tick - died) / 5)
        const sink = Math.min(1, Math.max(0, (tick - died - 8) / 25))
        rig.body.rotation.z = (r.team === 0 ? 1 : -1) * k * 1.45
        rig.body.position.set(0, -sink * 1.2, 0)
        rig.ring.visible = sink < 0.3
        rig.root.visible = sink < 1
      } else {
        rig.body.rotation.z = 0
        rig.body.position.set(Math.sin(rig.facing) * lunge, pose.hop + lift, Math.cos(rig.facing) * lunge)
        rig.ring.visible = true
        rig.root.visible = true
      }
      const sh = f(r.id, 'shield')
      rig.shield.visible = !dead && sh > 0.5
      ;(rig.shield.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.min(0.25, (sh / r.maxHp) * 0.8)
    }

    // Selection ring.
    if (selected !== null && pos[selected] && rigs[selected]!.root.visible) {
      selRing.visible = true
      selRing.position.set(pos[selected]!.x, 0.03, pos[selected]!.z)
    } else selRing.visible = false

    // Aggro lines: unit → its current target, at ankle height.
    const ap = aggro.attributes.position!.array as Float32Array
    const ac = aggro.attributes.color!.array as Float32Array
    let n = 0
    if (showAggro) {
      for (const r of result.roster) {
        const tg = f(r.id, 'target')
        if (tg < 0 || f(r.id, 'hp') <= 0 || tg === r.id) continue
        const a = pos[r.id]!
        const b = pos[tg]!
        const friendly = result.roster[tg]!.team === r.team
        const col = new THREE.Color(friendly ? '#7dff9a' : TEAM_HUE[r.team])
        const dim = selected === null || selected === r.id || selected === tg ? 1 : 0.25
        ap.set([a.x, 0.06, a.z, b.x, 0.06, b.z], n * 6)
        ac.set([col.r * dim, col.g * dim, col.b * dim, col.r * dim * 0.25, col.g * dim * 0.25, col.b * dim * 0.25], n * 6)
        n++
      }
    }
    aggro.setDrawRange(0, n * 2)
    aggro.attributes.position!.needsUpdate = true
    aggro.attributes.color!.needsUpdate = true

    // Projectiles and bursts from the events around now.
    for (const m of fx.arrows) m.visible = false
    for (const m of fx.orbs) m.visible = false
    for (const m of fx.bursts) m.visible = false
    let ai = 0
    let oi = 0
    let bi = 0
    const end = eventsUntil(result, Math.floor(tick) + 4) // a few ticks ahead: volleys show their arrows in flight
    const texts: { e: { t: number; to: number; amount: number }; kind: string; i: number }[] = []
    for (let i = end - 1; i >= 0; i--) {
      const e = result.events[i]!
      if (e.t < tick - 14) break
      if (e.t > tick && e.kind !== 'skill') continue
      if (e.kind === 'attack' && isRanged(result.roster[e.id]!.type) && tick <= e.lands) {
        const type = result.roster[e.id]!.type as keyof typeof RANGED_FX
        const kind = RANGED_FX[type]
        const p = (tick - e.t) / Math.max(1, e.lands - e.t)
        const a = pos[e.id]!
        const b = pos[e.to]!
        const col = e.heal ? '#7dff9a' : e.hex ? '#b26bff' : type === 'mage' ? magicColor(result.roster[e.id]!.affinities) : '#f3e6c4'
        if (kind === 'arrow' && ai < fx.arrows.length) placeBolt(fx.arrows[ai++]!, a, b, p, col, 1.0)
        if (kind === 'orb' && oi < fx.orbs.length) placeBolt(fx.orbs[oi++]!, a, b, p, col, 0.9)
      }
      if (e.kind === 'cast' && e.ability === 'volley' && tick <= e.lands) {
        const skill = result.events.find((s, j) => j > i && s.kind === 'skill' && s.id === e.id && s.t === e.lands)
        const p = (tick - e.t) / Math.max(1, e.lands - e.t)
        if (skill?.kind === 'skill') for (const to of skill.targets) if (ai < fx.arrows.length) placeBolt(fx.arrows[ai++]!, pos[e.id]!, pos[to]!, p, '#ffd36b', 1)
      }
      if (e.t > tick) continue
      const age = tick - e.t
      if (e.kind === 'hit') {
        if (e.source === 'attack' && !isRanged(result.roster[e.from]!.type) && age < 3 && bi < fx.bursts.length) {
          const m = fx.bursts[bi++]!
          const b = pos[e.to]!
          m.geometry = fx.geos.slash
          m.position.set(b.x, 0.75, b.z)
          m.rotation.set(-0.4, rigs[e.from]!.facing + Math.PI / 2, 0.6)
          m.scale.setScalar(1 + age * 0.1)
          setFx(m, e.crit ? '#ffb347' : TEAM_HUE[result.roster[e.from]!.team], 1 - age / 3)
        }
        if (age < 14) texts.push({ e, kind: e.crit ? 'crit' : e.damage === 'magic' ? 'magic' : 'phys', i })
      }
      if (e.kind === 'heal' && age < 14) texts.push({ e, kind: 'heal', i })
      if (e.kind === 'skill' && age < 8 && bi < fx.bursts.length) {
        const caster = pos[e.id]!
        const tgt = pos[e.targets[0] ?? e.id] ?? caster
        const m = fx.bursts[bi++]!
        const k = age / 8
        if (e.ability === 'taunt') {
          m.geometry = fx.geos.ring
          m.rotation.set(-Math.PI / 2, 0, 0)
          m.position.set(caster.x, 0.08, caster.z)
          m.scale.setScalar(0.6 + k * 3 * Math.sqrt(3))
          setFx(m, '#ff6b4a', 1 - k)
        } else if (e.ability === 'blast') {
          m.geometry = fx.geos.ball
          m.rotation.set(0, 0, 0)
          m.position.set(tgt.x, 0.6, tgt.z)
          m.scale.setScalar(0.4 + k * 1.6)
          setFx(m, magicColor(result.roster[e.id]!.affinities), 0.8 * (1 - k))
        } else if (e.ability === 'cleave') {
          m.geometry = fx.geos.ring
          m.rotation.set(-Math.PI / 2, 0, 0)
          m.position.set(tgt.x, 0.3, tgt.z)
          m.scale.setScalar(0.8 + k * 1.4)
          setFx(m, '#ffcf6b', 1 - k)
        } else if (e.ability === 'mend') {
          m.geometry = fx.geos.column
          m.rotation.set(0, age * 0.3, 0)
          m.position.set(tgt.x, 1.2, tgt.z)
          m.scale.set(1, 0.6 + k * 0.6, 1)
          setFx(m, '#7dff9a', 0.7 * (1 - k))
        } else if (e.ability === 'volley') {
          m.geometry = fx.geos.ring
          m.rotation.set(-Math.PI / 2, 0, 0)
          m.position.set(caster.x, 0.08, caster.z)
          m.scale.setScalar(0.7 + k)
          setFx(m, '#ffd36b', 1 - k)
        }
      }
    }

    // DOM overlay.
    const d = dom.current
    if (d) {
      const w = size.width
      const h = size.height
      const project = (x: number, y: number, z: number) => {
        v.set(x, y, z).project(camera)
        return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h, v.z] as const
      }
      for (const r of result.roster) {
        const el = d.plates[r.id]!
        const p = pos[r.id]!
        const rig = rigs[r.id]!
        const hp = f(r.id, 'hp')
        const alive = hp > 0
        if (!rig.root.visible || !alive) {
          el.style.display = 'none'
          continue
        }
        const [sx, sy, sz] = project(p.x, 2.0 + rig.body.position.y, p.z)
        el.style.display = sz < 1 ? '' : 'none'
        el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`
        const sh = f(r.id, 'shield')
        const total = Math.max(r.maxHp, hp + sh)
        ;(el.querySelector('.np-fill') as HTMLElement).style.width = `${(hp / total) * 100}%`
        const shEl = el.querySelector('.np-sh') as HTMLElement
        shEl.style.left = `${(hp / total) * 100}%`
        shEl.style.width = `${(sh / total) * 100}%`
        ;(el.querySelector('.np-en i') as HTMLElement).style.width = `${(f(r.id, 'energy') / r.maxEnergy) * 100}%`
        const flags = f(r.id, 'flags')
        const st = `${flags & FLAG.taunted ? '<i class="st-taunt" title="Taunted">!</i>' : ''}${flags & FLAG.slowed ? '<i class="st-slow" title="Slowed">❄</i>' : ''}${flags & FLAG.weakened ? '<i class="st-weak" title="Weakened">↓</i>' : ''}`
        const stEl = el.querySelector('.np-st') as HTMLElement
        if (stEl.dataset.v !== st) {
          stEl.innerHTML = st
          stEl.dataset.v = st
        }
        el.classList.toggle('sel', selected === r.id)
      }
      // Newest numbers first; each floats up and fades over 1.4s of sim time.
      texts.sort((a, b) => b.e.t - a.e.t)
      d.texts.forEach((el, k) => {
        const item = texts[k]
        if (!item) {
          el.style.display = 'none'
          return
        }
        const age = tick - item.e.t
        const p = pos[item.e.to]!
        const [sx, sy] = project(p.x, 2.55 + age * 0.06, p.z)
        const jitter = (((item.i * 37) % 9) - 4) * 7
        el.style.display = ''
        el.className = `ft ft-${item.kind}`
        el.textContent = item.kind === 'heal' ? `+${item.e.amount}` : `${item.e.amount}`
        el.style.transform = `translate(${(sx + jitter).toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%) scale(${item.kind === 'crit' ? 1.35 - Math.min(0.35, age * 0.08) : 1})`
        el.style.opacity = String(Math.max(0, 1 - age / 14))
      })
    }

    const now = state.clock.elapsedTime
    if (whole !== lastReport.current.tick && (now - lastReport.current.at > 0.06 || c.paused || whole >= result.ticks)) {
      lastReport.current = { tick: whole, at: now }
      onTick(whole)
    }
  })

  return (
    <>
      {rigs.map((rig, i) => (
        <primitive
          key={i}
          object={rig.root}
          onClick={(e: { stopPropagation: () => void }) => {
            e.stopPropagation()
            onSelect(i)
          }}
          onPointerOver={() => (document.body.style.cursor = 'pointer')}
          onPointerOut={() => (document.body.style.cursor = '')}
        />
      ))}
      {fx.arrows.map((m, i) => (
        <primitive key={`a${i}`} object={m} />
      ))}
      {fx.orbs.map((m, i) => (
        <primitive key={`o${i}`} object={m} />
      ))}
      {fx.bursts.map((m, i) => (
        <primitive key={`b${i}`} object={m} />
      ))}
      <primitive object={selRing} />
      <lineSegments geometry={aggro} frustumCulled={false}>
        <lineBasicMaterial vertexColors transparent opacity={0.9} depthWrite={false} />
      </lineSegments>
    </>
  )
}

/** A mage's spell colour: its affinity, or arcane violet for plain mages. */
const magicColor = (a: AffinityPoints) => (primaryAffinity(a) ? unitColor(primaryAffinity(a)) : '#c58bff')

function placeBolt(m: THREE.Mesh, a: { x: number; z: number }, b: { x: number; z: number }, p: number, color: string, opacity: number) {
  const k = Math.max(0, Math.min(1, p))
  const arc = Math.sin(k * Math.PI) * 0.6
  m.position.set(a.x + (b.x - a.x) * k, 0.85 + arc, a.z + (b.z - a.z) * k)
  m.lookAt(b.x, 0.85, b.z)
  m.scale.setScalar(1)
  setFx(m, color, opacity)
}

function setFx(m: THREE.Mesh, color: string, opacity: number) {
  const mat = m.material as THREE.MeshBasicMaterial
  mat.color.set(color)
  mat.opacity = Math.max(0, opacity)
  m.visible = opacity > 0.01
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

export const typeLabel = (t: UnitType) => TYPE_DEFS[t].label
