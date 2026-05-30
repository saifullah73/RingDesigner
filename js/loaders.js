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

// Auto-detect top face vertices by world-space normal direction.
// thresholdPct is the allowed tilt of a face away from world-up: low = strict
// (near-vertical normals only), high = lenient (catches tilted/rotated faces).
// Returns Float32Array of weights (1 = detected, 0 = not).
export function autoDetectTopFace(mesh, thresholdPct) {
  mesh.updateWorldMatrix(true, false);
  const geo = mesh.geometry;
  if (!geo.attributes.normal) geo.computeVertexNormals();

  const nor = geo.attributes.normal.array;
  const n   = nor.length / 3;
  const mat = mesh.matrixWorld;
  const nm  = new THREE.Matrix3().getNormalMatrix(mat);

  // Map threshold (1–50) → max tilt from world-up (~1°–60°); minDot is the
  // smallest world-up component a normal may have to count as "top".
  const maxTilt = (thresholdPct / 50) * (Math.PI / 3);
  const minDot  = Math.cos(maxTilt);

  const weights = new Float32Array(n);
  const wn = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    wn.set(nor[i*3], nor[i*3+1], nor[i*3+2]).applyMatrix3(nm).normalize();
    if (wn.y >= minDot) weights[i] = 1;
  }
  return weights;
}
