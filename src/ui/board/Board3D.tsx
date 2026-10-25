/**
 * The city board: a Catan-style hex map in 3D. Renders the WorldMap only —
 * all rules live in the game core; this reports hovers and clicks.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import {
  Html,
  Line,
  MapControls,
  Stars,
  useGLTF,
  useTexture,
} from "@react-three/drei";
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  BUILDING_DEFS,
  SITE_DEFS,
  TERRAIN_DEFS,
  hexKey,
  hexToWorld,
  neighbors,
  type BuildingId,
  type Hex,
  type PlacedBuilding,
  type TerrainId,
  type Tile,
  type WorldMap,
} from "../../game";
import {
  AFFINITY_COLOR,
  PLAIN_COLOR,
  RESOURCE_COLOR,
  TERRAIN_COLOR,
} from "../theme";

export interface TilePreview {
  text: string;
  best: boolean;
}

/** A map-lens overlay on one tile: a tint over the whole hex and a short label. */
export interface TileOverlay {
  color: string;
  text: string;
  /** Wild land: fainter tint and label. */
  faint?: boolean;
}

interface Props {
  map: WorldMap;
  selected: Hex | null;
  frontier: Set<string>;
  /** When a building is armed for placement: label per valid tile key. */
  previews: Record<string, TilePreview> | null;
  /** Map lens (resources / buildings): overlay per tile key; null for the normal view. */
  overlays?: Record<string, TileOverlay> | null;
  onSelect: (h: Hex | null) => void;
}

/** The board is flat: every tile's top sits at the same height. Relief comes from the surface textures. */
const TILE_H = 0.25;

/** How far each prism sinks below the surface, so the curved planet never shows under a tile. */
const SINK = 0.5;

const SHADE = new THREE.Color("#0d0b10");

// ── Planet curvature ──────────────────────────────────────────────────

/** Radius of the world sphere; the capital sits on its north pole at y = 0. */
const PLANET_R = 40;
const UP = new THREE.Vector3(0, 1, 0);

/** Where a flat board position lands on the planet, and the rotation that makes its tile face outward. */
function planetPose(x: number, z: number) {
  const d2 = Math.min(x * x + z * z, PLANET_R * PLANET_R * 0.9);
  const y = Math.sqrt(PLANET_R * PLANET_R - d2) - PLANET_R;
  const normal = new THREE.Vector3(x, y + PLANET_R, z).normalize();
  return {
    position: new THREE.Vector3(x, y, z),
    quaternion: new THREE.Quaternion().setFromUnitVectors(UP, normal),
  };
}

// ── Terrain surface textures (procedural, no downloads) ───────────────

const textureCache = new Map<TerrainId, THREE.CanvasTexture>();

/** A 128px painterly swatch per terrain: base colour plus marks that read as grass, rock, ice, lava… */
function terrainTexture(t: TerrainId): THREE.CanvasTexture {
  const hit = textureCache.get(t);
  if (hit) return hit;
  const size = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d")!;
  const base = new THREE.Color(TERRAIN_COLOR[t]);
  g.fillStyle = `#${base.getHexString()}`;
  g.fillRect(0, 0, size, size);
  let seed = t.length * 977;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const tone = (k: number, a = 1) => {
    const c = base.clone().multiplyScalar(k);
    return `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${a})`;
  };
  const strokes = (n: number, len: number, colors: string[], width = 1.5) => {
    for (let i = 0; i < n; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const a = rnd() * Math.PI;
      g.strokeStyle = colors[i % colors.length]!;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
  };
  const dots = (n: number, r: number, colors: string[]) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = colors[i % colors.length]!;
      g.beginPath();
      g.arc(rnd() * size, rnd() * size, r * (0.5 + rnd()), 0, Math.PI * 2);
      g.fill();
    }
  };
  switch (t) {
    case "plains":
      strokes(260, 5, [tone(1.25), tone(0.8), tone(1.1)], 1.2);
      break;
    case "steppe":
      strokes(220, 7, [tone(1.2), tone(0.78)], 1.1);
      break;
    case "forest":
      dots(90, 7, [tone(0.7, 0.8), tone(1.2, 0.6), tone(0.55, 0.7)]);
      break;
    case "hills":
      for (let i = 0; i < 9; i++) {
        g.strokeStyle = tone(i % 2 ? 0.75 : 1.2, 0.8);
        g.lineWidth = 2;
        g.beginPath();
        g.arc(rnd() * size, rnd() * size, 14 + rnd() * 26, 0, Math.PI);
        g.stroke();
      }
      break;
    case "mountains":
      strokes(70, 18, [tone(0.6), tone(1.35)], 1.6);
      dots(30, 3, [tone(1.5, 0.8)]);
      break;
    case "tundra":
      dots(120, 3, ["rgba(255,255,255,0.8)", "rgba(150,200,230,0.6)"]);
      strokes(30, 14, ["rgba(140,190,220,0.6)"], 1);
      break;
    case "volcanic":
      strokes(28, 24, ["rgba(255,110,40,0.85)", "rgba(255,170,60,0.6)"], 2);
      dots(40, 3, ["rgba(0,0,0,0.5)"]);
      break;
    case "leyfield":
      dots(60, 2.5, ["rgba(220,180,255,0.9)", "rgba(150,110,240,0.7)"]);
      strokes(20, 30, ["rgba(200,160,255,0.35)"], 1);
      break;
    case "highlands":
      strokes(90, 12, [tone(1.3), tone(0.7)], 2);
      break;
    case "lake":
      for (let i = 0; i < 14; i++) {
        g.strokeStyle = "rgba(200,235,255,0.35)";
        g.lineWidth = 1.2;
        g.beginPath();
        g.arc(rnd() * size, rnd() * size, 6 + rnd() * 12, 0.2, Math.PI - 0.2);
        g.stroke();
      }
      break;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textureCache.set(t, tex);
  return tex;
}

