/**
 * Low-poly unit models, built from code (`npm run models`).
 *
 * Each unit type is a handful of three.js primitives (boxes, cones, low-segment
 * cylinders, icosahedra), flat-shaded and merged per material, then written as
 * a tiny GLB to public/models/units/<type>.glb with gltf-transform. Edit a
 * recipe below and re-run to change a model; swap a GLB for a hand-made one
 * any time, as long as it keeps the same contract:
 *
 *   - faces +z, feet at y = 0, about 1.1 units tall (an arena cell is ~1.7 wide);
 *   - nodes `body`, `armL` and `armR` (pivoting at the shoulders, arms
 *     hanging straight down at rest) and `weapon`, a child of the arm that holds
 *     it, sitting at that hand. The renderer animates by rotating the arms (the
 *     weapon goes with the hand) and the weapon node (the wrist);
 *   - materials named `team` (recoloured to the team colour at runtime) and
 *     `accent` (recoloured to the unit's affinity colour, and made to glow);
 *     everything else keeps its colour.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Document, NodeIO } from '@gltf-transform/core'
import { mkdirSync } from 'node:fs'

const OUT = new URL('../public/models/units/', import.meta.url)

const COLORS = {
  skin: '#d6a27c',
  cloth: '#4b4139',
  robe: '#d9d1c1',
  leather: '#6b4a2e',
  metal: '#a3aab2',
  darkmetal: '#5d636b',
  wood: '#7a5532',
  dark: '#1d1a18',
  gold: '#c9a24a',
  team: '#ffffff',
  accent: '#ffffff',
}
const METALLIC = new Set(['metal', 'darkmetal', 'gold'])

// ── Geometry helpers ────────────────────────────────────────────────────

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d)
const cyl = (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg)
const cone = (r, h, seg = 6) => new THREE.ConeGeometry(r, h, seg)
const ball = (r, detail = 0) => new THREE.IcosahedronGeometry(r, detail)
const torus = (R, r, arc = Math.PI * 2, tube = 8) => new THREE.TorusGeometry(R, r, 3, tube, arc)

/** Collects parts per node and material. */
class Model {
  constructor() {
    const node = () => ({ at: [0, 0, 0], parts: {} })
    this.nodes = { body: node(), armL: node(), armR: node(), weapon: node() }
    this.holder = 'armR'
  }
  /** Shoulder pivots, in model space. Set before adding arm parts. */
  shoulders(xL, xR, y) {
    this.nodes.armL.at = [xL, y, 0]
    this.nodes.armR.at = [xR, y, 0]
    return this
  }
  /** Which hand holds the weapon ('L' | 'R') and where that hand is, in model space. */
  hand(side, x, y, z) {
    this.holder = side === 'L' ? 'armL' : 'armR'
    this.nodes.weapon.at = [x, y, z]
    return this
  }
  /** Body and arm parts are placed in model space; weapon parts relative to the hand. */
  add(node, mat, geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
    const o = node === 'weapon' ? [0, 0, 0] : this.nodes[node].at
    const m = new THREE.Matrix4().compose(new THREE.Vector3(p[0] - o[0], p[1] - o[1], p[2] - o[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s))
    const g = geo.index ? geo.toNonIndexed() : geo
    g.applyMatrix4(m)
    g.deleteAttribute('uv')
    g.computeVertexNormals() // non-indexed → flat facets
    ;(this.nodes[node].parts[mat] ??= []).push(g)
    return this
  }
  body(mat, geo, t) {
    return this.add('body', mat, geo, t)
  }
  weapon(mat, geo, t) {
    return this.add('weapon', mat, geo, t)
  }
  arm(side, mat, geo, t) {
    return this.add(side === 'L' ? 'armL' : 'armR', mat, geo, t)
  }
}

// ── Shared anatomy ──────────────────────────────────────────────────────

/** Legs, torso, arms, head. `bulk` widens the frame; `robe` swaps legs for a robe skirt. */
function humanoid(m, { bulk = 1, robe = null, torso = 'cloth', arms = 'cloth', legs = 'cloth', tabard = true } = {}) {
  const w = 0.4 * bulk
  if (robe) {
    m.body(robe, cyl(0.17 * bulk, 0.3 * bulk, 0.56, 7), { p: [0, 0.28, 0] })
  } else {
    m.body(legs, box(0.15 * bulk, 0.4, 0.17), { p: [-0.1 * bulk, 0.2, 0] })
    m.body(legs, box(0.15 * bulk, 0.4, 0.17), { p: [0.1 * bulk, 0.2, 0] })
    m.body('leather', box(0.17 * bulk, 0.08, 0.22), { p: [-0.1 * bulk, 0.04, 0.03] })
    m.body('leather', box(0.17 * bulk, 0.08, 0.22), { p: [0.1 * bulk, 0.04, 0.03] })
  }
  m.body(torso, box(w, 0.42, 0.26 * bulk), { p: [0, 0.62, 0] })
  m.body('leather', box(w + 0.02, 0.06, 0.27 * bulk), { p: [0, 0.44, 0] }) // belt
  if (tabard) m.body('team', box(w * 0.62, 0.4, 0.02), { p: [0, 0.56, 0.135 * bulk] })
  m.shoulders(-(w / 2 + 0.07), w / 2 + 0.07, 0.8)
  m.arm('L', arms, box(0.12, 0.36, 0.13), { p: [-(w / 2 + 0.07), 0.64, 0] })
  m.arm('R', arms, box(0.12, 0.36, 0.13), { p: [w / 2 + 0.07, 0.64, 0] })
  m.arm('L', 'skin', box(0.1, 0.09, 0.1), { p: [-(w / 2 + 0.07), 0.42, 0.02] })
  m.arm('R', 'skin', box(0.1, 0.09, 0.1), { p: [w / 2 + 0.07, 0.42, 0.02] })
  m.body('skin', box(0.1, 0.06, 0.1), { p: [0, 0.86, 0] }) // neck
  m.body('skin', box(0.24, 0.25, 0.24), { p: [0, 1.0, 0] })
  m.body('dark', box(0.04, 0.04, 0.01), { p: [-0.055, 1.02, 0.121] }) // eyes
  m.body('dark', box(0.04, 0.04, 0.01), { p: [0.055, 1.02, 0.121] })
  return { w, handR: [w / 2 + 0.07, 0.42, 0.04], handL: [-(w / 2 + 0.07), 0.42, 0.04] }
}

// ── Recipes ─────────────────────────────────────────────────────────────

const RECIPES = {
  fighter() {
    const m = new Model()
    const { handR, handL, w } = humanoid(m, { torso: 'metal', arms: 'cloth', legs: 'cloth' })
    // Helmet with a team-coloured crest.
    m.body('metal', box(0.28, 0.14, 0.28), { p: [0, 1.13, 0] })
    m.body('metal', box(0.3, 0.05, 0.3), { p: [0, 1.06, 0] })
    m.body('team', box(0.05, 0.12, 0.3), { p: [0, 1.25, -0.02] })
    // Buckler on the left forearm.
    m.arm('L', 'darkmetal', cyl(0.19, 0.19, 0.05, 8), { p: [handL[0] - 0.05, 0.56, 0.12], r: [Math.PI / 2, 0, 0] })
    m.arm('L', 'accent', ball(0.05), { p: [handL[0] - 0.05, 0.56, 0.155] })
    // Sword: held upright-forward from the right hand.
    m.hand('R', ...handR)
    m.weapon('leather', cyl(0.025, 0.025, 0.14, 5), { p: [0, 0, 0] })
    m.weapon('gold', box(0.2, 0.035, 0.05), { p: [0, 0.08, 0] })
    m.weapon('metal', box(0.06, 0.58, 0.02), { p: [0, 0.38, 0] })
    m.weapon('metal', cone(0.035, 0.08, 4), { p: [0, 0.71, 0], r: [0, Math.PI / 4, 0] })
    m.weapon('accent', ball(0.03), { p: [0, -0.08, 0] })
    return m
  },

  tank() {
    const m = new Model()
    const { handR, handL } = humanoid(m, { bulk: 1.3, torso: 'metal', arms: 'metal', legs: 'darkmetal', tabard: false })
    // Pauldrons and great helm with a visor slit.
    m.arm('L', 'metal', ball(0.15), { p: [-0.36, 0.84, 0], s: [1.1, 0.7, 1.1] })
    m.arm('R', 'metal', ball(0.15), { p: [0.36, 0.84, 0], s: [1.1, 0.7, 1.1] })
    m.body('metal', box(0.32, 0.32, 0.31), { p: [0, 1.04, 0] })
    m.body('dark', box(0.24, 0.035, 0.02), { p: [0, 1.06, 0.157] })
    m.body('team', cone(0.06, 0.16, 4), { p: [0, 1.28, 0] })
    // Tower shield: team face, iron rim, affinity boss.
    m.body('darkmetal', box(0.5, 0.74, 0.05), { p: [handL[0] + 0.06, 0.6, 0.3] })
    m.body('team', box(0.42, 0.66, 0.02), { p: [handL[0] + 0.06, 0.6, 0.33] })
    m.body('accent', ball(0.07), { p: [handL[0] + 0.06, 0.64, 0.35] })
    // War hammer.
    m.hand('R', ...handR)
    m.weapon('wood', cyl(0.03, 0.03, 0.62, 5), { p: [0, 0.2, 0] })
    m.weapon('darkmetal', box(0.26, 0.14, 0.14), { p: [0, 0.52, 0] })
    m.weapon('accent', box(0.04, 0.15, 0.15), { p: [0.13, 0.52, 0] })
    return m
  },

  ranger() {
    const m = new Model()
    const { handR, handL } = humanoid(m, { torso: 'leather', arms: 'leather', legs: 'cloth' })
    // Hood and cloak in team colour.
    m.body('team', cone(0.21, 0.3, 6), { p: [0, 1.2, -0.02] })
    m.body('team', box(0.28, 0.08, 0.28), { p: [0, 1.11, -0.02] })
    m.body('team', box(0.42, 0.62, 0.04), { p: [0, 0.6, -0.16], r: [0.08, 0, 0] })
    // Quiver with fletchings.
    m.body('leather', cyl(0.06, 0.05, 0.42, 6), { p: [0.12, 0.72, -0.2], r: [0, 0, -0.35] })
    m.body('accent', box(0.04, 0.06, 0.04), { p: [0.2, 0.95, -0.2] })
    m.body('accent', box(0.04, 0.06, 0.04), { p: [0.24, 0.92, -0.17] })
    // Bow in the left hand, upright, string toward the body.
    m.hand('L', ...handL)
    m.weapon('wood', torus(0.36, 0.022, Math.PI, 8), { p: [0, 0.1, 0.06], r: [0, Math.PI / 2, Math.PI / 2] })
    m.weapon('robe', box(0.008, 0.72, 0.008), { p: [0, 0.1, 0.06] })
    m.weapon('accent', ball(0.035), { p: [0, 0.1, 0.42] })
    return m
  },

  mage() {
    const m = new Model()
    const { handR } = humanoid(m, { robe: 'team', torso: 'team', arms: 'team', tabard: false })
    m.body('gold', box(0.3, 0.05, 0.28), { p: [0, 0.48, 0] }) // sash
    m.body('robe', box(0.18, 0.12, 0.05), { p: [0, 0.86, 0.12] }) // beard
    // Wide-brimmed pointed hat.
    m.body('team', cyl(0.24, 0.24, 0.03, 8), { p: [0, 1.15, 0] })
    m.body('team', cone(0.14, 0.5, 6), { p: [0, 1.41, -0.04], r: [-0.18, 0, 0] })
    m.body('accent', cyl(0.145, 0.145, 0.04, 6), { p: [0, 1.18, 0] })
    // Staff with a glowing orb.
    m.hand('R', ...handR)
    m.weapon('wood', cyl(0.028, 0.034, 1.1, 5), { p: [0, 0.18, 0] })
    m.weapon('gold', torus(0.07, 0.015, Math.PI * 2, 6), { p: [0, 0.76, 0], r: [Math.PI / 2, 0, 0] })
    m.weapon('accent', ball(0.09, 1), { p: [0, 0.84, 0] })
    return m
  },

  healer() {
    const m = new Model()
    const { handR } = humanoid(m, { robe: 'robe', torso: 'robe', arms: 'robe', tabard: true })
    // Hood and mantle.
    m.body('robe', cone(0.22, 0.28, 6), { p: [0, 1.18, -0.03] })
    m.body('robe', box(0.29, 0.07, 0.29), { p: [0, 1.11, -0.02] })
    m.body('gold', cyl(0.27, 0.3, 0.06, 7), { p: [0, 0.83, 0] })
    // Staff with a ring and an affinity crystal.
    m.hand('R', ...handR)
    m.weapon('wood', cyl(0.026, 0.03, 1.0, 5), { p: [0, 0.16, 0] })
    m.weapon('gold', torus(0.11, 0.018, Math.PI * 2, 8), { p: [0, 0.78, 0] })
    m.weapon('accent', ball(0.07, 0), { p: [0, 0.78, 0], s: [0.8, 1.4, 0.8] })
    return m
  },
}

// ── Export ──────────────────────────────────────────────────────────────

async function write(type, model) {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const mats = {}
  const material = (name) =>
    (mats[name] ??= doc
      .createMaterial(name)
      .setBaseColorFactor([...new THREE.Color(COLORS[name]).toArray(), 1])
      .setRoughnessFactor(METALLIC.has(name) ? 0.45 : 0.85)
      .setMetallicFactor(METALLIC.has(name) ? 0.6 : 0))
  const acc = (arr, type) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer)

