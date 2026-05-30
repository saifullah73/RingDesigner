// Mapbox live map integration — pan/zoom triggers real-time elevation decode
import { heightmapFromElevations } from './terrain.js';

const GRID = 64;
// Crop box matches the bezel face aspect ratio (W:D = 1.0 : 0.75)
const BEZEL_ASPECT = 1.0 / 0.75;

// Persist decoded elevation tiles across captures so panning back over an
// already-visited area is instant (no re-fetch).
const tileCache = new Map();

// Pixel size of the centered crop box within a w×h map container.
function cropBoxSize(w, h) {
  const frac = 0.7;
  const cw = w * frac, ch = h * frac;
  return cw / ch > BEZEL_ASPECT
    ? { bw: ch * BEZEL_ASPECT, bh: ch }
    : { bw: cw, bh: cw / BEZEL_ASPECT };
}

function updateCropBox(map) {
  const c = map.getCanvas();
  const { bw, bh } = cropBoxSize(c.clientWidth, c.clientHeight);
  const box = document.getElementById('map-selection-box');
  box.style.width  = bw + 'px';
  box.style.height = bh + 'px';
  box.style.display = 'block';
}

export function initMap(onHeightmapReady) {
  const tokenInput = document.getElementById('input-mapbox-token');
  const btnLoad = document.getElementById('btn-load-map');
  const mapWrap = document.getElementById('map-wrap');
  const tokenWrap = document.getElementById('mapbox-token-wrap');

  const saved = localStorage.getItem('mapbox_token');
  if (saved) tokenInput.value = saved;

  btnLoad.addEventListener('click', () => {
    const token = tokenInput.value.trim();
    if (!token) return;
    localStorage.setItem('mapbox_token', token);
    mapWrap.classList.remove('hidden');
    tokenWrap.style.marginBottom = '8px';
    document.getElementById('map-hint').style.display = '';
    initMapboxGL(token, onHeightmapReady);
  });
}

function initMapboxGL(token, onHeightmapReady) {
  if (window._mapboxInstance) {
    window._mapboxInstance.remove();
    window._mapboxInstance = null;
  }

  mapboxgl.accessToken = token;
  const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/light-v11',
    center: [-105.5, 39.7],
    zoom: 10,
    attributionControl: false,
  });
  window._mapboxInstance = map;
  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

  // Live capture: update the ring on every move frame, throttled to one render
  // at a time so captures never pile up. Cached tiles make this near real-time.
  let capturing = false, pending = false, rafId = null;
  async function runCapture() {
    if (capturing) { pending = true; return; }
    capturing = true;
    try { await captureElevation(map, token, onHeightmapReady); }
    finally {
      capturing = false;
      if (pending) { pending = false; runCapture(); }
    }
  }
  function scheduleCapture() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = null; runCapture(); });
  }

  map.on('move', scheduleCapture);
  map.on('moveend', scheduleCapture);
  map.on('zoomend', scheduleCapture);
  // Trigger on initial load too
  map.on('load', () => { addTerrainStyling(map); updateCropBox(map); scheduleCapture(); });
  map.on('resize', () => updateCropBox(map));
}

// Soft hillshade relief + blue water, matching the reference terrain look.
function addTerrainStyling(map) {
  if (!map.getSource('dem')) {
    map.addSource('dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1' });
  }

  // Insert the hillshade beneath the first label layer so place names stay on top.
  let firstSymbol;
  for (const l of map.getStyle().layers) {
    if (l.type === 'symbol') { firstSymbol = l.id; break; }
  }
  if (!map.getLayer('hillshade')) {
    map.addLayer({
      id: 'hillshade',
      type: 'hillshade',
      source: 'dem',
      paint: {
        'hillshade-exaggeration': 0.5,
        'hillshade-shadow-color': '#4f4f4f',
        'hillshade-highlight-color': '#ffffff',
        'hillshade-accent-color': '#d0d0d0',
      },
    }, firstSymbol);
  }

  // Flat blue water and rivers like the reference
  if (map.getLayer('water'))    map.setPaintProperty('water', 'fill-color', '#5e87c0');
  if (map.getLayer('waterway')) map.setPaintProperty('waterway', 'line-color', '#5e87c0');
}

async function captureElevation(map, token, onHeightmapReady) {
  const tileZ = Math.min(Math.round(map.getZoom()), 14);

  // Sample only the centered crop box (north-up map), not the whole view
  const c = map.getCanvas();
  const w = c.clientWidth, h = c.clientHeight;
  const { bw, bh } = cropBoxSize(w, h);
  const tl = map.unproject([w / 2 - bw / 2, h / 2 - bh / 2]);
  const br = map.unproject([w / 2 + bw / 2, h / 2 + bh / 2]);

  const west = tl.lng;
  const east = br.lng;
  const north = tl.lat;
  const south = br.lat;

  const tileSize = 256;

  async function getTileData(x, y, z) {
    const key = `${z}/${x}/${y}`;
    if (tileCache.has(key)) return tileCache.get(key);
    const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}.pngraw?access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) { tileCache.set(key, null); return null; }
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const tc = document.createElement('canvas');
    tc.width = tileSize; tc.height = tileSize;
    const tctx = tc.getContext('2d');
    tctx.drawImage(bmp, 0, 0);
    const data = tctx.getImageData(0, 0, tileSize, tileSize).data;
    tileCache.set(key, data);
    return data;
  }

  function lngLatToTilePixel(lng, lat, z) {
    const n = Math.pow(2, z);
    const tx = Math.floor(((lng + 180) / 360) * n);
    const latRad = lat * Math.PI / 180;
    const ty = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    const px = Math.min(Math.floor(((lng + 180) / 360 * n - tx) * tileSize), tileSize - 1);
    const py = Math.min(Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n - ty) * tileSize), tileSize - 1);
    return { tileX: tx, tileY: ty, px, py };
  }

  // Build sample grid
  const sampleJobs = [];
  for (let row = 0; row <= GRID; row++) {
    for (let col = 0; col <= GRID; col++) {
      const lng = west + (col / GRID) * (east - west);
      const lat = north - (row / GRID) * (north - south);
      sampleJobs.push({ idx: row * (GRID + 1) + col, lng, lat });
    }
  }

  // Pre-fetch all unique tiles in parallel
  const tileKeys = new Set(sampleJobs.map(({ lng, lat }) => {
    const { tileX, tileY } = lngLatToTilePixel(lng, lat, tileZ);
    return `${tileZ}/${tileX}/${tileY}`;
  }));
  await Promise.all([...tileKeys].map(key => {
    const [z, x, y] = key.split('/').map(Number);
    return getTileData(x, y, z);
  }));

  // Sample elevations
  const elevations = new Float32Array((GRID + 1) * (GRID + 1));
  for (const { idx, lng, lat } of sampleJobs) {
    const { tileX, tileY, px, py } = lngLatToTilePixel(lng, lat, tileZ);
    const data = tileCache.get(`${tileZ}/${tileX}/${tileY}`);
    if (data) {
      const pi = (py * tileSize + px) * 4;
      elevations[idx] = -10000 + (data[pi] * 65536 + data[pi + 1] * 256 + data[pi + 2]) * 0.1;
    }
  }

  onHeightmapReady(heightmapFromElevations(elevations, GRID));
}
