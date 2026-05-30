import { createScene }                          from './scene.js';
import { buildRing, ringConfig, setGrid }        from './ring.js';
import { applyDisplacement,
         setCustomTarget, clearCustomTarget }    from './terrain.js';
import { initPicker }                            from './picker.js';
import { initMap }                               from './mapbox.js';
import { loadModel, getLargestMesh,
         autoDetectTopFace }                     from './loaders.js';
import { exportGLB, exportSTL }                  from './exporter.js';
import { Painter }                               from './painter.js';

// ── Scene ────────────────────────────────────────────────────────────────────
const { setMesh, camera, scene, controls, canvas } =
  createScene(document.getElementById('viewport'));

// ── State ────────────────────────────────────────────────────────────────────
let currentHeightmap = null;
let heightPct        = 30;
let currentRing      = null;
let usingDefault     = true;
let uploadedGroup    = null;   // the currently loaded custom model group
let painter          = new Painter(camera, scene, canvas);
let paintModeActive  = false;

// ── Default ring ─────────────────────────────────────────────────────────────
function rebuildRing() {
  currentRing = buildRing();
  setMesh(currentRing);
  if (currentHeightmap) applyDisplacement(heightPct, currentHeightmap);
}
rebuildRing();

// ── Step wizard ──────────────────────────────────────────────────────────────
const STEPS  = ['style', 'zone', 'location', 'terrain'];
const TITLES = ['Style', 'Zone', 'Location', 'Terrain'];
let step = 0;

function goTo(n) {
  n = Math.max(0, Math.min(STEPS.length - 1, n));

  // Leaving the zone step: stop painting and hide the detection/paint overlay
  if (STEPS[step] === 'zone' && STEPS[n] !== 'zone') {
    if (paintModeActive) _exitPaintMode();
    painter.hideOverlay();
  }

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
document.getElementById('btn-next-bottom').addEventListener('click', e => {
  if (step === STEPS.length - 1) { e.stopPropagation(); openExportMenu(); }
  else goTo(step + 1);
});
document.querySelectorAll('.progress-step').forEach(el =>
  el.addEventListener('click', () => goTo(parseInt(el.dataset.step)))
);

// ── Style step ───────────────────────────────────────────────────────────────
document.getElementById('card-default').addEventListener('click', () => {
  _switchToDefault();
});

document.getElementById('input-model').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const status = document.getElementById('model-status');
  status.textContent = 'Loading…';
  document.getElementById('card-upload-model').classList.add('active');
  document.getElementById('card-default').classList.remove('active');
  try {
    const group = await loadModel(file);
    uploadedGroup = group;
    setMesh(group);
    currentRing   = group;
    usingDefault  = false;
    clearCustomTarget();
    status.textContent = file.name + ' loaded';
    // Set up painter on the largest mesh
    const mesh = getLargestMesh(group);
    if (mesh) painter.setMesh(mesh);
    // Show custom zone UI
    document.getElementById('zone-default-msg').classList.add('hidden');
    document.getElementById('zone-custom').classList.remove('hidden');
    // Reset zone status
    _resetOrientSliders();
    document.getElementById('zone-detect-status').textContent = '—';
    document.getElementById('zone-paint-status').textContent  = '0 vertices painted';
    if (currentHeightmap) applyDisplacement(heightPct, currentHeightmap);
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
    _switchToDefault();
  }
});

function _switchToDefault() {
  _exitPaintMode();
  painter.setMesh(null);
  uploadedGroup = null;
  usingDefault  = true;
  clearCustomTarget();
  document.getElementById('card-default').classList.add('active');
  document.getElementById('card-upload-model').classList.remove('active');
  document.getElementById('model-status').textContent = '';
  document.getElementById('zone-default-msg').classList.remove('hidden');
  document.getElementById('zone-custom').classList.add('hidden');
  rebuildRing();
}

// ── Zone step: tabs ──────────────────────────────────────────────────────────
document.querySelectorAll('.zone-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.zone !== 'paint' && paintModeActive) _exitPaintMode();
    document.querySelectorAll('.zone-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.zone-panel').forEach(p => {
      p.classList.remove('active'); p.classList.add('hidden');
    });
    tab.classList.add('active');
    const panel = document.getElementById('zone-' + tab.dataset.zone + '-panel');
    panel.classList.remove('hidden');
    panel.classList.add('active');
  });
});

// ── Zone: orientation sliders ────────────────────────────────────────────────
['x', 'y', 'z'].forEach(axis => {
  document.getElementById('slider-rot-' + axis).addEventListener('input', () => {
    const deg = parseInt(document.getElementById('slider-rot-' + axis).value);
    document.getElementById('val-rot-' + axis).textContent = deg + '°';
    if (uploadedGroup) uploadedGroup.rotation[axis] = deg * Math.PI / 180;
  });
});

document.getElementById('btn-reset-orient').addEventListener('click', () => {
  ['x', 'y', 'z'].forEach(axis => {
    document.getElementById('slider-rot-' + axis).value = 0;
    document.getElementById('val-rot-' + axis).textContent = '0°';
    if (uploadedGroup) uploadedGroup.rotation[axis] = 0;
  });
});

function _resetOrientSliders() {
  ['x', 'y', 'z'].forEach(axis => {
    document.getElementById('slider-rot-' + axis).value = 0;
    document.getElementById('val-rot-' + axis).textContent = '0°';
  });
}

