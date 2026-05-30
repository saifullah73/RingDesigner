import * as THREE from 'three';
import * as Ring from './ring.js';

// ── Custom displacement target (uploaded models) ─────────────────────────────
// null = use default ring bezel
let customTarget = null;

const CUSTOM_MAX_DISPLACE = 0.35;

// Number of vertices over which displacement ramps from 0 (at the painted
// region's boundary) up to full, so the patch stays welded to the rest of the
// model instead of lifting off as a floating cap.
const FEATHER_RINGS = 3;

// Pristine, undisplaced positions for a mesh, captured once and reused. This
// prevents re-snapshotting already-displaced geometry (which would compound the
// displacement every frame while painting).
function getBasePositions(mesh) {
  if (!mesh.userData.basePositions) {
    mesh.userData.basePositions = Float32Array.from(mesh.geometry.attributes.position.array);
  }
  return mesh.userData.basePositions;
}

export function setCustomTarget(mesh, weights) {
  if (!mesh) { customTarget = null; return; }

  const geo     = mesh.geometry;
  const basePos = getBasePositions(mesh);
  const n       = basePos.length / 3;

  // Detection and "up" are defined in world space, so project UVs and displace
  // in world space too — the model is usually rotated, so local axes don't
  // align with up. Map the painted region onto the world X-Z plane for UVs.
  mesh.updateWorldMatrix(true, false);
  const mat = mesh.matrixWorld;
  const v   = new THREE.Vector3();

  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    if (weights && weights[i] <= 0) continue;
    v.set(basePos[i*3], basePos[i*3+1], basePos[i*3+2]).applyMatrix4(mat);
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  }
  if (!isFinite(minX)) { minX = 0; maxX = 1; minZ = 0; maxZ = 1; }
  const rX = maxX - minX || 1;
  const rZ = maxZ - minZ || 1;

  const uvs = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    v.set(basePos[i*3], basePos[i*3+1], basePos[i*3+2]).applyMatrix4(mat);
    uvs[i*2]     = (v.x - minX) / rX;
    uvs[i*2 + 1] = (v.z - minZ) / rZ;
  }

  const feather = computeBoundaryFeather(geo, basePos, weights, FEATHER_RINGS);

  customTarget = { geo, mesh, basePos, weights, uvs, feather };
}

// Ramp displacement to 0 at the boundary of the painted region so the patch
// rises out of a fixed rim (like the default bezel's clamped edges) instead of
// floating off. Coincident vertices are welded by position first, so the hard
// seam between the top face and the side walls is treated as a single boundary
// rather than two free-floating copies.
function computeBoundaryFeather(geo, basePos, weights, rings) {
  const n = basePos.length / 3;

  // Weld coincident vertices into position groups.
  const keyToGroup = new Map();
  const group = new Int32Array(n);
  const P = 1e4;
  for (let i = 0; i < n; i++) {
    const key = Math.round(basePos[i*3]   * P) + '_' +
                Math.round(basePos[i*3+1] * P) + '_' +
                Math.round(basePos[i*3+2] * P);
    let g = keyToGroup.get(key);
    if (g === undefined) { g = keyToGroup.size; keyToGroup.set(key, g); }
    group[i] = g;
  }
  const gCount = keyToGroup.size;

  // Adjacency between groups, from triangles (indexed or sequential triples).
  const idx    = geo.index ? geo.index.array : null;
  const triLen = idx ? idx.length : n;
  const adj    = Array.from({ length: gCount }, () => new Set());
  for (let t = 0; t < triLen; t += 3) {
    const a = group[idx ? idx[t]   : t];
    const b = group[idx ? idx[t+1] : t+1];
    const c = group[idx ? idx[t+2] : t+2];
    adj[a].add(b); adj[b].add(a);
    adj[b].add(c); adj[c].add(b);
    adj[c].add(a); adj[a].add(c);
  }

  // A group is "selected" if any of its vertices is painted.
  const selected = new Uint8Array(gCount);
  for (let i = 0; i < n; i++) {
    if (!weights || weights[i] > 0) selected[group[i]] = 1;
  }

  // Seed BFS at boundary groups: selected groups touching an unselected one.
  const dist = new Int32Array(gCount).fill(-1);
  let queue  = [];
  for (let g = 0; g < gCount; g++) {
    if (!selected[g]) continue;
    for (const nb of adj[g]) {
      if (!selected[nb]) { dist[g] = 0; queue.push(g); break; }
    }
  }

  // BFS inward up to `rings` steps.
  for (let d = 0; d < rings && queue.length; d++) {
    const next = [];
    for (const g of queue) {
      for (const nb of adj[g]) {
        if (selected[nb] && dist[nb] === -1) { dist[nb] = d + 1; next.push(nb); }
      }
    }
    queue = next;
  }

  // Per-vertex feather: 0 at the boundary, ramping to 1 over `rings` vertices.
  // Interior groups (never reached) stay at full displacement.
  const feather = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = dist[group[i]];
    feather[i] = d === -1 ? 1 : Math.min(1, d / rings);
  }
  return feather;
}

