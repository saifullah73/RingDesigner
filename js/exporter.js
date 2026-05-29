import * as THREE from 'three';

// Export a Three.js Group/Mesh as binary STL and trigger download
export function exportSTL(object, filename = 'ring.stl') {
  const triangles = collectTriangles(object);
  const buffer = writeBinarySTL(triangles);
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
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
    if (!geo.attributes.normal) geo.computeVertexNormals();
    geo.applyMatrix4(obj.matrixWorld);

    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const idx = geo.index;

    if (idx) {
      for (let i = 0; i < idx.count; i += 3) {
        const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
        tris.push(getTri(pos, nor, a, b, c));
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        tris.push(getTri(pos, nor, i, i + 1, i + 2));
      }
    }
  });

  return tris;
}

function getTri(pos, nor, a, b, c) {
  const va = new THREE.Vector3().fromBufferAttribute(pos, a);
  const vb = new THREE.Vector3().fromBufferAttribute(pos, b);
  const vc = new THREE.Vector3().fromBufferAttribute(pos, c);
  const na = new THREE.Vector3().fromBufferAttribute(nor, a);
  const nb = new THREE.Vector3().fromBufferAttribute(nor, b);
  const nc = new THREE.Vector3().fromBufferAttribute(nor, c);
  const normal = na.add(nb).add(nc).normalize();
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
      // Scale to mm (scene units are in mm already)
      view.setFloat32(offset, v.x * 10, true); offset += 4;
      view.setFloat32(offset, v.y * 10, true); offset += 4;
      view.setFloat32(offset, v.z * 10, true); offset += 4;
    }
    view.setUint16(offset, 0, true); offset += 2;
  }

  return buffer;
}