// ── Zone: auto detect ────────────────────────────────────────────────────────
const sliderThresh = document.getElementById('slider-zone-threshold');
sliderThresh.addEventListener('input', () => {
  document.getElementById('val-zone-threshold').textContent = sliderThresh.value + '%';
});

document.getElementById('btn-detect').addEventListener('click', () => {
  if (!uploadedGroup) return;
  const mesh = getLargestMesh(uploadedGroup);
  if (!mesh) return;
  const threshold = parseInt(sliderThresh.value);
  const weights   = autoDetectTopFace(mesh, threshold);
  const count     = weights.filter(w => w > 0).length;
  document.getElementById('zone-detect-status').textContent =
    count > 0 ? count.toLocaleString() + ' vertices detected' : 'Nothing detected — try raising the threshold';
  // Sync into painter for visual feedback and keep weights consistent
  painter.setMesh(mesh);
  painter.setWeights(weights);
  setCustomTarget(mesh, weights);
  if (currentHeightmap) applyDisplacement(heightPct, currentHeightmap);
});

// ── Zone: paint mode ─────────────────────────────────────────────────────────
const btnPaintToggle = document.getElementById('btn-paint-toggle');
const brushSlider    = document.getElementById('slider-brush');

brushSlider.addEventListener('input', () => {
  const v = parseInt(brushSlider.value);
  document.getElementById('val-brush').textContent = v;
  painter.brushRadius = v / 100 * 0.8 + 0.04; // map 2-60 → ~0.05-0.52
});

btnPaintToggle.addEventListener('click', () => {
  if (paintModeActive) _exitPaintMode();
  else                 _enterPaintMode();
});

document.getElementById('btn-paint-clear').addEventListener('click', () => {
  painter.clear();
  document.getElementById('zone-paint-status').textContent = '0 vertices painted';
  if (painter.mesh) {
    // Rebuild target with the now-zeroed weights so the mesh resets to its base
    setCustomTarget(painter.mesh, painter.weights);
    if (currentHeightmap) applyDisplacement(heightPct, currentHeightmap);
  } else {
    clearCustomTarget();
    if (currentHeightmap) applyDisplacement(heightPct, currentHeightmap);
  }
});

function _enterPaintMode() {
  if (!uploadedGroup) return;
  const mesh = getLargestMesh(uploadedGroup);
  if (!mesh) return;
  if (painter.mesh !== mesh) painter.setMesh(mesh);
  paintModeActive = true;
  painter.enable(controls);
  painter.showOverlay();
  btnPaintToggle.textContent = 'Stop Painting';
  btnPaintToggle.classList.add('painting');
  // Poll painted count + apply displacement while painting
  _paintLoop();
}

function _exitPaintMode() {
  if (!paintModeActive) return;
  paintModeActive = false;
  painter.disable();
  painter.hideOverlay();
  btnPaintToggle.textContent = 'Enable Paint';
  btnPaintToggle.classList.remove('painting');
  // Commit current weights as custom target
  const mesh = painter.mesh;
  if (mesh && painter.weights) {
    const count = painter.paintedCount();
    document.getElementById('zone-paint-status').textContent =
      count.toLocaleString() + ' vertices painted';
    if (count > 0) {
      setCustomTarget(mesh, painter.weights);
      if (currentHeightmap) applyDisplacement(heightPct, currentHeightmap);
    }
  }
}

// Commit displacement in real-time while painting
function _paintLoop() {
  if (!paintModeActive) return;
  const mesh = painter.mesh;
  if (mesh && painter.weights && currentHeightmap) {
    setCustomTarget(mesh, painter.weights);
    applyDisplacement(heightPct, currentHeightmap);
    document.getElementById('zone-paint-status').textContent =
      painter.paintedCount().toLocaleString() + ' vertices painted';
  }
  requestAnimationFrame(_paintLoop);
}

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

// ── Terrain: detail level ────────────────────────────────────────────────────
const DETAIL_GRIDS = { low: 32, medium: 64, high: 96 };
document.querySelectorAll('.detail-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.detail-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    if (usingDefault) {
      setGrid(DETAIL_GRIDS[card.dataset.detail] ?? 64);
      rebuildRing();
    }
  });
});

// ── Export ───────────────────────────────────────────────────────────────────
const exportMenu = document.getElementById('export-menu');
function openExportMenu()  { if (currentRing) exportMenu.classList.remove('hidden'); }
function closeExportMenu() { exportMenu.classList.add('hidden'); }

document.getElementById('btn-share').addEventListener('click', e => {
  if (!currentRing) return;
  e.stopPropagation();
  exportMenu.classList.toggle('hidden');
});

exportMenu.querySelectorAll('.export-opt').forEach(opt => {
  opt.addEventListener('click', e => {
    e.stopPropagation();
    if (!currentRing) return;
    painter.hideOverlay();   // keep the paint overlay out of the exported model
    if (opt.dataset.fmt === 'glb') exportGLB(currentRing, 'ring-terrain.glb');
    else                           exportSTL(currentRing, 'ring-terrain.stl');
    closeExportMenu();
  });
});

// Dismiss the menu when clicking anywhere else
document.addEventListener('click', closeExportMenu);

goTo(0);
