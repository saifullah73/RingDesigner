import * as THREE from 'three';

// Mutable config — changed by UI cards
export const ringConfig = {
  style: 'square',      // square | rectangle | oval
  shoulder: 'straight', // straight | classic | curved
  band: 'flat',         // flat | classic | dshaped
};

// Grid resolution — changed by detail level
export let GRID = 64;
export function setGrid(n) { GRID = n; }

// Live references updated on every buildRing()
export let bezelGeometry = null;
export let bezelBaseY    = null;
export const BEZEL_MAX_DISPLACE = 0.45;

// ── Dimensions ──────────────────────────────────────────────────────────────
const INNER_R      = 0.80;   // finger-hole radius
const OUTER_R      = 1.00;   // outer band radius (at neutral profile)
const BAND_H       = 0.65;   // band height
const BEZEL_WALL_H = 0.22;   // raised wall height above band top

function bezelDims() {
  if (ringConfig.style === 'rectangle') return { hw: 0.72, hd: 0.50 };
  if (ringConfig.style === 'oval')      return { hw: 0.65, hd: 0.55 };
  return { hw: 0.60, hd: 0.60 }; // square
}

// ── Public entry point ───────────────────────────────────────────────────────
export function buildRing() {
  const group = new THREE.Group();

  // Shared silver material — DoubleSide so every face renders
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xf0eeee,
    metalness: 1.0,
    roughness: 0.07,
    reflectivity: 1.0,
    side: THREE.DoubleSide,
  });

  group.add(new THREE.Mesh(makeBand(),       mat));
  group.add(new THREE.Mesh(makeShoulder(),   mat));
  group.add(new THREE.Mesh(makeBezelWalls(), mat));

  const topGeo = makeBezelTop();
  bezelGeometry = topGeo;
  const pos = topGeo.attributes.position.array;
  bezelBaseY = new Float32Array((GRID + 1) * (GRID + 1));
  for (let i = 0; i < bezelBaseY.length; i++) bezelBaseY[i] = pos[i * 3 + 1];

  group.add(new THREE.Mesh(topGeo, mat));

  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // Orient: ring hole along Z (appears "upright" — face toward camera)
  group.rotation.x = Math.PI / 2;

  return group;
}

// ── Band ────────────────────────────────────────────────────────────────────
// LatheGeometry profile: outer-top → outer-bottom → inner-bottom → inner-top
// This produces: outer wall + bottom cap + inner wall, NO top cap (intentional).
function makeBand() {
  const segs = 24;
  const pts  = [];

  // Outer surface: top → bottom (shoulder profile applied here)
  for (let i = 0; i <= segs; i++) {
    const t = 1 - i / segs;          // t=1 at top, 0 at bottom
    const y = -BAND_H / 2 + (1 - t) * BAND_H;
    pts.push(new THREE.Vector2(outerR(t), y));
  }

  // Bottom cap: outer → inner (horizontal strip)
  const capSteps = 5;
  for (let i = 1; i <= capSteps; i++) {
    const r = OUTER_R - (i / capSteps) * (OUTER_R - INNER_R);
    pts.push(new THREE.Vector2(r, -BAND_H / 2));
  }

  // Inner surface: bottom → top (band profile)
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = -BAND_H / 2 + t * BAND_H;
    pts.push(new THREE.Vector2(innerR(t), y));
  }

  return new THREE.LatheGeometry(pts, 64);
}

function outerR(t) {
  // t=1 at top, 0 at bottom; shoulder style modifies the upper portion
  const base = OUTER_R - 0.025 * Math.sin(t * Math.PI); // slight waist
  if (ringConfig.shoulder === 'classic') return base - 0.05 * t * (1 - t);
  if (ringConfig.shoulder === 'curved')  return base - 0.10 * Math.pow(t * (1 - t), 0.45);
  return base;
}

function innerR(t) {
  if (ringConfig.band === 'classic') return INNER_R + 0.025 * Math.sin(t * Math.PI);
  if (ringConfig.band === 'dshaped') return INNER_R + 0.055 * Math.sin(t * Math.PI);
  return INNER_R; // flat
}

