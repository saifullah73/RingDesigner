import * as THREE from 'three';

const GRID = 64;

// Mutable ring config
export const ringConfig = {
  style: 'square',    // square | rectangle | oval
  shoulder: 'straight', // straight | classic | curved
  band: 'flat',       // flat | classic | dshaped
};

// Shared references updated on rebuild
export let bezelGeometry = null;
export let bezelBaseY = null;
export const BEZEL_MAX_DISPLACE = 0.5;

export function buildRing() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xc8a96e, metalness: 0.92, roughness: 0.18 });

  group.add(new THREE.Mesh(buildBand(), mat));
  group.add(new THREE.Mesh(buildBezelWalls(), mat));

  const topGeo = buildBezelTop();
  bezelGeometry = topGeo;
  bezelBaseY = Float32Array.from(
    topGeo.attributes.position.array.filter((_, i) => i % 3 === 1)
  );
  group.add(new THREE.Mesh(topGeo, mat));

  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return group;
}

// Bezel size based on style
function bezelDims() {
  if (ringConfig.style === 'rectangle') return { w: 1.2, d: 0.7 };
  if (ringConfig.style === 'oval')      return { w: 1.1, d: 0.8 };
  return { w: 1.0, d: 1.0 }; // square
}

const INNER_R = 0.85;
const OUTER_R = 1.0;
const BAND_H  = 0.6;
const BEZEL_WALL_H = 0.18;

function buildBand() {
  const latSegs = 64;
  const profSegs = 20;
  const points = [];

  for (let i = 0; i <= profSegs; i++) {
    const t = i / profSegs;
    const y = -BAND_H / 2 + t * BAND_H;
    const r = outerRadiusAtT(t);
    points.push(new THREE.Vector2(r, y));
  }
  // inner wall
  points.push(new THREE.Vector2(INNER_R, BAND_H / 2));
  for (let i = profSegs; i >= 0; i--) {
    const t = i / profSegs;
    const y = -BAND_H / 2 + t * BAND_H;
    points.push(new THREE.Vector2(innerRadiusAtT(t), y));
  }

  return new THREE.LatheGeometry(points, latSegs);
}

function outerRadiusAtT(t) {
  // shoulder affects the outer profile
  const base = OUTER_R - 0.03 * Math.sin(t * Math.PI);
  if (ringConfig.shoulder === 'classic') return base - 0.04 * Math.sin(t * Math.PI) * (1 - t);
  if (ringConfig.shoulder === 'curved')  return base - 0.08 * Math.pow(Math.sin(t * Math.PI), 0.6);
  return base;
}

function innerRadiusAtT(t) {
  if (ringConfig.band === 'flat')     return INNER_R;
  if (ringConfig.band === 'classic')  return INNER_R + 0.015 * Math.sin(t * Math.PI);
  if (ringConfig.band === 'dshaped')  return INNER_R + 0.03 * Math.sin(t * Math.PI);
  return INNER_R;
}

function buildBezelWalls() {
  const { w, d } = bezelDims();
  const topY = BAND_H / 2 + BEZEL_WALL_H;
  const botY = BAND_H / 2;
  const hw = w / 2, hd = d / 2;
  const verts = [], normals = [];

  function quad(p0, p1, p2, p3, nx, ny, nz) {
    verts.push(...p0, ...p1, ...p2, ...p2, ...p1, ...p3);
    for (let i = 0; i < 6; i++) normals.push(nx, ny, nz);
  }

  if (ringConfig.style === 'oval') {
    // Elliptical walls using segments
    const segs = 48;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const x0 = hw * Math.cos(a0), z0 = hd * Math.sin(a0);
      const x1 = hw * Math.cos(a1), z1 = hd * Math.sin(a1);
      const nx = Math.cos((a0 + a1) / 2), nz = Math.sin((a0 + a1) / 2);
      quad([x0, botY, z0], [x1, botY, z1], [x0, topY, z0], [x1, topY, z1], nx, 0, nz);
    }
    // bottom cap
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      verts.push(0, botY, 0, hw * Math.cos(a0), botY, hd * Math.sin(a0), hw * Math.cos(a1), botY, hd * Math.sin(a1));
      normals.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
    }
  } else {
    quad([-hw, botY, hd], [hw, botY, hd], [-hw, topY, hd], [hw, topY, hd], 0, 0, 1);
    quad([hw, botY, -hd], [-hw, botY, -hd], [hw, topY, -hd], [-hw, topY, -hd], 0, 0, -1);
    quad([hw, botY, hd], [hw, botY, -hd], [hw, topY, hd], [hw, topY, -hd], 1, 0, 0);
    quad([-hw, botY, -hd], [-hw, botY, hd], [-hw, topY, -hd], [-hw, topY, hd], -1, 0, 0);
    quad([-hw, botY, -hd], [hw, botY, -hd], [-hw, botY, hd], [hw, botY, hd], 0, -1, 0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geo;
}

function buildBezelTop() {
  const { w, d } = bezelDims();
  const baseY = BAND_H / 2 + BEZEL_WALL_H;
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
      if (ringConfig.style === 'oval') {
        // Elliptical top: map UV to ellipse, remap from [-1,1] to bezel dims
        const pu = (u - 0.5) * 2, pv = (v - 0.5) * 2;
        positions[idx * 3]     = pu * w / 2;
        positions[idx * 3 + 1] = baseY;
        positions[idx * 3 + 2] = pv * d / 2;
      } else {
        positions[idx * 3]     = (u - 0.5) * w;
        positions[idx * 3 + 1] = baseY;
        positions[idx * 3 + 2] = (v - 0.5) * d;
      }
      normals[idx * 3 + 1] = 1;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = v;
    }
  }
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const a = row * stride + col;
      indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal',   new THREE.BufferAttribute(normals,   3));
  geo.setAttribute('uv',       new THREE.BufferAttribute(uvs,       2));
  geo.setIndex(indices);
  return geo;
}
