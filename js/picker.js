// Heightmap image picker: pan/zoom canvas with crop-region overlay
import { heightmapFromImage } from './terrain.js';

const GRID = 64;
// Bezel aspect ratio W:D = 1.0 : 0.75
const BEZEL_ASPECT = 1.0 / 0.75;

export function initPicker(onHeightmapReady) {
  const canvas = document.getElementById('terrain-picker');
  const overlay = document.getElementById('picker-overlay');
  const wrap = document.getElementById('terrain-picker-wrap');
  const ctx = canvas.getContext('2d');

  let img = null;
  let pan = { x: 0, y: 0 };
  let zoom = 1;
  let dragging = false;
  let dragStart = { x: 0, y: 0 };
  let panStart = { x: 0, y: 0 };

  document.getElementById('input-terrain').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('upload-label').textContent = file.name;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      img = image;
      zoom = Math.min(canvas.width / img.width, canvas.height / img.height);
      pan.x = (canvas.width - img.width * zoom) / 2;
      pan.y = (canvas.height - img.height * zoom) / 2;
      wrap.classList.remove('hidden');
      draw();
      emitHeightmap();
    };
    image.src = url;
  });

  function resize() {
    canvas.width = wrap.clientWidth;
    canvas.height = wrap.clientHeight;
  }

  function getCropOverlaySize() {
    // Overlay is a fixed fraction of the canvas, maintaining bezel aspect ratio
    const maxFrac = 0.65;
    const cw = canvas.width * maxFrac;
    const ch = canvas.height * maxFrac;
    let ow, oh;
    if (cw / ch > BEZEL_ASPECT) {
      oh = ch;
      ow = oh * BEZEL_ASPECT;
    } else {
      ow = cw;
      oh = ow / BEZEL_ASPECT;
    }
    return { ow, oh };
  }

  function updateOverlay() {
    const { ow, oh } = getCropOverlaySize();
    overlay.style.width = ow + 'px';
    overlay.style.height = oh + 'px';
  }

  function draw() {
    if (!img) return;
    resize();
    updateOverlay();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, pan.x, pan.y, img.width * zoom, img.height * zoom);
  }

  function getCropRect() {
    if (!img) return null;
    const { ow, oh } = getCropOverlaySize();
    // Center of canvas
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    // Overlay top-left in canvas space
    const ox = cx - ow / 2;
    const oy = cy - oh / 2;
    // Convert to image space
    const ix = (ox - pan.x) / zoom;
    const iy = (oy - pan.y) / zoom;
    const iw = ow / zoom;
    const ih = oh / zoom;
    return { x: ix, y: iy, w: iw, h: ih };
  }

  function emitHeightmap() {
    if (!img) return;
    const crop = getCropRect();
    if (!crop) return;
    const map = heightmapFromImage(img, crop, GRID);
    onHeightmapReady(map);
  }

  // Mouse events
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    const mx = e.offsetX, my = e.offsetY;
    pan.x = mx - (mx - pan.x) * factor;
    pan.y = my - (my - pan.y) * factor;
    zoom *= factor;
    draw();
    emitHeightmap();
  }, { passive: false });

  canvas.addEventListener('mousedown', e => {
    dragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    panStart = { x: pan.x, y: pan.y };
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    pan.x = panStart.x + (e.clientX - dragStart.x);
    pan.y = panStart.y + (e.clientY - dragStart.y);
    draw();
  });
  window.addEventListener('mouseup', () => {
    if (dragging) { dragging = false; emitHeightmap(); }
  });

  // Touch
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      dragging = true;
      dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panStart = { x: pan.x, y: pan.y };
    }
  });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && dragging) {
      pan.x = panStart.x + (e.touches[0].clientX - dragStart.x);
      pan.y = panStart.y + (e.touches[0].clientY - dragStart.y);
      draw();
    }
  }, { passive: false });
  canvas.addEventListener('touchend', () => { dragging = false; emitHeightmap(); });

  window.addEventListener('resize', () => { draw(); emitHeightmap(); });
}