// ── Shoulder ────────────────────────────────────────────────────────────────
// Flat mesh at y=BAND_H/2 bridging outer band circle → bezel rectangle/ellipse
function makeShoulder() {
  const { hw, hd } = bezelDims();
  const y   = BAND_H / 2;
  const N   = 128;
  const verts = [], norms = [];

  for (let i = 0; i < N; i++) {
    const θ0 = (i / N) * Math.PI * 2;
    const θ1 = ((i + 1) / N) * Math.PI * 2;

    const b0 = [OUTER_R * Math.cos(θ0), y, OUTER_R * Math.sin(θ0)];
    const b1 = [OUTER_R * Math.cos(θ1), y, OUTER_R * Math.sin(θ1)];
    const r0 = bezPt(θ0, hw, hd, y);
    const r1 = bezPt(θ1, hw, hd, y);

    verts.push(...b0, ...b1, ...r0,  ...r0, ...b1, ...r1);
    for (let k = 0; k < 6; k++) norms.push(0, 1, 0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(norms,  3));
  return geo;
}

// Intersection of ray at angle θ with bezel perimeter (rectangle or ellipse)
function bezPt(θ, hw, hd, y) {
  const cx = Math.cos(θ), cz = Math.sin(θ);
  if (ringConfig.style === 'oval') {
    // Ellipse: (x/hw)²+(z/hd)²=1  →  t = 1/√((cx/hw)²+(cz/hd)²)
    const t = 1 / Math.sqrt((cx / hw) ** 2 + (cz / hd) ** 2);
    return [cx * t, y, cz * t];
  }
  // Rectangle
  const tx = Math.abs(cx) > 1e-9 ? hw / Math.abs(cx) : Infinity;
  const tz = Math.abs(cz) > 1e-9 ? hd / Math.abs(cz) : Infinity;
  const t  = Math.min(tx, tz);
  return [cx * t, y, cz * t];
}

// ── Bezel walls ──────────────────────────────────────────────────────────────
function makeBezelWalls() {
  const { hw, hd } = bezelDims();
  const botY = BAND_H / 2;
  const topY = botY + BEZEL_WALL_H;
  const verts = [], norms = [];

  function quad(p0, p1, p2, p3, nx, ny, nz) {
    verts.push(...p0, ...p1, ...p2,  ...p2, ...p1, ...p3);
    for (let i = 0; i < 6; i++) norms.push(nx, ny, nz);
  }

  if (ringConfig.style === 'oval') {
    const segs = 64;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const x0 = hw * Math.cos(a0), z0 = hd * Math.sin(a0);
      const x1 = hw * Math.cos(a1), z1 = hd * Math.sin(a1);
      const mid = (a0 + a1) / 2;
      quad([x0, botY, z0], [x1, botY, z1], [x0, topY, z0], [x1, topY, z1],
           Math.cos(mid), 0, Math.sin(mid));
    }
  } else {
    quad([-hw, botY,  hd], [ hw, botY,  hd], [-hw, topY,  hd], [ hw, topY,  hd],  0, 0,  1);
    quad([ hw, botY, -hd], [-hw, botY, -hd], [ hw, topY, -hd], [-hw, topY, -hd],  0, 0, -1);
    quad([ hw, botY,  hd], [ hw, botY, -hd], [ hw, topY,  hd], [ hw, topY, -hd],  1, 0,  0);
    quad([-hw, botY, -hd], [-hw, botY,  hd], [-hw, topY, -hd], [-hw, topY,  hd], -1, 0,  0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(norms,  3));
  return geo;
}

// ── Bezel top (displaceable grid) ────────────────────────────────────────────
function makeBezelTop() {
  const { hw, hd } = bezelDims();
  const baseY  = BAND_H / 2 + BEZEL_WALL_H;
  const stride = GRID + 1;
  const vCount = stride * stride;

  const positions = new Float32Array(vCount * 3);
  const normals   = new Float32Array(vCount * 3);
  const uvs       = new Float32Array(vCount * 2);
  const indices   = [];

  for (let row = 0; row <= GRID; row++) {
    for (let col = 0; col <= GRID; col++) {
      const u = col / GRID, v = row / GRID;
      const idx = row * stride + col;
      positions[idx * 3]     = (u - 0.5) * hw * 2;
      positions[idx * 3 + 1] = baseY;
      positions[idx * 3 + 2] = (v - 0.5) * hd * 2;
      normals[idx * 3 + 1]   = 1;
      uvs[idx * 2]     = u;
      uvs[idx * 2 + 1] = v;
    }
  }

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const a = row * stride + col;
      indices.push(a, a + stride, a + 1,  a + 1, a + stride, a + stride + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal',   new THREE.BufferAttribute(normals,   3));
  geo.setAttribute('uv',       new THREE.BufferAttribute(uvs,       2));
  geo.setIndex(indices);
  return geo;
}