export function Board3D(props: Props) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 15, 12.5], fov: 40, far: 400 }}
      onPointerMissed={() => props.onSelect(null)}
    >
      <fog attach="fog" args={[FOG_COLOR, 24, 70]} />
      <NightSky />
      <hemisphereLight args={["#b9c8ff", "#2a1f18", 0.55]} />
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
      <directionalLight
        position={[8, 10, 12]}
        intensity={0.9}
        color="#ffd9a8"
      />
      {/* the city's hearth glow */}
      <pointLight
        position={[0, 1.6, 0]}
        color="#ffb060"
        intensity={6}
        distance={7}
        decay={1.6}
      />
      <MapControls
        makeDefault
        enableDamping
        dampingFactor={0.12}
        minDistance={7}
        maxDistance={28}
        maxPolarAngle={1.25}
        minPolarAngle={0.3}
      />
      <EndlessOcean />
      <Suspense fallback={null}>
        <Tiles {...props} />
      </Suspense>
      <Border map={props.map} />
    </Canvas>
  );
}

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFrag = /* glsl */ `
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y, -0.2, 1.0);
    vec3 horizon = vec3(0.29, 0.32, 0.455); // = FOG_COLOR
    vec3 zenith = vec3(0.012, 0.018, 0.06);
    // Fog owns the lower sky; only high overhead does it darken into night.
    vec3 col = mix(horizon, zenith, smoothstep(0.3, 0.95, h));
    // faint aurora-ish band low on the horizon

    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Night-sky skybox: gradient dome, stars and a moon. Ignores fog. */
function NightSky() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      }),
    [],
  );
  return (
    <>
      <mesh material={mat} renderOrder={-1}>
        <sphereGeometry args={[300, 32, 16]} />
      </mesh>
      <Stars
        radius={180}
        depth={40}
        count={2500}
        factor={4}
        saturation={0.1}
        fade
        speed={0.4}
      />
      <mesh position={[-90, 70, -140]}>
        <sphereGeometry args={[7, 32, 16]} />
        <meshBasicMaterial color="#f4ecd6" fog={false} />
      </mesh>
      <mesh position={[-90, 70, -140]}>
        <sphereGeometry args={[11, 32, 16]} />
        <meshBasicMaterial
          color="#c9d6ff"
          transparent
          opacity={0.08}
          fog={false}
        />
      </mesh>
    </>
  );
}

/** The world below the board: an ocean sphere whose north pole sits just under the capital. */
/** Sea level: the curved land dome rises out of it, and its rim sinks below. */
const SEA_Y = -1.0;
/** Shared by scene fog, the far mist and the sky's horizon, so they melt into one another. */
const FOG_COLOR = "#4a5274";
/** Roughly where the last ring of tiles ends. */
const EDGE_R = 9.4;

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
`;

/** Flat fog bank on the water beyond the last tiles: the edge of the world. */
const mistSheetFrag = /* glsl */ `
  uniform float uTime;
  uniform float uInner;
  uniform vec3 uFog;
  varying vec3 vWorld;
  ${noiseGlsl}
  void main() {
    float r = length(vWorld.xz);
    float n = fbm(vWorld.xz * 0.12 + vec2(uTime * 0.03, -uTime * 0.02));
    float band = smoothstep(uInner - 1.0, uInner + 5.0, r);
    // Wisps near the rim, a solid wall of mist further out: the world simply ends.
    float solid = smoothstep(uInner + 1.5, uInner + 6.0, r);
    float a = max(band * (0.35 + 0.65 * n), solid);
    vec3 wisp = mix(vec3(0.42, 0.45, 0.6), vec3(0.72, 0.75, 0.88), n);
    gl_FragColor = vec4(mix(wisp, uFog, solid), a);
  }
`;

/** Rising curtain of mist around the rim, drifting sideways. */
const mistWallFrag = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noiseGlsl}
  void main() {
    float ang = atan(vWorld.z, vWorld.x);
    float n = fbm(vec2(ang * 3.0 + uTime * 0.05, vUv.y * 2.5 - uTime * 0.04));
    // soft on both ends so it never shows a hard rim
    float fade = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y));
    float a = fade * smoothstep(0.3, 0.75, n);
    gl_FragColor = vec4(vec3(0.62, 0.66, 0.8), a * 0.45);
  }
`;

const worldVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

/** Water right at the shore, fading into solid fog a few tiles out. */
const seaFrag = /* glsl */ `
  uniform vec3 uFog;
  uniform float uInner;
  varying vec3 vWorld;
  void main() {
    float r = length(vWorld.xz);
    vec3 water = vec3(0.08, 0.15, 0.22);
    gl_FragColor = vec4(mix(water, uFog, smoothstep(uInner - 1.0, uInner + 4.0, r)), 1.0);
  }
