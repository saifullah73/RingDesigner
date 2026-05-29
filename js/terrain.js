import * as Ring from './ring.js';

const GRID = 64;

export function applyDisplacement(heightPct, heightmap) {
  const geo = Ring.bezelGeometry;
  const baseY = Ring.bezelBaseY;
  if (!geo || !baseY || !heightmap) return;

  const positions = geo.attributes.position.array;
  const scale = (heightPct / 100) * Ring.BEZEL_MAX_DISPLACE;
  const stride = GRID + 1;
  const count = baseY.length;

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / stride);
    const col = i % stride;
    const isEdge = row === 0 || row === GRID || col === 0 || col === GRID;
    const h = isEdge ? 0 : (heightmap[i] ?? 0);
    positions[i * 3 + 1] = baseY[i] + h * scale;
  }

  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
}

export function heightmapFromImage(img, cropRect, gridSize) {
  const off = document.createElement('canvas');
  off.width = gridSize + 1;
  off.height = gridSize + 1;
  const ctx = off.getContext('2d');
  ctx.drawImage(img, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, gridSize + 1, gridSize + 1);
  const data = ctx.getImageData(0, 0, gridSize + 1, gridSize + 1).data;
  const map = new Float32Array((gridSize + 1) * (gridSize + 1));
  for (let i = 0; i < map.length; i++) {
    map[i] = 0.299 * data[i * 4] / 255 + 0.587 * data[i * 4 + 1] / 255 + 0.114 * data[i * 4 + 2] / 255;
  }
  return map;
}

export function heightmapFromElevations(elevations, gridSize) {
  const n = (gridSize + 1) * (gridSize + 1);
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
