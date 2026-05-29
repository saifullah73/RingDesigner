// Mapbox live map integration — pan/zoom triggers real-time elevation decode
import { heightmapFromElevations } from './terrain.js';

const GRID = 64;

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
    style: 'mapbox://styles/mapbox/satellite-v9',
    center: [-105.5, 39.7],
    zoom: 10,
    attributionControl: false,
  });
  window._mapboxInstance = map;
  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

  // Debounce: capture 600ms after the map settles
  let debounceTimer = null;
  function scheduleCapture() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => captureElevation(map, token, onHeightmapReady), 600);
  }

  map.on('moveend', scheduleCapture);
  map.on('zoomend', scheduleCapture);
  // Trigger on initial load too
  map.on('load', scheduleCapture);
}

async function captureElevation(map, token, onHeightmapReady) {
  const bounds = map.getBounds();
  const tileZ = Math.min(Math.round(map.getZoom()), 14);

  const west = bounds.getWest();
  const east = bounds.getEast();
  const north = bounds.getNorth();
  const south = bounds.getSouth();

  const tileSize = 256;
  const tileCache = new Map();

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