export function clearCustomTarget() { customTarget = null; }

// ── Main entry point ─────────────────────────────────────────────────────────
export function applyDisplacement(heightPct, heightmap) {
  if (customTarget) _applyCustom(heightPct, heightmap);
  else              _applyDefault(heightPct, heightmap);
}

// ── Default ring bezel ───────────────────────────────────────────────────────
function _applyDefault(heightPct, heightmap) {
  const geo   = Ring.bezelGeometry;
  const baseY = Ring.bezelBaseY;
  if (!geo || !baseY || !heightmap) return;

  const GRID      = Ring.GRID;
  const stride    = GRID + 1;
  const scale     = (heightPct / 100) * Ring.BEZEL_MAX_DISPLACE;
  const pos       = geo.attributes.position.array;
  const srcStride = Math.round(Math.sqrt(heightmap.length));

  for (let i = 0; i < baseY.length; i++) {
    const row  = Math.floor(i / stride);
    const col  = i % stride;
    const edge = row === 0 || row === GRID || col === 0 || col === GRID;
    const h    = edge ? 0 : sampleBilinear(heightmap, srcStride, col / GRID, row / GRID);
    pos[i*3+1] = baseY[i] + h * scale;
  }

  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
}

// ── Uploaded model with weight map ───────────────────────────────────────────
function _applyCustom(heightPct, heightmap) {
  const { geo, mesh, basePos, weights, uvs, feather } = customTarget;
  if (!geo || !heightmap) return;

  const pos       = geo.attributes.position.array;
  const scale     = (heightPct / 100) * CUSTOM_MAX_DISPLACE;
  const srcStride = Math.round(Math.sqrt(heightmap.length));
  const n         = pos.length / 3;

  // Displace along world-up, then convert back to local space to write into the
  // geometry, so terrain rises "up" regardless of how the model is rotated.
  mesh.updateWorldMatrix(true, false);
  const mat = mesh.matrixWorld;
  const inv = new THREE.Matrix4().copy(mat).invert();
  const wv  = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    const w = weights ? weights[i] : 1;
    if (w > 0) {
      const h = sampleBilinear(heightmap, srcStride, uvs[i*2], uvs[i*2+1]);
      wv.set(basePos[i*3], basePos[i*3+1], basePos[i*3+2]).applyMatrix4(mat);
      wv.y += h * scale * w * feather[i];
      wv.applyMatrix4(inv);
      pos[i*3]   = wv.x;
      pos[i*3+1] = wv.y;
      pos[i*3+2] = wv.z;
    } else {
      // Reset untouched vertices to base
      pos[i*3]   = basePos[i*3];
      pos[i*3+1] = basePos[i*3+1];
      pos[i*3+2] = basePos[i*3+2];
    }
  }

  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
}

// ── Bilinear heightmap sampler ────────────────────────────────────────────────
function sampleBilinear(map, stride, u, v) {
  const x  = Math.max(0, Math.min(1, u)) * (stride - 1);
  const y  = Math.max(0, Math.min(1, v)) * (stride - 1);
  const x0 = Math.floor(x), x1 = Math.min(x0 + 1, stride - 1);
  const y0 = Math.floor(y), y1 = Math.min(y0 + 1, stride - 1);
  const fx = x - x0, fy = y - y0;
  return map[y0*stride+x0] * (1-fx)*(1-fy)
       + map[y0*stride+x1] *    fx *(1-fy)
       + map[y1*stride+x0] * (1-fx)*   fy
       + map[y1*stride+x1] *    fx *   fy;
}

// ── Image / elevation converters (used by picker.js and mapbox.js) ────────────
export function heightmapFromImage(img, cropRect, gridSize) {
  const off = document.createElement('canvas');
  off.width  = gridSize + 1;
  off.height = gridSize + 1;
  const ctx  = off.getContext('2d');
  ctx.drawImage(img, cropRect.x, cropRect.y, cropRect.w, cropRect.h,
                0, 0, gridSize + 1, gridSize + 1);
  const data = ctx.getImageData(0, 0, gridSize + 1, gridSize + 1).data;
  const map  = new Float32Array((gridSize + 1) ** 2);
  for (let i = 0; i < map.length; i++) {
    map[i] = 0.299 * data[i*4] / 255
           + 0.587 * data[i*4+1] / 255
           + 0.114 * data[i*4+2] / 255;
  }
  return map;
}

export function heightmapFromElevations(elevations, gridSize) {
  const n   = (gridSize + 1) ** 2;
  const map = new Float32Array(n);
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < elevations.length; i++) {
    if (elevations[i] < mn) mn = elevations[i];
    if (elevations[i] > mx) mx = elevations[i];
  }
  const range = mx - mn || 1;
  for (let i = 0; i < n; i++) map[i] = ((elevations[i] ?? mn) - mn) / range;
  return map;
}
