/**
 * Unit portraits as full-body renders of the low-poly battle models.
 *
 * Browsers cap live WebGL contexts at ~16 and a grid holds a dozen portraits,
 * so there is exactly one offscreen renderer:
 *   - still portraits: each look (type × affinity colour × skin) is rendered
 *     once into a PNG data URL and cached; portraits are plain <img>s after that;
 *   - live portraits (the hovered card, the detail view): one shared rAF loop
 *     poses each live model (idle sway, breathing, a periodic attack or cast)
 *     and copies the frame into that portrait's own 2D canvas.
 */
import { useEffect, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { primaryAffinity, type Unit, type UnitType } from '../../game'
import { MODEL_URL, TEAM_HUE, armRig, dressModel, poseArms, skinOf, type ArmRig } from '../battle/models'
import { unitColor } from '../theme'

/** Portraits are tall (3:4). */
export const PORTRAIT_W = 240
export const PORTRAIT_H = 320
const REST_TURN = -0.38 // three-quarter view

let renderer: THREE.WebGLRenderer | null = null
let stage: { scene: THREE.Scene; camera: THREE.PerspectiveCamera; rim: THREE.DirectionalLight; holder: THREE.Group } | null = null
const loader = new GLTFLoader()
const models = new Map<UnitType, Promise<THREE.Object3D>>()
const done = new Map<string, string>()
const pending = new Map<string, Promise<string>>()

function ensureStage() {
  if (stage) return stage
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(PORTRAIT_W, PORTRAIT_H, false)
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#dfe6ff', '#3a2c22', 1.7))
  const key = new THREE.DirectionalLight('#ffe9c8', 2.4)
  key.position.set(2, 3, 3)
  scene.add(key)
  // A rim light from behind, in the unit's affinity colour.
  const rim = new THREE.DirectionalLight('#ffffff', 2.2)
  rim.position.set(-2, 1.5, -2.5)
  scene.add(rim)
  const camera = new THREE.PerspectiveCamera(26, PORTRAIT_W / PORTRAIT_H, 0.1, 30)
  const holder = new THREE.Group()
  scene.add(holder)
  stage = { scene, camera, rim, holder }
  return stage
}

const model = (t: UnitType) => {
  let p = models.get(t)
  if (!p) {
    p = loader.loadAsync(MODEL_URL(t)).then((g) => g.scene)
    models.set(t, p)
  }
  return p
}

interface Look {
  type: UnitType
  accent: string
  skin: string
}
const lookOf = (u: Unit): Look => ({ type: u.type, accent: unitColor(primaryAffinity(u.affinities)), skin: skinOf(u.uid) })
const keyOf = (l: Look) => `${l.type}|${l.accent}|${l.skin}`

/** Camera placement that fits the whole figure (hats and staves included) in the tall frame. */
function frame(m: THREE.Object3D) {
  const { holder, camera } = ensureStage()
  holder.rotation.y = REST_TURN
  holder.add(m)
  const box = new THREE.Box3().setFromObject(holder)
  holder.remove(m)
  const centre = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  const dist = Math.max(((size.y / 2) * 1.12) / tan, ((size.x / 2) * 1.25) / (tan * camera.aspect))
  // Leave a little headroom for the idle bob and weapon swings.
  centre.y += size.y * 0.02
  return { pos: centre.clone().add(new THREE.Vector3(0.18, 0.16, 1).normalize().multiplyScalar(dist)), target: centre }
}

function shoot(m: THREE.Object3D, view: { pos: THREE.Vector3; target: THREE.Vector3 }, accent: string) {
  const { scene, camera, rim, holder } = ensureStage()
  camera.position.copy(view.pos)
  camera.lookAt(view.target)
  rim.color.set(accent)
  holder.add(m)
  renderer!.render(scene, camera)
  holder.remove(m)
}

function renderStill(look: Look): Promise<string> {
  const key = keyOf(look)
  const hit = pending.get(key)
  if (hit) return hit
  const p = model(look.type).then((src) => {
    const { model: m } = dressModel(src, { team: TEAM_HUE[0], accent: look.accent, skin: look.skin })
    poseArms(armRig(m), look.type) // resting stance
    const view = frame(m)
    ensureStage().holder.rotation.y = REST_TURN
    shoot(m, view, look.accent)
    const url = renderer!.domElement.toDataURL('image/png')
    done.set(key, url)
    return url
  })
  pending.set(key, p)
  return p
}

/** The still portrait for a unit, or null while it renders (first time only). */
export function usePortrait(u: Unit): string | null {
  const look = lookOf(u)
  const key = keyOf(look)
  const [url, setUrl] = useState<string | null>(() => done.get(key) ?? null)
  useEffect(() => {
    const ready = done.get(key)
    if (ready) return setUrl(ready)
    let live = true
    renderStill(look).then(
      (u) => live && setUrl(u),
      () => live && setUrl(null),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return url
}

// ── Live portraits ───────────────────────────────────────────────────────

interface Live {
  look: Look
  ctx: CanvasRenderingContext2D
  t0: number
  rig?: {
    model: THREE.Object3D
    body: THREE.Object3D
    arms: ArmRig
    accents: THREE.MeshStandardMaterial[]
    view: { pos: THREE.Vector3; target: THREE.Vector3 }
  }
}

const lives = new Set<Live>()
let raf = 0

const ease = (x: number) => x * x * (3 - 2 * x)
const MELEE = new Set<UnitType>(['fighter', 'tank'])
const CASTER = new Set<UnitType>(['mage', 'healer'])
/** One attack / cast every this many seconds, the rest is idle. */
const CYCLE = 2.6

function pose(l: Live, t: number) {
  const r = l.rig!
  const { holder } = ensureStage()
  // Idle: a slow look around and breathing.
  holder.rotation.y = REST_TURN + Math.sin(t * 0.8) * 0.45
  r.body.position.y = Math.sin(t * 2.4) * 0.012
  r.body.rotation.z = Math.sin(t * 1.2) * 0.015
  r.body.rotation.x = 0
  for (const m of r.accents) m.emissiveIntensity = 0.9

  // Then every cycle: wind up, strike (or cast), recover. The arms move; the weapon stays in hand.
  const p = (t % CYCLE) / CYCLE
  const a = Math.min(1, Math.max(0, (p - 0.45) / 0.45)) // 0..1 across the action window
  const k = a < 0.7 ? 1 : 1 - ease((a - 0.7) / 0.3)
  const windup = a <= 0 || a >= 1 ? 0 : ease(Math.min(1, a / 0.45)) * k
  const strike = a < 0.45 || a >= 1 ? 0 : ease(Math.min(1, (a - 0.45) / 0.15)) * k
  poseArms(r.arms, l.look.type, windup, strike)
  if (MELEE.has(l.look.type)) r.body.rotation.x = -0.05 * windup * (1 - strike) + 0.1 * strike
  else if (CASTER.has(l.look.type)) {
    r.body.position.y += 0.05 * windup
    for (const m of r.accents) m.emissiveIntensity = 0.9 + 2.4 * windup
  }
}

function loop(now: number) {
  for (const l of lives) {
    if (!l.rig) continue
    pose(l, (now - l.t0) / 1000)
    shoot(l.rig.model, l.rig.view, l.look.accent)
    const c = l.ctx.canvas
    l.ctx.clearRect(0, 0, c.width, c.height)
    l.ctx.drawImage(renderer!.domElement, 0, 0, c.width, c.height)
  }
  raf = lives.size ? requestAnimationFrame(loop) : 0
}

/** While `active`, animates the unit into the canvas (one shared WebGL context for every live portrait). */
export function useLivePortrait(u: Unit, canvas: RefObject<HTMLCanvasElement | null>, active: boolean) {
  const look = lookOf(u)
  const key = keyOf(look)
  useEffect(() => {
    const el = canvas.current
    if (!active || !el) return
    const live: Live = { look, ctx: el.getContext('2d')!, t0: performance.now() - CYCLE * 0.3 * 1000 }
    model(look.type).then((src) => {
      if (!lives.has(live)) return
      const { model: m, mats } = dressModel(src, { team: TEAM_HUE[0], accent: look.accent, skin: look.skin })
      // Animate a wrapper so the model's own transform stays intact.
      const body = new THREE.Group()
      body.add(m)
      const arms = armRig(m)
      poseArms(arms, look.type)
      live.rig = { model: body, body, arms, accents: mats.filter((x) => x.name === 'accent'), view: frame(body) }
    })
    lives.add(live)
    if (!raf) raf = requestAnimationFrame(loop)
    return () => {
      lives.delete(live)
      live.ctx.clearRect(0, 0, el.width, el.height)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key])
}
