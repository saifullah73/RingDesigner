import * as Ring from './ring.js';

export function applyDisplacement(heightPct, heightmap) {
  const geo   = Ring.bezelGeometry;
  const baseY = Ring.bezelBaseY;
  if (!geo || !baseY || !heightmap) return;

  const GRID   = Ring.GRID;
  const stride = GRID + 1;
  const scale  = (heightPct / 100) * Ring.BEZEL_MAX_DISPLACE;
  const pos    = geo.attributes.position.array;

  // Source heightmap may have been created at a different resolution.
  // Derive its stride from its length (it is always square: (n+1)^2).
  const srcStride = Math.round(Math.sqrt(heightmap.length));

  for (let i = 0; i < baseY.length; i++) {
    const row  = Math.floor(i / stride);
    const col  = i % stride;
    const edge = row === 0 || row === GRID || col === 0 || col === GRID;
    // Sample heightmap by UV with bilinear interpolation
    const h = edge ? 0 : sampleBilinear(heightmap, srcStride, col / GRID, row / GRID);
    pos[i * 3 + 1] = baseY[i] + h * scale;
  }

  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
}

function sampleBilinear(map, stride, u, v) {
  const x  = u * (stride - 1);
  const y  = v * (stride - 1);
  const x0 = Math.floor(x), x1 = Math.min(x0 + 1, stride - 1);
  const y0 = Math.floor(y), y1 = Math.min(y0 + 1, stride - 1);
  const fx = x - x0, fy = y - y0;
  return map[y0 * stride + x0] * (1 - fx) * (1 - fy)
       + map[y0 * stride + x1] *      fx  * (1 - fy)
       + map[y1 * stride + x0] * (1 - fx) *      fy
       + map[y1 * stride + x1] *      fx  *      fy;
}

export function heightmapFromImage(img, cropRect, gridSize) {
  const off = document.createElement('canvas');
  off.width  = gridSize + 1;
  off.height = gridSize + 1;
  const ctx  = off.getContext('2d');
  ctx.drawImage(img, cropRect.x, cropRect.y, cropRect.w, cropRect.h,
                0, 0, gridSize + 1, gridSize + 1);
  const data = ctx.getImageData(0, 0, gridSize + 1, gridSize + 1).data;
  const map  = new Float32Array((gridSize + 1) * (gridSize + 1));
  for (let i = 0; i < map.length; i++) {
    map[i] = 0.299 * data[i * 4] / 255
           + 0.587 * data[i * 4 + 1] / 255
           + 0.114 * data[i * 4 + 2] / 255;
  }
  return map;
}

export function heightmapFromElevations(elevations, gridSize) {
  const n   = (gridSize + 1) * (gridSize + 1);
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
