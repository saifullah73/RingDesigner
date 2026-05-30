import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// GLB preserves normals + mesh structure (faithful round-trip); binary STL is a
// flat triangle soup for 3D-printing / jewelry slicers. The UI lets the user
// pick which one to download.

// ── GLB ────────────────────────────────────────────────────────────────────
export function exportGLB(object, filename = 'ring.glb') {
  new GLTFExporter().parse(
    object,
    result => download(new Blob([result], { type: 'model/gltf-binary' }), filename),
    err => console.error('GLB export failed:', err),
    { binary: true }
  );
}

// ── Binary STL ───────────────────────────────────────────────────────────────
export function exportSTL(object, filename = 'ring.stl') {
  const triangles = collectTriangles(object);
  download(new Blob([writeBinarySTL(triangles)], { type: 'application/octet-stream' }), filename);
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function collectTriangles(object) {
  const tris = [];
  object.updateWorldMatrix(true, true);

  object.traverse(obj => {
    if (!obj.isMesh) return;
    const geo = obj.geometry.clone();
    geo.applyMatrix4(obj.matrixWorld);

    const pos = geo.attributes.position;
    const idx = geo.index;

    if (idx) {
      for (let i = 0; i < idx.count; i += 3) {
        tris.push(getTri(pos, idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)));
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        tris.push(getTri(pos, i, i + 1, i + 2));
      }
    }
  });

  return tris;
}

function getTri(pos, a, b, c) {
  const va = new THREE.Vector3().fromBufferAttribute(pos, a);
  const vb = new THREE.Vector3().fromBufferAttribute(pos, b);
  const vc = new THREE.Vector3().fromBufferAttribute(pos, c);
  // True geometric face normal (matches counter-clockwise winding), so flat
  // faces export perfectly flat instead of being skewed by averaged normals.
  const cb = new THREE.Vector3().subVectors(vc, vb);
  const ab = new THREE.Vector3().subVectors(va, vb);
  const normal = cb.cross(ab).normalize();
  return { normal, va, vb, vc };
}

function writeBinarySTL(triangles) {
  const header = new Uint8Array(80);
  const headerText = 'Ring Designer STL Export';
  for (let i = 0; i < headerText.length; i++) header[i] = headerText.charCodeAt(i);

  const byteLength = 84 + triangles.length * 50;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);

  // Write header
  new Uint8Array(buffer).set(header, 0);
  // Write triangle count
  view.setUint32(80, triangles.length, true);

  let offset = 84;
  for (const { normal, va, vb, vc } of triangles) {
    view.setFloat32(offset, normal.x, true); offset += 4;
    view.setFloat32(offset, normal.y, true); offset += 4;
    view.setFloat32(offset, normal.z, true); offset += 4;
    for (const v of [va, vb, vc]) {
      // Scale scene units (~2-unit normalised model) to mm for printing
      view.setFloat32(offset, v.x * 10, true); offset += 4;
      view.setFloat32(offset, v.y * 10, true); offset += 4;
      view.setFloat32(offset, v.z * 10, true); offset += 4;
    }
    view.setUint16(offset, 0, true); offset += 2;
  }

  return buffer;
}
