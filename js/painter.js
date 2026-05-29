import * as THREE from 'three';

export class Painter {
  constructor(camera, scene, canvas) {
    this.camera   = camera;
    this.scene    = scene;
    this.canvas   = canvas;
    this.enabled  = false;
    this.painting = false;
    this.brushRadius = 0.25;
    this.mesh     = null;
    this.weights  = null;  // Float32Array, per vertex
    this.overlay  = null;  // THREE.Points visual feedback
    this.controls = null;  // OrbitControls ref, disabled while painting

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp   = this._onUp.bind(this);
  }

  // Set the target mesh (called on model upload or auto-detect)
  setMesh(mesh) {
    this._destroyOverlay();
    this.mesh = mesh;
    if (!mesh) { this.weights = null; return; }
    const n = mesh.geometry.attributes.position.count;
    this.weights = new Float32Array(n);
    this._buildOverlay();
  }

  // Overwrite weights from auto-detect result and refresh overlay
  setWeights(weights) {
    this.weights = weights;
    this._updateColors();
    if (this.overlay) this.overlay.visible = true;
  }

  enable(controls) {
    if (!this.mesh) return;
    this.controls = controls;
    if (controls) controls.enabled = false;
    this.enabled = true;
    this.canvas.style.cursor = 'crosshair';
    this.canvas.addEventListener('mousedown', this._onDown);
    this.canvas.addEventListener('mousemove', this._onMove);
    window.addEventListener('mouseup', this._onUp);
    if (this.overlay) this.overlay.visible = true;
  }

  disable() {
    this.enabled  = false;
    this.painting = false;
    if (this.controls) this.controls.enabled = true;
    this.canvas.style.cursor = '';
    this.canvas.removeEventListener('mousedown', this._onDown);
    this.canvas.removeEventListener('mousemove', this._onMove);
    window.removeEventListener('mouseup', this._onUp);
    // Keep overlay visible so user can see what was painted
  }

  clear() {
    if (this.weights) this.weights.fill(0);
    this._updateColors();
  }

  hideOverlay() { if (this.overlay) this.overlay.visible = false; }
  showOverlay() { if (this.overlay) this.overlay.visible = true; }

  paintedCount() {
    if (!this.weights) return 0;
    let c = 0;
    for (let i = 0; i < this.weights.length; i++) if (this.weights[i] > 0) c++;
    return c;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  _buildOverlay() {
    if (!this.mesh) return;
    this.mesh.updateWorldMatrix(true, false);

    const localPos = this.mesh.geometry.attributes.position.array;
    const n        = localPos.length / 3;
    const mat      = this.mesh.matrixWorld;

    const wPos = new Float32Array(n * 3);
    const clr  = new Float32Array(n * 3);

    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(localPos[i*3], localPos[i*3+1], localPos[i*3+2])
                  .applyMatrix4(mat);
      wPos[i*3] = v.x; wPos[i*3+1] = v.y; wPos[i*3+2] = v.z;
      clr[i*3] = 0.6; clr[i*3+1] = 0.6; clr[i*3+2] = 0.6;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(clr,  3));

    this.overlay = new THREE.Points(geo,
      new THREE.PointsMaterial({ size: 0.022, vertexColors: true, depthTest: false })
    );
    this.overlay.renderOrder = 999;
    this.overlay.visible = false;
    this.scene.add(this.overlay);
  }

  _destroyOverlay() {
    if (this.overlay) {
      this.scene.remove(this.overlay);
      this.overlay.geometry.dispose();
      this.overlay = null;
    }
  }

  _updateColors() {
    if (!this.overlay || !this.weights) return;
    const clr = this.overlay.geometry.attributes.color.array;
    for (let i = 0; i < this.weights.length; i++) {
      if (this.weights[i] > 0) {
        clr[i*3] = 0.08; clr[i*3+1] = 0.85; clr[i*3+2] = 0.40; // green
      } else {
        clr[i*3] = 0.55; clr[i*3+1] = 0.55; clr[i*3+2] = 0.55; // gray
      }
    }
    this.overlay.geometry.attributes.color.needsUpdate = true;
  }

  _ndc(e) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(
       ((e.clientX - r.left) / r.width)  * 2 - 1,
      -((e.clientY - r.top)  / r.height) * 2 + 1
    );
  }

  _onDown(e) { if (e.button === 0) { this.painting = true; this._paint(e); } }
  _onMove(e) { if (this.painting) this._paint(e); }
  _onUp()    { this.painting = false; }

  _paint(e) {
    if (!this.mesh || !this.enabled || !this.weights) return;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(this._ndc(e), this.camera);
    this.mesh.updateWorldMatrix(true, false);
    const hits = rc.intersectObject(this.mesh, false);
    if (!hits.length) return;

    const hp  = hits[0].point;
    const pos = this.mesh.geometry.attributes.position.array;
    const mat = this.mesh.matrixWorld;
    const r2  = this.brushRadius * this.brushRadius;
    let changed = false;

    for (let i = 0, n = this.weights.length; i < n; i++) {
      const wp = new THREE.Vector3(pos[i*3], pos[i*3+1], pos[i*3+2]).applyMatrix4(mat);
      if (wp.distanceToSquared(hp) <= r2) { this.weights[i] = 1; changed = true; }
    }
    if (changed) this._updateColors();
  }
}
