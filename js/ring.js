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
// Frame: finger-hole axis = Z (toward camera), up = +Y. The engraving face
// sits flat on TOP of the band so terrain displacement (local +Y) is correct.
const INNER_R = 0.62;   // finger-hole radius
const BAND_OR = 0.82;   // band outer radius (at the top, under the bezel)
const BAND_HW = 0.50;   // band half-width along the finger (Z)
const BEZEL_H = 0.20;   // face height above the band's top
const FACE_Y  = BAND_OR + BEZEL_H; // y of the flat engraving face

// Half-extents of the bezel face: hw along X (across finger), hd along Z (finger)
function bezelDims() {
  if (ringConfig.style === 'rectangle') return { hw: 0.62, hd: 0.40 };
  if (ringConfig.style === 'oval')      return { hw: 0.55, hd: 0.46 };
  return { hw: 0.50, hd: 0.50 }; // square
}

// Height of the band's outer (top) surface directly above horizontal offset x.
// The bezel walls seat on this curve so they grow seamlessly out of the band.
const bandTopY = x => Math.sqrt(Math.max(0, BAND_OR * BAND_OR - x * x));

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
  group.add(new THREE.Mesh(makeBezelWalls(), mat));

  const topGeo = makeBezelTop();
  bezelGeometry = topGeo;
  const pos = topGeo.attributes.position.array;
  bezelBaseY = new Float32Array((GRID + 1) * (GRID + 1));
  for (let i = 0; i < bezelBaseY.length; i++) bezelBaseY[i] = pos[i * 3 + 1];

  group.add(new THREE.Mesh(topGeo, mat));

  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  return group;
}

// ── Band ──────────────────────────────────────────────────────────────────────
// Tube around the Z axis: outer + inner cylindrical surfaces and two end caps.
function makeBand() {
  const N = 120, M = 10;            // angular / width subdivisions
  const P = [], I = [];
  const v = (x, y, z) => { P.push(x, y, z); return P.length / 3 - 1; };

  const outer = [], inner = [];
  for (let j = 0; j <= M; j++) {
    const z = -BAND_HW + (j / M) * 2 * BAND_HW;
    const ro = [], ri = [];
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * Math.PI * 2;
      const oR = outerR(th), iR = innerR(z);
      ro.push(v(oR * Math.cos(th), oR * Math.sin(th), z));
      ri.push(v(iR * Math.cos(th), iR * Math.sin(th), z));
    }
    outer.push(ro); inner.push(ri);
  }

  for (let j = 0; j < M; j++) {
    for (let i = 0; i < N; i++) {
      // Outer surface (normals out), inner surface (normals in, reversed winding)
      I.push(outer[j][i], outer[j+1][i], outer[j][i+1],
             outer[j][i+1], outer[j+1][i], outer[j+1][i+1]);
      I.push(inner[j][i], inner[j][i+1], inner[j+1][i],
             inner[j][i+1], inner[j+1][i+1], inner[j+1][i]);
    }
  }

  // End caps (annulus between inner and outer) at z = ±BAND_HW
  for (const j of [0, M]) {
    for (let i = 0; i < N; i++) {
      const o0 = outer[j][i], o1 = outer[j][i+1];
      const n0 = inner[j][i], n1 = inner[j][i+1];
      if (j === 0) I.push(o0, o1, n0,  n0, o1, n1);
      else         I.push(o0, n0, o1,  o1, n0, n1);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

// Outer radius by angle — shoulder style tapers the band toward the palm (−Y)
function outerR(th) {
  const f = (1 - Math.sin(th)) / 2; // 0 at top (+Y), 1 at bottom (−Y)
  if (ringConfig.shoulder === 'classic') return BAND_OR - 0.04 * f;
  if (ringConfig.shoulder === 'curved')  return BAND_OR - 0.08 * f;
  return BAND_OR;
}

// Inner radius by width — band style adds a comfort-fit bulge toward the centre
function innerR(z) {
  const t = 1 - (z / BAND_HW) ** 2; // 1 at centre, 0 at the edges
  if (ringConfig.band === 'classic') return INNER_R + 0.025 * t;
  if (ringConfig.band === 'dshaped') return INNER_R + 0.05  * t;
  return INNER_R; // flat
}

// ── Bezel walls ────────────────────────────────────────────────────────────────
// Vertical skirt from the flat face perimeter (y=FACE_Y) down onto the band's
// curved top surface (y=bandTopY(x)), so the bezel rises out of the band.
function makeBezelWalls() {
  const { hw, hd } = bezelDims();
  const P = [], I = [];
  const v = (x, y, z) => { P.push(x, y, z); return P.length / 3 - 1; };

  function strip(pts) {
    const top = [], bot = [];
    for (const [x, z] of pts) {
      top.push(v(x, FACE_Y, z));
      bot.push(v(x, bandTopY(x), z));
    }
    for (let i = 0; i < pts.length - 1; i++) {
      I.push(bot[i], bot[i+1], top[i],  top[i], bot[i+1], top[i+1]);
    }
  }

  if (ringConfig.style === 'oval') {
    const segs = 80, pts = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push([hw * Math.cos(a), hd * Math.sin(a)]);
    }
    strip(pts);
  } else {
    const S = 24;
    const edge = fn => { const e = []; for (let i = 0; i <= S; i++) e.push(fn(i / S)); strip(e); };
    edge(t => [-hw + t * 2 * hw,  hd]);  // +Z
    edge(t => [ hw - t * 2 * hw, -hd]);  // −Z
    edge(t => [ hw, hd - t * 2 * hd]);   // +X
    edge(t => [-hw, -hd + t * 2 * hd]);  // −X
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

// ── Bezel top (displaceable engraving face) ─────────────────────────────────────
function makeBezelTop() {
  const { hw, hd } = bezelDims();
  const oval   = ringConfig.style === 'oval';
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

      let x, z;
      if (oval) {
        // Map the unit square onto the ellipse; the border lands exactly on the
        // ellipse, matching the oval walls (no overhang at the corners).
        const a = u * 2 - 1, b = v * 2 - 1;
        x = a * Math.sqrt(1 - b * b / 2) * hw;
        z = b * Math.sqrt(1 - a * a / 2) * hd;
      } else {
        x = (u - 0.5) * 2 * hw;
        z = (v - 0.5) * 2 * hd;
      }

      positions[idx * 3]     = x;
      positions[idx * 3 + 1] = FACE_Y;
      positions[idx * 3 + 2] = z;
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