`;

/** The world ends in fog: shoreline water, wisps at the rim, then nothing but mist. */
function EndlessOcean() {
  const sea = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: worldVert,
        fragmentShader: seaFrag,
        uniforms: {
          uFog: { value: new THREE.Color(FOG_COLOR).convertLinearToSRGB() },
          uInner: { value: EDGE_R },
        },
      }),
    [],
  );
  const sheet = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: worldVert,
        fragmentShader: mistSheetFrag,
        uniforms: {
          uTime: { value: 0 },
          uInner: { value: EDGE_R },
          uFog: { value: new THREE.Color(FOG_COLOR).convertLinearToSRGB() },
        },
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
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
  );
  useFrame((_, dt) => {
    sheet.uniforms.uTime!.value += dt;
    wall.uniforms.uTime!.value += dt;
  });
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={SEA_Y} material={sea}>
        <planeGeometry args={[1200, 1200]} />
      </mesh>
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={SEA_Y + 0.12}
        material={sheet}
        renderOrder={2}
      >
        <ringGeometry args={[EDGE_R - 1.5, 160, 128, 1]} />
      </mesh>
      <mesh position-y={SEA_Y + 0.9} material={wall} renderOrder={3}>
        <cylinderGeometry args={[EDGE_R + 1.5, EDGE_R + 4, 2.4, 96, 1, true]} />
      </mesh>
    </>
  );
}

/** Standalone turntable of one building on a tile, for the build panel. */
export function BuildingPreview({
  id,
  terrain,
}: {
  id: BuildingId;
  terrain: TerrainId;
}) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [2.2, 2.0, 2.6], fov: 32 }}
      gl={{ alpha: true }}
    >
      <hemisphereLight args={["#c9d4ff", "#2a1f18", 0.7]} />
      <directionalLight position={[3, 5, 2]} intensity={1.8} color="#fff1d8" />
      <directionalLight
        position={[-3, 2, -3]}
        intensity={0.6}
        color="#8fa8ff"
      />
      <Turntable>
        <mesh geometry={hexGeo} scale={[1, 0.3, 1]} position-y={-0.15}>
          <meshStandardMaterial
            attach="material-0"
            color={new THREE.Color(TERRAIN_COLOR[terrain]).multiplyScalar(0.42)}
            flatShading
          />
          <meshStandardMaterial
            attach="material-1"
            map={terrainTexture(terrain)}
          />
          <meshStandardMaterial attach="material-2" color="#111" />
        </mesh>
        <BuildingMesh
          key={id}
          building={{ id, level: BUILDING_DEFS[id].maxLevel }}
          terrain={terrain}
        />
      </Turntable>
    </Canvas>
  );
}

function Turntable({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.5;
  });
  return (
    <group ref={ref} position-y={-0.35}>
      {children}
    </group>
  );
}

// ── Photo surfaces (Poly Haven, CC0, shrunk to 512px WebP) ────────────

type SurfaceId =
  | "grass"
  | "rock"
  | "snow"
  | "mud"
  | "volcanic"
  | "rocky"
  | "forestground"
  | "rocky2";
const SURFACE_IDS: SurfaceId[] = [
  "grass",
  "rock",
  "snow",
  "mud",
  "volcanic",
  "rocky",
  "forestground",
  "rocky2",
];

/** Terrains with a photo surface, and the tint that turns the photo into that terrain. Others stay procedural. */
const SURFACE: Partial<
  Record<
    TerrainId,
    { id: SurfaceId; tint: string; bump?: number; relief?: number }
  >
> = {
  plains: { id: "grass", tint: "#d6e2a2", bump: 1, relief: 0.1 },
  forest: { id: "grass", tint: "#86a874", bump: 2, relief: 0.1 },
  // No mountain model: the rock top is displaced by its own photo (relief) and lit with a deep normal map (bump).
  mountains: { id: "rock", tint: "#e4e0da", bump: 10, relief: 0.5 },
  tundra: { id: "snow", tint: "#eef6ff", bump: 1, relief: 0.1 },
  leyfield: { id: "mud", tint: "#c4b0e8", bump: 1, relief: 0.2 },
  volcanic: { id: "volcanic", tint: "#d8786a", bump: 5, relief: 0.3 },
  steppe: { id: "forestground", tint: "#f0dcb0", bump: 3, relief: 0.4 },
  hills: { id: "rocky", tint: "#f4ead2", bump: 4, relief: 0.4 },
  highlands: { id: "rocky2", tint: "#d4ece6", bump: 10, relief: 0.6 },
};
/** World units one texture repeat covers; UVs follow world position so neighbours join up. */
const SURFACE_SPAN = 5;

interface Surface {
  map: THREE.Texture;
  normal: THREE.Texture;
}
type Surfaces = Record<SurfaceId, Surface>;

function useSurfaces(): Surfaces {
  const urls = SURFACE_IDS.flatMap((id) => [
    `/textures/${id}_diff.webp`,
    `/textures/${id}_nor.webp`,
  ]);
  const texs = useTexture(urls) as THREE.Texture[];
  return useMemo(() => {
    const out = {} as Surfaces;
    SURFACE_IDS.forEach((id, i) => {
      const map = texs[i * 2]!;
      const normal = texs[i * 2 + 1]!;
      map.colorSpace = THREE.SRGBColorSpace;
      for (const t of [map, normal]) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 4;
      }
      out[id] = { map, normal };
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, texs);
}

/** Per-tile clones (sharing the image) offset to the tile's world position. */
function surfaceFor(surface: Surface, x: number, z: number): Surface {
  const k = (2 * HEX_R) / SURFACE_SPAN;
  const out = { map: surface.map.clone(), normal: surface.normal.clone() };
  for (const t of [out.map, out.normal]) {
    t.repeat.set(k, k);
    // the top cap's u runs along z and v along x
    t.offset.set(z / SURFACE_SPAN, x / SURFACE_SPAN);
    t.needsUpdate = true;
  }
  return out;
}

/** A texture's brightness as a wrapping, bilinear height field in [0,1]; rocks are lighter than the cracks between them. */
const heightCache = new WeakMap<object, (u: number, v: number) => number>();
function heightField(tex: THREE.Texture) {
  const img = tex.image as CanvasImageSource;
  const hit = heightCache.get(img);
  if (hit) return hit;
  const N = 128;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  g.filter = "blur(1.5px)"; // rock masses, not pixel grit
  g.drawImage(img, 0, 0, N, N);
  const d = g.getImageData(0, 0, N, N).data;
  const px = (x: number, y: number) => {
    const i = ((((y % N) + N) % N) * N + (((x % N) + N) % N)) * 4;
    return (d[i]! * 0.3 + d[i + 1]! * 0.59 + d[i + 2]! * 0.11) / 255;
  };
  const f = (u: number, v: number) => {
    // textures are flipped on upload: v = 0 is the image's bottom row
    const x = u * N - 0.5;
    const y = (1 - v) * N - 0.5;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const top = px(x0, y0) * (1 - fx) + px(x0 + 1, y0) * fx;
    const bot = px(x0, y0 + 1) * (1 - fx) + px(x0 + 1, y0 + 1) * fx;
    return top * (1 - fy) + bot * fy;
  };
  heightCache.set(img, f);
  return f;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * A finely subdivided hex top displaced by the surface photo, fading to flat at the rim so it
 * still meets the tile walls and its neighbours. UVs match the cylinder cap's, so the same
 * per-tile texture offset lines up.
 */
/**
 * Where a building stands on its tile: a small flat pad in the front-right
 * corner (toward the camera), so the terrain keeps the rest of the tile.
 * The capital is the exception and stays centred.
 */
const PAD = { x: 0.34, z: 0.3, r: 0.36 };
/** Building scale on the pad. */
const PAD_SCALE = 0.55;
/** 0 on the pad, easing to 1 just outside it: multiply terrain heights by this. */
function padFlatten(x: number, z: number) {
  const d = Math.hypot(x - PAD.x, z - PAD.z);
  return smooth(PAD.r * 0.7, PAD.r * 1.25, d);
}

function reliefGeometry(surface: Surface, amp: number, pad = false, steps = 20) {
  const height = heightField(surface.map);
  const { repeat, offset } = surface.map;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const corner = (i: number) =>
    [
      HEX_R * Math.sin((i * Math.PI) / 3),
      HEX_R * Math.cos((i * Math.PI) / 3),
    ] as const;
  for (let s = 0; s < 6; s++) {
    const [ax, az] = corner(s);
    const [bx, bz] = corner(s + 1);
    const base = pos.length / 3;
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= i; j++) {
        const x = ((i - j) * ax + j * bx) / steps;
        const z = ((i - j) * az + j * bz) / steps;
        const u = z / (2 * HEX_R) + 0.5;
        const v = x / (2 * HEX_R) + 0.5;
        const lum = height(u * repeat.x + offset.x, v * repeat.y + offset.y);
        const y =
          Math.min(1, Math.max(0, (lum - 0.2) / 0.55)) *
          amp *
          smooth(0.06, 0.4, 1 - i / steps) *
          (pad ? padFlatten(x, z) : 1);
        pos.push(x, y, z);
        uv.push(u, v);
      }
    }
    const at = (i: number, j: number) => base + (i * (i + 1)) / 2 + j;
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j <= i; j++) {
        idx.push(at(i, j), at(i + 1, j), at(i + 1, j + 1));
        if (j < i) idx.push(at(i, j), at(i + 1, j + 1), at(i, j + 1));
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  // sectors share their edges: weld them so normals are smooth across the seams
  const welded = mergeVertices(geo, 1e-4);
  welded.computeVertexNormals();
  return welded;
}

function Tiles({
  map,
  selected,
  frontier,
  previews,
  overlays,
  onSelect,
}: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const surfaces = useSurfaces();
  const gl = useThree((s) => s.gl);
  // The DOM cursor rules can't see 3D objects, so switch the gauntlet here.
  gl.domElement.style.cursor = hover
    ? "url('/cursors/gauntlet-hover.svg') 3 2, pointer"
    : "";
  return (
    <group>
      {map.tiles.map((t) => {
        const k = hexKey(t);
        return (
          <TileMesh
            key={k}
            tile={t}
            hovered={hover === k}
            selected={!!selected && selected.q === t.q && selected.r === t.r}
            frontier={frontier.has(k)}
            preview={previews?.[k] ?? null}
            overlay={previews ? null : (overlays?.[k] ?? null)}
            dimmed={
              (!!previews && !previews[k]) ||
              (!!overlays && !previews && !overlays[k])
            }
            onHover={(on) => setHover(on ? k : (h) => (h === k ? null : h))}
            onSelect={onSelect}
            surfaces={surfaces}
          />
        );
      })}
    </group>
  );
}

/** Tile radius = the grid spacing (hexToWorld size 1): tiles touch, so the land reads as one surface. */
const HEX_R = 1;
const hexGeo = new THREE.CylinderGeometry(HEX_R, HEX_R, 1, 6);
// CylinderGeometry puts a corner on +z; a 6-segment ring needs thetaStart π/6 to line up
// after being laid flat. Outer edge sits exactly on the tile rim.
const ringGeo = new THREE.RingGeometry(
  HEX_R - 0.12,
  HEX_R + 0.01,
  6,
  1,
  Math.PI / 6,
);
/** Selection: a cool turquoise ring plus a faint matching glow on the tile. */
const SELECT_COLOR = "#46e0cf";
const SELECT_GLOW = "#0b2e2b";
/** Wild land is pulled toward a cold night blue. */
const WILD = new THREE.Color("#0b0d18");

interface TileProps {
  tile: Tile;
  hovered: boolean;
  selected: boolean;
  frontier: boolean;
  preview: TilePreview | null;
  overlay: TileOverlay | null;
  dimmed: boolean;
  onHover: (on: boolean) => void;
  onSelect: (h: Hex) => void;
  surfaces: Surfaces;
}

/** Flat hex for map-lens tints, matching the tile top. */
const overlayGeo = new THREE.CircleGeometry(HEX_R - 0.04, 6, Math.PI / 6);

const TileMesh = function TileMesh({
  tile,
  hovered,
  selected,
  frontier,
  preview,
  overlay,
  dimmed,
  onHover,
  onSelect,
  surfaces,
}: TileProps) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const pose = useMemo(() => planetPose(...hexToWorld(tile)), [tile.q, tile.r]);
  const h = TILE_H;

  /** Top tint multiplies the texture: white = full colour, darker = wild/dimmed. */
  const tint = useMemo(() => {
    const c = new THREE.Color("#ffffff");
    // Wild land sinks into cold night so your territory reads at a glance.
    if (!tile.owned) c.lerp(WILD, frontier ? 0.55 : 0.8);
    if (dimmed) c.lerp(SHADE, 0.35);
    return c;
  }, [tile.owned, frontier, dimmed]);
  const wall = useMemo(
    () =>
      new THREE.Color(TERRAIN_COLOR[tile.terrain])
        .multiplyScalar(0.42)
        .multiply(tint),
    [tile.terrain, tint],
  );
  const surf = SURFACE[tile.terrain];
  const tileSurface = useMemo(
    () =>
      surf
        ? surfaceFor(surfaces[surf.id], pose.position.x, pose.position.z)
        : null,
    [surfaces, surf, pose],
  );
  const topColor = useMemo(
    () => (surf ? new THREE.Color(surf.tint).multiply(tint) : tint),
    [surf, tint],
  );
  const tex = tileSurface?.map ?? terrainTexture(tile.terrain);
  // No tint on owned tops: territory reads from the gold rim and border (and wild land darkening).
  const emissive = selected ? SELECT_GLOW : hovered ? "#4a3420" : "#000000";
  const lake = tile.terrain === "lake";
  // Buildings (except the capital) stand on a corner pad and leave the terrain in place.
  const padded = !!tile.building && tile.building.id !== "capital";
  // A volcanic tile's top *is* the volcano model (it replaces the flat cap and relief).
  const volcano = tile.terrain === "volcanic" && !tile.camp && (!tile.building || padded);
  // Centred things (capital, camps) keep the middle low so they don't sink into the rock.
  const reliefAmp =
    surf?.relief && !volcano
      ? surf.relief * ((tile.building && !padded) || tile.camp ? 0.3 : 1)
      : 0;
  const relief = useMemo(
    () =>
      tileSurface && reliefAmp
        ? reliefGeometry(tileSurface, reliefAmp, padded)
        : null,
    [tileSurface, reliefAmp, padded],
  );
  useEffect(() => () => relief?.dispose(), [relief]);
  /** The cap stays for clicks and shadows but isn't drawn when something else is the top. */
  const capHidden = !!relief || volcano;
  const topProps = {
    map: tex,
    normalMap: tileSurface?.normal ?? null,
    normalScale: new THREE.Vector2(surf?.bump ?? 1.4, surf?.bump ?? 1.4),
    color: topColor,
    roughness: lake ? 0.15 : 0.9,
    metalness: lake ? 0.3 : 0,
    emissive,
  };

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const target = hovered ? 0.08 : 0;
    g.position.y += (target - g.position.y) * Math.min(1, dt * 14);
    if (ring.current) {
      const m = ring.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.65 + 0.3 * Math.sin(state.clock.elapsedTime * 4);
    }
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 6) return; // was a drag
    onSelect({ q: tile.q, r: tile.r });
  };

  const hoverName = tile.camp
    ? tile.camp.name
    : tile.site
      ? SITE_DEFS[tile.site].name
      : tile.building
      ? BUILDING_DEFS[tile.building.id].name
      : TERRAIN_DEFS[tile.terrain].label;

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
            e.stopPropagation();
            onHover(true);
          }}
          onPointerOut={() => onHover(false)}
        >
          {/* CylinderGeometry groups: 0 = walls, 1 = top, 2 = bottom */}
          <meshStandardMaterial
            attach="material-0"
            color={wall}
            roughness={1}
            flatShading
          />
          {/* with relief, the flat cap stays for clicks and shadows but isn't drawn */}
          <meshStandardMaterial
            attach="material-1"
            {...topProps}
            colorWrite={!capHidden}
            depthWrite={!capHidden}
          />
          <meshStandardMaterial attach="material-2" color={wall} />
        </mesh>
        <group position-y={h}>
          {relief && (
            <mesh geometry={relief} castShadow receiveShadow>
              <meshStandardMaterial {...topProps} />
            </mesh>
          )}
          {tile.building &&
            (padded ? (
              <group position={[PAD.x, 0, PAD.z]} scale={PAD_SCALE}>
                <BuildingMesh building={tile.building} terrain={tile.terrain} />
              </group>
            ) : (
              <BuildingMesh building={tile.building} terrain={tile.terrain} />
            ))}
          {tile.camp && <CampMesh strength={tile.camp.strength} />}
          {tile.site && <SiteMesh far={SITE_DEFS[tile.site].far} />}
          {volcano && (
            <VolcanoTop
              // With a building the pad must stay in its corner, so the volcano isn't turned.
              turn={padded ? 0 : (tile.q * 7 + tile.r * 13) % 6}
              padded={padded}
              color={topColor}
              emissive={emissive}
            />
          )}
          {selected && (
            <mesh
              ref={ring}
              geometry={ringGeo}
              rotation-x={-Math.PI / 2}
              position-y={0.015}
              renderOrder={6}
            >
              {/* Turquoise so the selection never blends into the gold territory rim and warm terrain. */}
              <meshBasicMaterial
                color={SELECT_COLOR}
                transparent
                opacity={0.95}
                side={THREE.DoubleSide}
                depthWrite={false}
                depthTest={false}
                toneMapped={false}
              />
            </mesh>
          )}
          {overlay && (
            // A lens tint drawn over everything on the tile (relief, models), like a Civ map lens.
            <mesh
              geometry={overlayGeo}
              rotation-x={-Math.PI / 2}
              position-y={0.05}
              renderOrder={5}
            >
              <meshBasicMaterial
                color={overlay.color}
                transparent
                opacity={overlay.faint ? 0.22 : 0.5}
                depthTest={false}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          )}
          {preview ? (
            <Html zIndexRange={[20, 0]}
              position={[0, 0.9, 0]}
              center
              distanceFactor={11}
              style={{ pointerEvents: "none" }}
            >
              <div className={`board-label ${preview.best ? "best" : ""}`}>
                {preview.text}
              </div>
            </Html>
          ) : overlay && overlay.text ? (
            <Html zIndexRange={[20, 0]}
              position={[0, 0.45, 0]}
              center
              distanceFactor={11}
              style={{ pointerEvents: "none" }}
            >
              <div
                className={`board-label lens ${overlay.faint ? "faint" : ""}`}
                style={{ borderColor: overlay.color }}
              >
                {overlay.text}
              </div>
            </Html>
          ) : (
            hovered && (
              <Html zIndexRange={[20, 0]}
                position={[0, 1.05, 0]}
                center
                distanceFactor={11}
                style={{ pointerEvents: "none" }}
              >
                <div className="board-label name">{hoverName}</div>
              </Html>
            )
          )}
        </group>
      </group>
    </group>
  );
};

// ── Volcano ───────────────────────────────────────────────────────────

/**
 * "Volcano V1" by JayT3D (CC-BY 4.0, see Credits), shrunk to ~4.8k triangles
 * with its photo baked into vertex colours. COLOR_0's alpha marks lava; the
 * patch below makes it glow.
 *
 * On a volcanic tile the model *is* the tile top: its own lava-cracked floor is
 * clamped to the hexagon and eased down to the rim, and the flat cap is hidden.
 */
// Bump ?v= whenever the file changes, or browsers keep the cached old model.
const VOLCANO_URL = "/models/volcano.glb?v=4";
/** Vertical exaggeration so it reads as a volcano from the board camera. */
const VOLCANO_LIFT = 0.9;

const ease = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Hex "radius" of a point: 1 on the tile's edge (corners on ±z, like hexGeo). */
const APOTHEM = (HEX_R * Math.sqrt(3)) / 2;
const EDGE_NORMALS = [0, 1, 2].map((k) => {
  const a = Math.PI / 6 + (k * Math.PI) / 3;
  return [Math.sin(a), Math.cos(a)] as const;
});
const hexRadius = (x: number, z: number) => Math.max(...EDGE_NORMALS.map(([nx, nz]) => Math.abs(nx * x + nz * z))) / APOTHEM;

/**
 * Turn a model into a tile top: clamp every vertex into the hexagon (so the
 * border is clean), ease heights down to the ground toward the rim so it meets
 * its neighbours, and fade lava glow (COLOR_0 alpha) near the edge.
 */
function fitToHex(g: THREE.BufferGeometry) {
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const col = g.getAttribute("color") as THREE.BufferAttribute | undefined;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let z = pos.getZ(i);
    const d = hexRadius(x, z);
    if (d > 1) {
      x /= d;
      z /= d;
    }
    const r = Math.min(d, 1);
    // sit a hair low so the owned rim and selection ring draw over the floor
    pos.setXYZ(i, x, pos.getY(i) * (1 - ease(0.75, 1, r)) - 0.01, z);
    if (col && col.itemSize === 4) col.setW(i, col.getW(i) * (1 - ease(0.6, 0.95, r)));
  }
  pos.needsUpdate = true;
  if (col) col.needsUpdate = true;
}

function useVolcanoGeometry() {
  const { scene } = useGLTF(VOLCANO_URL);
  return useMemo(() => {
    let geo: THREE.BufferGeometry | null = null;
    // Bake the node transforms in: Sketchfab rotates Z-up models with a parent
    // node, and quantization stores its dequantize scale/offset on the node too.
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (geo || !(o as THREE.Mesh).isMesh) return;
      const mesh = o as THREE.Mesh;
      const g = mesh.geometry.clone();
      // Quantized (int16) positions must become floats before transforming.
      const a = g.getAttribute("position");
      const f = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) f.set([a.getX(i), a.getY(i), a.getZ(i)], i * 3);
      g.setAttribute("position", new THREE.BufferAttribute(f, 3));
      g.applyMatrix4(mesh.matrixWorld);
      geo = g;
    });
    const g = geo! as THREE.BufferGeometry;
    // Centre it, floor at y = 0, and scale the square floor to just cover the hexagon.
    g.computeBoundingBox();
    const box = g.boundingBox!;
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = (2 * HEX_R * 1.02) / Math.min(size.x, size.z);
    g.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    g.scale(s, s * VOLCANO_LIFT, s);
    fitToHex(g);
    g.computeVertexNormals();
    // A second copy with the building pad flattened (and its lava cooled) in the corner.
    const p = g.clone();
    const pos = p.getAttribute("position") as THREE.BufferAttribute;
    const col = p.getAttribute("color") as THREE.BufferAttribute | undefined;
    for (let i = 0; i < pos.count; i++) {
      const k = padFlatten(pos.getX(i), pos.getZ(i));
      pos.setY(i, (pos.getY(i) + 0.01) * k - 0.01);
      if (col && col.itemSize === 4) col.setW(i, col.getW(i) * k);
    }
    p.computeVertexNormals();
    return { plain: g, padded: p };
  }, [scene]);
}
useGLTF.preload(VOLCANO_URL);

/** The volcano tile top, tinted like the tile it replaces (owned / wild / dimmed, hover glow). */
function VolcanoTop({ turn, padded, color, emissive }: { turn: number; padded: boolean; color: THREE.Color; emissive: string }) {
  const geos = useVolcanoGeometry();
  const geo = padded ? geos.padded : geos.plain;
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    m.onBeforeCompile = (shader) => {
      // vColor.a = lava: glow regardless of the night lighting.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor.rgb * vColor.a * 3.0 * diffuse;",
      );
    };
    return m;
  }, []);
  useEffect(() => () => material.dispose(), [material]);
  material.color.copy(color);
  material.emissive.set(emissive);
  return <mesh geometry={geo} material={material} rotation-y={(turn * Math.PI) / 3} castShadow receiveShadow />;
}

// ── Building models (Sketchfab, CC BY 4.0; see Credits) ───────────────

/** Bump ?v= when a file changes, or browsers keep the cached old model. */
const MINE_URL = "/models/mine.glb?v=1"; // "Low-poly Mine" by Sponk: merged, simplified, colours in COLOR_0
const OBELISK_URL = "/models/obelisk.glb?v=1"; // "Fancy Obelisk" by Oneironauticus: textures cut to 256px

/**
 * A downloaded model as a ready-to-place template: node transforms baked,
 * centred, base at y = 0, scaled so its footprint is `width` wide or it
 * stands `height` tall. Clone it per instance.
 */
function useFittedModel(url: string, fit: { width?: number; height?: number; sink?: number }, vertexColors = false) {
  const { scene } = useGLTF(url);
  return useMemo(() => {
    const root = scene.clone(true);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const s = fit.height ? fit.height / size.y : (fit.width ?? 1) / Math.max(size.x, size.z);
    const centre = box.getCenter(new THREE.Vector3());
    const holder = new THREE.Group();
    // `sink`: fraction of its height pushed into the ground, so rounded bases sit in the terrain.
    root.position.set(-centre.x, -box.min.y - (fit.sink ?? 0) * size.y, -centre.z);
    holder.add(root);
    holder.scale.setScalar(s);
    holder.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      // Low-poly models keep their colours in COLOR_0: show them, faceted.
      if (vertexColors) m.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    });
    return holder;
  }, [scene, fit.width, fit.height, fit.sink, vertexColors]);
}
useGLTF.preload(MINE_URL);
useGLTF.preload(OBELISK_URL);

/** Mine → Quarry → Excavator: one model, a little bigger per level (it brings its own ore and cart). */
function MineModel({ level }: { resource: keyof typeof RESOURCE_COLOR; level: number }) {
  const template = useFittedModel(MINE_URL, { width: 0.95, sink: 0.15 }, true);
  const model = useMemo(() => template.clone(true), [template]);
  return (
    <>
      {/* the template carries its fit scale, so level growth goes on a wrapper */}
      <group scale={0.85 + 0.15 * (level - 1)}>
        <primitive object={model} />
      </group>
    </>
  );
}

/** The academy obelisk, with a floating orb in its affinity's colour and a pip per level. */
function ObeliskAcademy({ color, level }: { color: string; level: number }) {
  const template = useFittedModel(OBELISK_URL, { height: 1.6 });
  const model = useMemo(() => template.clone(true), [template]);
  const orb = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (orb.current) orb.current.position.y = 1.78 + Math.sin(s.clock.elapsedTime * 2) * 0.04;
  });
  return (
    <>
      <primitive object={model} />
      <mesh ref={orb} position-y={1.78}>
        <icosahedronGeometry args={[0.09, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={level ? 0.6 + level * 0.35 : 0.15} flatShading />
      </mesh>
      {Array.from({ length: level }, (_, i) => (
        <mesh key={i} position={[Math.cos((i / 4) * Math.PI * 2) * 0.32, 0.06, Math.sin((i / 4) * Math.PI * 2) * 0.32]}>
          <boxGeometry args={[0.07, 0.07, 0.07]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
        </mesh>
      ))}
    </>
  );
}

// ── Buildings ─────────────────────────────────────────────────────────

function BuildingMesh({
  building,
  terrain,
}: {
  building: PlacedBuilding;
  terrain: TerrainId;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (g && g.scale.x < 1) g.scale.setScalar(Math.min(1, g.scale.x + dt * 4));
  });
  const def = BUILDING_DEFS[building.id];
  return (
    <group ref={ref} scale={0.01}>
      {def.kind === "capital" && <Capital />}
      {building.id === "mine" && (
        <MineModel
          resource={TERRAIN_DEFS[terrain].resource}
          level={building.level}
        />
      )}
      {building.id === "academy" && (
        <ObeliskAcademy
          color={
            building.affinity ? AFFINITY_COLOR[building.affinity] : PLAIN_COLOR
          }
          level={building.level}
        />
      )}
      {building.id === "church" && <Church />}
      {building.id === "crypt" && <Crypt />}
      {building.id === "fishery" && <Fishery />}
      {building.id === "farm" && <Farm />}
      {building.id === "market" && <Market />}
      {building.id === "trading-post" && <TradingPost />}
      {building.id === "barracks" && <Barracks />}
      {building.id === "walls" && <Walls />}
      {building.id === "armory" && <Armory />}
    </group>
  );
}

const Stone = ({ c = "#b8ad98" }: { c?: string }) => (
  <meshStandardMaterial color={c} flatShading roughness={0.9} />
);

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
        <meshStandardMaterial
          color="#e9b44c"
          metalness={0.5}
          roughness={0.4}
          flatShading
        />
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
  );
}

function House({
  x = 0,
  z = 0,
  s = 1,
  roof = "#8c3b2a",
}: {
  x?: number;
  z?: number;
  s?: number;
  roof?: string;
}) {
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
  );
}

const Timber = () => <meshStandardMaterial color="#5a4632" flatShading />;

function Fishery() {
  return (
    <>
      {/* a jetty on stilts with a little boat */}
      <mesh position={[0, 0.08, 0]} castShadow>
        <boxGeometry args={[0.7, 0.04, 0.2]} />
        <Timber />
      </mesh>
      {[-0.3, 0, 0.3].map((x) => (
        <mesh key={x} position={[x, 0.03, 0.08]}>
          <cylinderGeometry args={[0.02, 0.02, 0.1, 4]} />
          <Timber />
        </mesh>
      ))}
      <mesh position={[0.15, 0.04, 0.3]} rotation-y={0.3} castShadow>
        <boxGeometry args={[0.3, 0.06, 0.12]} />
        <meshStandardMaterial color="#8a6a46" flatShading />
      </mesh>
      <House x={-0.3} z={-0.25} s={0.7} roof="#3f6f8e" />
    </>
  );
}

function Church() {
  return (
    <>
      <mesh position={[0, 0.14, 0.08]} castShadow receiveShadow>
        <boxGeometry args={[0.32, 0.28, 0.5]} />
        <Stone c="#e6dcc6" />
      </mesh>
      <mesh
        position={[0, 0.34, 0.08]}
        rotation-x={Math.PI / 2}
        rotation-z={Math.PI / 2}
        castShadow
      >
        <cylinderGeometry args={[0.001, 0.22, 0.5, 3, 1]} />
        <meshStandardMaterial color="#7a4a2c" flatShading />
      </mesh>
      <mesh position={[0, 0.32, -0.26]} castShadow>
        <boxGeometry args={[0.18, 0.64, 0.18]} />
        <Stone c="#ece3cf" />
      </mesh>
      <mesh position={[0, 0.72, -0.26]} castShadow>
        <coneGeometry args={[0.14, 0.2, 4]} />
        <meshStandardMaterial color="#7a4a2c" flatShading />
      </mesh>
      <mesh position={[0, 0.9, -0.26]}>
        <boxGeometry args={[0.02, 0.14, 0.02]} />
        <meshStandardMaterial
          color="#f3e2a0"
          emissive="#f3e2a0"
          emissiveIntensity={0.8}
        />
      </mesh>
      <mesh position={[0, 0.92, -0.26]}>
        <boxGeometry args={[0.08, 0.02, 0.02]} />
        <meshStandardMaterial
          color="#f3e2a0"
          emissive="#f3e2a0"
          emissiveIntensity={0.8}
        />
      </mesh>
    </>
  );
}

function Crypt() {
  return (
    <>
      <mesh position-y={0.12} castShadow receiveShadow>
        <boxGeometry args={[0.46, 0.24, 0.4]} />
        <Stone c="#5d5866" />
      </mesh>
      <mesh position-y={0.3} castShadow>
        <boxGeometry args={[0.52, 0.08, 0.46]} />
        <Stone c="#4a4652" />
      </mesh>
      {/* a dark doorway with a faint violet glow */}
      <mesh position={[0, 0.1, 0.205]}>
        <boxGeometry args={[0.14, 0.18, 0.01]} />
        <meshStandardMaterial
          color="#1a1020"
          emissive="#7a5a9a"
          emissiveIntensity={0.6}
        />
      </mesh>
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} position={[x, 0.09, 0.32]} castShadow>
          <boxGeometry args={[0.08, 0.18, 0.04]} />
          <Stone c="#6e6878" />
        </mesh>
      ))}
    </>
  );
}

function Farm() {
  return (
    <>
      {[-0.3, -0.1, 0.1, 0.3].map((px, i) => (
        <mesh key={i} position={[px, 0.03, 0.12]} receiveShadow>
          <boxGeometry args={[0.16, 0.06, 0.6]} />
          <meshStandardMaterial
            color={i % 2 ? "#c9b356" : "#a7b04c"}
            flatShading
          />
        </mesh>
      ))}
      <House x={0.05} z={-0.42} s={0.9} roof="#9b4a2c" />
    </>
  );
}

function Market() {
  const awnings = ["#c94a3a", "#e9b44c", "#5e9be0"];
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
  );
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
  );
}

function Flag({
  x = 0,
  z = 0,
  color,
}: {
  x?: number;
  z?: number;
  color: string;
}) {
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
  );
}

function Barracks() {
  return (
    <>
      <mesh position-y={0.13} castShadow receiveShadow>
        <boxGeometry args={[0.7, 0.26, 0.32]} />
        <Stone c="#a89a82" />
      </mesh>
      <mesh position-y={0.32} rotation={[0, 0, 0]} castShadow>
        <cylinderGeometry
          args={[0.001, 0.22, 0.14, 4, 1, false, Math.PI / 4]}
        />
        <meshStandardMaterial color="#8c2e22" flatShading />
      </mesh>
      <Flag x={-0.25} z={0.25} color="#c94a3a" />
      <Flag x={0.25} z={0.25} color="#c94a3a" />
    </>
  );
}

function Walls() {
  return (
    <>
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 0.48, 0.12, Math.sin(a) * 0.48]}
            rotation-y={-a + Math.PI / 2}
            castShadow
          >
            <boxGeometry args={[0.5, 0.24, 0.1]} />
            <Stone c="#9b958b" />
          </mesh>
        );
      })}
      <mesh position-y={0.25} castShadow>
        <cylinderGeometry args={[0.13, 0.15, 0.5, 6]} />
        <Stone c="#aaa49a" />
      </mesh>
    </>
  );
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
  );
}

/** An event site: a glowing crystal turning above the tile (violet when far and risky). */
function SiteMesh({ far }: { far: boolean }) {
  const gem = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (!gem.current) return;
    gem.current.rotation.y = s.clock.elapsedTime * 0.8;
    gem.current.position.y = 0.55 + Math.sin(s.clock.elapsedTime * 2) * 0.06;
  });
  const color = far ? "#b58cff" : "#e8d9a8";
  return (
    <mesh ref={gem} position-y={0.55} castShadow>
      <octahedronGeometry args={[0.18]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} flatShading />
    </mesh>
  );
}

function CampMesh({ strength }: { strength: number }) {
  const flag = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (flag.current)
      flag.current.rotation.y = Math.sin(s.clock.elapsedTime * 3) * 0.3;
  });
  return (
    <group>
      {Array.from({ length: strength }, (_, i) => {
        const a = (i / strength) * Math.PI * 2 + 0.6;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 0.3, 0.18, Math.sin(a) * 0.3]}
            castShadow
          >
            <coneGeometry args={[0.2, 0.36, 4]} />
            <meshStandardMaterial color="#3b2b2b" flatShading />
          </mesh>
        );
      })}
      <mesh position-y={0.4}>
        <cylinderGeometry args={[0.015, 0.015, 0.8, 4]} />
        <meshStandardMaterial color="#1a1310" />
      </mesh>
      <mesh ref={flag} position={[0.1, 0.72, 0]}>
        <boxGeometry args={[0.22, 0.14, 0.01]} />
        <meshStandardMaterial
          color="#c43c3c"
          emissive="#7a1010"
          emissiveIntensity={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
      <pointLight
        position={[0, 0.3, 0]}
        color="#ff5a2a"
        intensity={0.6}
        distance={1.6}
      />
    </group>
  );
}

// ── Territory border ──────────────────────────────────────────────────

function Border({ map }: { map: WorldMap }) {
  const segments = useMemo(() => {
    const owned = new Set(map.tiles.filter((t) => t.owned).map(hexKey));
    const pts: [number, number, number][] = [];
    const v = new THREE.Vector3();
    for (const t of map.tiles) {
      if (!t.owned) continue;
      const [cx, cz] = hexToWorld(t);
      const pose = planetPose(cx, cz);
      const y = TILE_H + 0.03;
      for (const n of neighbors(t)) {
        if (owned.has(hexKey(n))) continue;
        const [nx, nz] = hexToWorld(n);
        // In tile-local space: the shared edge sits at the hex apothem, perpendicular to the neighbour direction.
        const len = Math.hypot(nx - cx, nz - cz);
        const dx = (nx - cx) / len;
        const dz = (nz - cz) / len;
        const apothem = HEX_R * (Math.sqrt(3) / 2);
        const half = HEX_R / 2;
        for (const sign of [1, -1]) {
          v.set(
            dx * apothem - dz * half * sign,
            y,
            dz * apothem + dx * half * sign,
          );
          v.applyQuaternion(pose.quaternion).add(pose.position);
          pts.push([v.x, v.y, v.z]);
        }
      }
    }
    return pts;
  }, [map]);
  if (!segments.length) return null;
  return (
    <>
      {/* soft halo under a bright core */}
      <Line
        points={segments}
        segments
        color="#ff9a3c"
        lineWidth={9}
        transparent
        opacity={0.28}
        depthWrite={false}
        toneMapped={false}
      />
      <Line
        points={segments}
        segments
        color="#ffd08a"
        lineWidth={3.5}
        toneMapped={false}
      />
    </>
  );
}
