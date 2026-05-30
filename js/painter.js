import * as THREE from 'three';

// Overlay vertex appearance: picked = bold red, unpicked = small faint slate.
const PICKED        = [0.95, 0.16, 0.13];
const UNPICKED      = [0.42, 0.45, 0.50];
const SIZE_PICKED   = 0.075;
const SIZE_UNPICKED = 0.028;

const _ZAXIS   = new THREE.Vector3(0, 0, 1);
const _tmpSize = new THREE.Vector2();

// Round, depth-faded points; sized in world units (perspective-attenuated).
const OVERLAY_VERT = `
  attribute vec3 aColor;
  attribute float aSize;
  uniform float uScale;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (uScale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const OVERLAY_FRAG = `
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = dot(c, c);
    if (d > 0.25) discard;            // clip to a circle
    float a = smoothstep(0.25, 0.10, d); // soft anti-aliased edge
    gl_FragColor = vec4(vColor, a);
  }
`;

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
    this.brush    = null;  // THREE.Line ring showing brush size on the surface
    this.controls = null;  // OrbitControls ref, disabled while painting

    this._rc = new THREE.Raycaster();
    this._v  = new THREE.Vector3();
    this._vn = new THREE.Vector3();   // scratch: a vertex's world normal
    this._hn = new THREE.Vector3();   // scratch: hit-point surface normal
    this._erase = false;   // current stroke erases instead of paints (Ctrl held)

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp   = this._onUp.bind(this);
    this._onPointerDownCapture = this._onPointerDownCapture.bind(this);
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
    // Leave the camera enabled so the wheel zooms and Alt-drag orbits; a plain
    // left-drag is gated off to the painter by _onPointerDownCapture.
    if (controls) controls.enabled = true;
    this.enabled = true;
    this.canvas.style.cursor = 'crosshair';
    this.canvas.addEventListener('pointerdown', this._onPointerDownCapture, true);
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
    this.canvas.removeEventListener('pointerdown', this._onPointerDownCapture, true);
    this.canvas.removeEventListener('mousedown', this._onDown);
    this.canvas.removeEventListener('mousemove', this._onMove);
    window.removeEventListener('mouseup', this._onUp);
    if (this.brush) this.brush.visible = false;
    // Keep overlay visible so user can see what was painted
  }

  clear() {
    if (this.weights) this.weights.fill(0);
    this._updateColors();
  }

  hideOverlay() {
    if (this.overlay) this.overlay.visible = false;
    if (this.brush)   this.brush.visible   = false;
  }
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

    // Use the mesh's own local positions and parent the overlay to the mesh, so
    // it inherits rotation/displacement automatically and never goes stale.
    const localPos = this.mesh.geometry.attributes.position.array;
    const n        = localPos.length / 3;

    const lPos = Float32Array.from(localPos);
    const clr  = new Float32Array(n * 3);
    const siz  = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      clr[i*3] = UNPICKED[0]; clr[i*3+1] = UNPICKED[1]; clr[i*3+2] = UNPICKED[2];
      siz[i] = SIZE_UNPICKED;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(lPos, 3));
    geo.setAttribute('aColor',   new THREE.BufferAttribute(clr,  3));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(siz,  1));

    const material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 300 } },
      vertexShader:   OVERLAY_VERT,
      fragmentShader: OVERLAY_FRAG,
      transparent: true, depthTest: false, depthWrite: false,
    });

    this.overlay = new THREE.Points(geo, material);
    this.overlay.renderOrder   = 999;
    this.overlay.frustumCulled = false;
    this.overlay.visible       = false;
    // Keep world-unit point sizing correct regardless of viewport height
    this.overlay.onBeforeRender = renderer => {
      material.uniforms.uScale.value = renderer.getDrawingBufferSize(_tmpSize).y * 0.5;
    };
    this.mesh.add(this.overlay);
  }

  _buildBrush() {
    const seg = 64, pts = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    this.brush = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xff3b30, transparent: true, opacity: 0.95, depthTest: false,
    }));
    this.brush.renderOrder   = 1000;
    this.brush.frustumCulled = false;
    this.brush.visible       = false;
    this.scene.add(this.brush);
  }

  _destroyOverlay() {
    for (const obj of [this.overlay, this.brush]) {
      if (!obj) continue;
      obj.removeFromParent();
      obj.geometry.dispose();
      obj.material.dispose();
    }
    this.overlay = null;
    this.brush   = null;
  }

  _updateColors() {
    if (!this.overlay || !this.weights) return;
    const clr = this.overlay.geometry.attributes.aColor.array;
    const siz = this.overlay.geometry.attributes.aSize.array;
    for (let i = 0; i < this.weights.length; i++) {
      const picked = this.weights[i] > 0;
      const c = picked ? PICKED : UNPICKED;
      clr[i*3] = c[0]; clr[i*3+1] = c[1]; clr[i*3+2] = c[2];
      siz[i]   = picked ? SIZE_PICKED : SIZE_UNPICKED;
    }
    this.overlay.geometry.attributes.aColor.needsUpdate = true;
    this.overlay.geometry.attributes.aSize.needsUpdate  = true;
  }

  _ndc(e) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(
       ((e.clientX - r.left) / r.width)  * 2 - 1,
      -((e.clientY - r.top)  / r.height) * 2 + 1
    );
  }

  _raycast(e) {
    if (!this.mesh) return null;
    this._rc.setFromCamera(this._ndc(e), this.camera);
    this.mesh.updateWorldMatrix(true, false);
    const hits = this._rc.intersectObject(this.mesh, false);
    return hits.length ? hits[0] : null;
  }

  // Place the brush ring on the surface, sized to the exact brush radius and
  // laid flat against the face it's hovering. Turns grey to signal erase mode.
  _updateBrush(hit, erase) {
    if (!this.brush) this._buildBrush();
    this.brush.material.color.setHex(erase ? 0x9aa0a6 : 0xff3b30);
    if (!hit) { this.brush.visible = false; return; }
    this.brush.visible = true;
    this.brush.position.copy(hit.point);
    this.brush.scale.setScalar(this.brushRadius);
    if (hit.face) {
      this._v.copy(hit.face.normal).transformDirection(this.mesh.matrixWorld).normalize();
      this.brush.quaternion.setFromUnitVectors(_ZAXIS, this._v);
    }
  }

  // Capture-phase gate: a plain left-drag paints (so suppress the camera);
  // Alt-drag and the other buttons drive OrbitControls instead.
  _onPointerDownCapture(e) {
    if (!this.controls) return;
    const painting = e.button === 0 && !e.altKey;
    this.controls.enabled = !painting;
  }

  _onDown(e) {
    if (e.button !== 0 || e.altKey) return;   // Alt-drag is reserved for the camera
    this.painting = true;
    this._erase = e.ctrlKey || e.metaKey;     // Ctrl/Cmd erases instead of paints
    const hit = this._raycast(e);
    this._updateBrush(hit, this._erase);
    if (hit) this._paintAt(hit);
  }

  _onMove(e) {
    const erase = this.painting ? this._erase : (e.ctrlKey || e.metaKey);
    const hit = this._raycast(e);
    this._updateBrush(hit, erase);
    if (this.painting && hit) this._paintAt(hit);
  }

  _onUp() {
    this.painting = false;
    if (this.controls) this.controls.enabled = true; // restore camera after a stroke
  }

  _paintAt(hit) {
    if (!this.enabled || !this.weights) return;
    const geo = this.mesh.geometry;
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const pos = geo.attributes.position.array;
    const nor = geo.attributes.normal.array;
    const mat = this.mesh.matrixWorld;
    const r2  = this.brushRadius * this.brushRadius;
    const val = this._erase ? 0 : 1;

    // Only affect the surface actually under the cursor: reject vertices whose
    // normal faces away from the hit normal (back side, side walls, etc.), so
    // the brush sphere doesn't bleed through the model's thickness.
    const hn = this._hn;
    const useNormal = !!hit.face;
    if (useNormal) hn.copy(hit.face.normal).transformDirection(mat);
    const hp = hit.point;

    let changed = false;
    for (let i = 0, n = this.weights.length; i < n; i++) {
      this._v.set(pos[i*3], pos[i*3+1], pos[i*3+2]).applyMatrix4(mat);
      if (this._v.distanceToSquared(hp) > r2) continue;
      if (useNormal) {
        this._vn.set(nor[i*3], nor[i*3+1], nor[i*3+2]).transformDirection(mat);
        if (this._vn.dot(hn) < 0.35) continue;   // ~69° tolerance
      }
      if (this.weights[i] !== val) { this.weights[i] = val; changed = true; }
    }
    if (changed) this._updateColors();
  }
}
