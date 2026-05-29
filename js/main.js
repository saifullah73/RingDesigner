import { createScene } from './scene.js';
import { buildRing, ringConfig, setGrid } from './ring.js';
import { applyDisplacement } from './terrain.js';
import { initPicker } from './picker.js';
import { initMap } from './mapbox.js';
import { loadModel } from './loaders.js';
import { exportSTL } from './exporter.js';

// ── State ────────────────────────────────────────────────────────────────────
let currentHeightmap = null;
let heightPct        = 30;
let currentRing      = null;
let usingDefault     = true;

// ── Scene ────────────────────────────────────────────────────────────────────
const { setMesh } = createScene(document.getElementById('viewport'));

function rebuildRing() {
  currentRing = buildRing();
  setMesh(currentRing);
  if (currentHeightmap) applyDisplacement(heightPct, currentHeightmap);
}
rebuildRing();

// ── Step wizard ──────────────────────────────────────────────────────────────
const STEPS = ['style', 'location', 'terrain', 'shoulder', 'band'];
const TITLES = ['Style', 'Location', 'Terrain', 'Shoulder', 'Band'];
let step = 0;

function goTo(n) {
  n = Math.max(0, Math.min(STEPS.length - 1, n));
  step = n;
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('step-' + STEPS[n]).classList.add('active');
  document.getElementById('step-title').textContent = TITLES[n];
  document.getElementById('step-count').textContent = (n + 1) + '/' + STEPS.length;

  document.querySelectorAll('.progress-step').forEach((el, i) => {
    el.classList.toggle('done',   i < n);
    el.classList.toggle('active', i === n);
  });
  document.querySelectorAll('.progress-line').forEach((el, i) => {
    el.classList.toggle('done', i < n);
  });

  document.getElementById('btn-next-bottom').textContent =
    n === STEPS.length - 1 ? 'Finish' : 'Next →';
}

document.getElementById('btn-prev').addEventListener('click', () => goTo(step - 1));
document.getElementById('btn-next').addEventListener('click', () => goTo(step + 1));
document.getElementById('btn-next-bottom').addEventListener('click', () => {
  if (step === STEPS.length - 1) exportSTL(currentRing, 'ring-terrain.stl');
  else goTo(step + 1);
});
document.querySelectorAll('.progress-step').forEach(el =>
  el.addEventListener('click', () => goTo(parseInt(el.dataset.step)))
);

// ── Style step: Default vs Upload ────────────────────────────────────────────
document.getElementById('card-default').addEventListener('click', () => {
  usingDefault = true;
  document.getElementById('card-default').classList.add('active');
  document.getElementById('card-upload-model').classList.remove('active');
  document.getElementById('model-status').textContent = '';
  rebuildRing();
});

document.getElementById('input-model').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const status = document.getElementById('model-status');
  status.textContent = 'Loading…';
  document.getElementById('card-upload-model').classList.add('active');
  document.getElementById('card-default').classList.remove('active');
  try {
    const { group } = await loadModel(file, 15);
    setMesh(group);
    currentRing = group;
    usingDefault = false;
    status.textContent = file.name + ' loaded';
    if (currentHeightmap) applyDisplacement(heightPct, currentHeightmap);
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
    document.getElementById('card-default').classList.add('active');
    document.getElementById('card-upload-model').classList.remove('active');
  }
});

// ── Location: source tabs ────────────────────────────────────────────────────
document.querySelectorAll('.source-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.source-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('source-' + tab.dataset.source).classList.add('active');
  });
});

// ── Heightmap picker ─────────────────────────────────────────────────────────
initPicker(map => {
  currentHeightmap = map;
  applyDisplacement(heightPct, currentHeightmap);
});

// ── Live map ─────────────────────────────────────────────────────────────────
initMap(map => {
  currentHeightmap = map;
  applyDisplacement(heightPct, currentHeightmap);
});

// ── Terrain: height slider ───────────────────────────────────────────────────
document.getElementById('slider-height').addEventListener('input', e => {
  heightPct = parseInt(e.target.value);
  document.getElementById('terrain-val-display').textContent = heightPct + '%';
  document.getElementById('exag-label').textContent =
    (0.5 + heightPct / 50).toFixed(1) + '× exaggeration';
  if (currentHeightmap) applyDisplacement(heightPct, currentHeightmap);
});

// ── Terrain: detail level (actually changes grid resolution) ─────────────────
const DETAIL_GRIDS = { low: 32, medium: 64, high: 96 };

document.querySelectorAll('.detail-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.detail-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    if (usingDefault) {
      setGrid(DETAIL_GRIDS[card.dataset.detail] ?? 64);
      rebuildRing(); // rebuilds geometry at new resolution
    }
  });
});

// ── Shoulder cards ───────────────────────────────────────────────────────────
document.querySelectorAll('[data-shoulder]').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('[data-shoulder]').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    ringConfig.shoulder = card.dataset.shoulder;
    if (usingDefault) rebuildRing();
  });
});

// ── Band cards ───────────────────────────────────────────────────────────────
document.querySelectorAll('[data-band]').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('[data-band]').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    ringConfig.band = card.dataset.band;
    if (usingDefault) rebuildRing();
  });
});

// ── Export ───────────────────────────────────────────────────────────────────
document.getElementById('btn-share').addEventListener('click', () => {
  if (currentRing) exportSTL(currentRing, 'ring-terrain.stl');
});

goTo(0);