  const root = doc.createNode(type)
  doc.createScene(type).addChild(root)
  let tris = 0
  const made = {}
  for (const [name, { at, parts }] of Object.entries(model.nodes)) {
    const mesh = doc.createMesh(name)
    for (const [mat, geos] of Object.entries(parts)) {
      const g = mergeGeometries(geos)
      tris += g.attributes.position.count / 3
      mesh.addPrimitive(
        doc
          .createPrimitive()
          .setAttribute('POSITION', acc(new Float32Array(g.attributes.position.array), 'VEC3'))
          .setAttribute('NORMAL', acc(new Float32Array(g.attributes.normal.array), 'VEC3'))
          .setMaterial(material(mat)),
      )
    }
    made[name] = doc.createNode(name).setTranslation(at).setMesh(mesh)
  }
  const holder = model.nodes[model.holder].at
  made.weapon.setTranslation(model.nodes.weapon.at.map((v, i) => v - holder[i]))
  for (const name of ['body', 'armL', 'armR']) root.addChild(made[name])
  made[model.holder].addChild(made.weapon)
  const path = new URL(`${type}.glb`, OUT)
  await new NodeIO().write(path.pathname.replace(/^\/([A-Za-z]:)/, '$1'), doc)
  console.log(`${type}.glb  ${tris} tris`)
}

mkdirSync(OUT, { recursive: true })
for (const [type, recipe] of Object.entries(RECIPES)) await write(type, recipe())
