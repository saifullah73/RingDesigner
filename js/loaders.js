import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader }  from 'three/addons/loaders/OBJLoader.js';
import { STLLoader }  from 'three/addons/loaders/STLLoader.js';

// Load any supported 3D model, normalise it, return the group
export async function loadModel(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  let group;

  if (ext === 'glb' || ext === 'gltf') {
    const gltf = await new GLTFLoader().loadAsync(URL.createObjectURL(file));
    group = gltf.scene;
  } else if (ext === 'obj') {
    group = new OBJLoader().parse(await file.text());
  } else if (ext === 'stl') {
    const geo  = new STLLoader().parse(await file.arrayBuffer());
    const mesh = new THREE.Mesh(geo);
    group = new THREE.Group();
    group.add(mesh);
  } else {
    throw new Error('Unsupported format: ' + ext);
  }

  // Normalise: fit to ~2 unit bounding box, centred at origin
  const box  = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  const s = 2.0 / Math.max(size.x, size.y, size.z);
  group.scale.setScalar(s);
  const center = new THREE.Vector3();
  box.getCenter(center);
  group.position.sub(center.multiplyScalar(s));

  // Silver material, double-sided
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xf0eeee, metalness: 1.0, roughness: 0.07, side: THREE.DoubleSide,
  });
  group.traverse(o => {
    if (o.isMesh) { o.material = mat; o.castShadow = true; }
  });

  return group;
}

// Return the single mesh with the most vertices in a group
export function getLargestMesh(group) {
  let best = null, bestCount = 0;
  group.traverse(o => {
    if (!o.isMesh) return;
    const c = o.geometry.attributes.position.count;
    if (c > bestCount) { bestCount = c; best = o; }
  });
  return best;
}

// Auto-detect top face vertices: upward normals + near top of model
// Returns Float32Array of weights (1 = detected, 0 = not)
export function autoDetectTopFace(mesh, thresholdPct) {
  mesh.updateWorldMatrix(true, false);
  const geo = mesh.geometry;
  if (!geo.attributes.normal) geo.computeVertexNormals();

  const pos = geo.attributes.position.array;
  const nor = geo.attributes.normal.array;
  const n   = pos.length / 3;
  const mat = mesh.matrixWorld;
  const nm  = new THREE.Matrix3().getNormalMatrix(mat);

  // World-space Y extents
  let maxY = -Infinity, minY = Infinity;
  for (let i = 0; i < n; i++) {
    const wy = new THREE.Vector3(pos[i*3], pos[i*3+1], pos[i*3+2]).applyMatrix4(mat).y;
    if (wy > maxY) maxY = wy;
    if (wy < minY) minY = wy;
  }
  const yThresh = maxY - (maxY - minY) * (thresholdPct / 100);

  const weights = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const wp = new THREE.Vector3(pos[i*3], pos[i*3+1], pos[i*3+2]).applyMatrix4(mat);
    const wn = new THREE.Vector3(nor[i*3], nor[i*3+1], nor[i*3+2]).applyMatrix3(nm).normalize();
    if (wp.y >= yThresh && wn.y > 0.55) weights[i] = 1;
  }
  return weights;
}
