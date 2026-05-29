import { createScene } from './scene.js';
import { buildRing, ringConfig, bezelGeometry, bezelBaseY } from './ring.js';
import { applyDisplacement } from './terrain.js';
import { initPicker } from './picker.js';
import { initMap } from './mapbox.js';
import { exportSTL } from './exporter.js';

// ---- State ----
let currentHeightmap = null;
let heightPct = 30;
let currentRing = null;

// ---- Scene ----
const { setMesh } = createScene(document.getElementById('viewport'));

function rebuildRing() {
  currentRing = buildRing();
  setMesh(currentRing);
  if (currentHeightmap) applyDisplacement(heightPct, currentHeightmap);
}
rebuildRing();

// ---- Step wizard ----
const STEPS = ['style', 'location', 'terrain', 'shoulder', 'band'];
const STEP_TITLES = ['Style', 'Location', 'Terrain', 'Shoulder', 'Band'];
let currentStep = 0;

function goToStep(n) {
  n = Math.max(0, Math.min(STEPS.length - 1, n));
  currentStep = n;

  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('step-' + STEPS[n]).classList.add('active');

  document.getElementById('step-title').textContent = STEP_TITLES[n];
  document.getElementById('step-count').textContent = (n + 1) + '/' + STEPS.length;

  // Update progress bar
  document.querySelectorAll('.progress-step').forEach((el, i) => {
    el.classList.toggle('done', i < n);
    el.classList.toggle('active', i === n);
  });
  document.querySelectorAll('.progress-line').forEach((el, i) => {
    el.classList.toggle('done', i < n);
  });

  const nextBtn = document.getElementById('btn-next-bottom');
  nextBtn.textContent = n === STEPS.length - 1 ? 'Finish' : 'Next →';
}

document.getElementById('btn-prev').addEventListener('click', () => goToStep(currentStep - 1));
document.getElementById('btn-next').addEventListener('click', () => goToStep(currentStep + 1));
document.getElementById('btn-next-bottom').addEventListener('click', () => {
  if (currentStep === STEPS.length - 1) exportSTL(currentRing, 'ring-terrain.stl');
  else goToStep(currentStep + 1);
});
document.querySelectorAll('.progress-step').forEach(el => {
  el.addEventListener('click', () => goToStep(parseInt(el.dataset.step)));
});

// ---- Style cards ----
document.querySelectorAll('[data-style]').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('[data-style]').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    ringConfig.style = card.dataset.style;
    rebuildRing();
  });
});

// ---- Shoulder cards ----
document.querySelectorAll('[data-shoulder]').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('[data-shoulder]').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    ringConfig.shoulder = card.dataset.shoulder;
    rebuildRing();
  });
});

// ---- Band cards ----
document.querySelectorAll('[data-band]').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('[data-band]').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    ringConfig.band = card.dataset.band;
    rebuildRing();
  });
});

// ---- Location: source tabs ----
document.querySelectorAll('.source-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.source-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('source-' + tab.dataset.source).classList.add('active');
  });
});

// ---- Heightmap picker ----
initPicker(map => {
  currentHeightmap = map;
  applyDisplacement(heightPct, currentHeightmap);
});

// ---- Live map ----
initMap(map => {
  currentHeightmap = map;
  applyDisplacement(heightPct, currentHeightmap);
});

// ---- Terrain slider ----
const sliderH = document.getElementById('slider-height');
sliderH.addEventListener('input', () => {
  heightPct = parseInt(sliderH.value);
  document.getElementById('terrain-val-display').textContent = heightPct + '%';
  document.getElementById('exag-label').textContent =
    (0.5 + heightPct / 50).toFixed(1) + '× exaggeration';
  if (currentHeightmap) applyDisplacement(heightPct, currentHeightmap);
});

// ---- Detail cards (visual only — grid resolution stays 64 for performance) ----
document.querySelectorAll('.detail-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.detail-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
  });
});

// ---- Export ----
document.getElementById('btn-share').addEventListener('click', () => {
  if (currentRing) exportSTL(currentRing, 'ring-terrain.stl');
});

// Init at step 0
goToStep(0);
