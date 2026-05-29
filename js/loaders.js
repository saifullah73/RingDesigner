import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

// Returns { group, topFaceGeo, bezelBaseY } or null on error
export async function loadModel(file, faceThresholdPct) {
  const ext = file.name.split('.').pop().toLowerCase();
  let group;

  if (ext === 'glb' || ext === 'gltf') {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(URL.createObjectURL(file));
    group = gltf.scene;
  } else if (ext === 'obj') {
    const loader = new OBJLoader();
    const text = await file.text();
    group = loader.parse(text);
  } else if (ext === 'stl') {
    const loader = new STLLoader();
    const buffer = await file.arrayBuffer();
    const geo = loader.parse(buffer);
    const mat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 });
    const mesh = new THREE.Mesh(geo, mat);
    group = new THREE.Group();
    group.add(mesh);
  } else {
    throw new Error('Unsupported format: ' + ext);
  }

  // Normalize scale/position
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = 2.0 / maxDim;
  group.scale.setScalar(scale);
  const center = new THREE.Vector3();
  box.getCenter(center);
  group.position.sub(center.multiplyScalar(scale));

  // Apply standard material to all meshes
  group.traverse(obj => {
    if (obj.isMesh) {
      obj.material = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 });
      obj.castShadow = true;
    }
  });

  // Detect top face geometry
  const { topFaceGeo, bezelBaseY } = detectTopFace(group, faceThresholdPct);

  return { group, topFaceGeo, bezelBaseY };
}

function detectTopFace(group, thresholdPct) {
  // Collect all geometry in world space
  const allPositions = [];
  const allNormals = [];

  group.updateWorldMatrix(true, true);

  group.traverse(obj => {
    if (!obj.isMesh) return;
    const geo = obj.geometry.clone();
    if (!geo.attributes.normal) geo.computeVertexNormals();
    geo.applyMatrix4(obj.matrixWorld);

    const pos = geo.attributes.position.array;
    const nor = geo.attributes.normal.array;
    for (let i = 0; i < pos.length / 3; i++) {
      allPositions.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      allNormals.push(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]);
    }
  });

  if (allPositions.length === 0) return { topFaceGeo: null, bezelBaseY: null };

  // Find Y extents
  let maxY = -Infinity, minY = Infinity;
  for (let i = 1; i < allPositions.length; i += 3) {
    if (allPositions[i] > maxY) maxY = allPositions[i];
    if (allPositions[i] < minY) minY = allPositions[i];
  }

  const yRange = maxY - minY;
  const yThreshold = maxY - yRange * (thresholdPct / 100);

  // Find vertices that are near the top AND have upward-facing normals
  const topIndices = [];
  for (let i = 0; i < allPositions.length / 3; i++) {
    const y = allPositions[i * 3 + 1];
    const ny = allNormals[i * 3 + 1];
    if (y >= yThreshold && ny > 0.7) {
      topIndices.push(i);
    }
  }

  if (topIndices.length === 0) return { topFaceGeo: null, bezelBaseY: null };

  // Build a sub-geometry from those vertices
  const positions = new Float32Array(topIndices.length * 3);
  const normals = new Float32Array(topIndices.length * 3);
  const baseY = new Float32Array(topIndices.length);

  for (let j = 0; j < topIndices.length; j++) {
    const i = topIndices[j];
    positions[j * 3] = allPositions[i * 3];
    positions[j * 3 + 1] = allPositions[i * 3 + 1];
    positions[j * 3 + 2] = allPositions[i * 3 + 2];
    normals[j * 3] = allNormals[i * 3];
    normals[j * 3 + 1] = allNormals[i * 3 + 1];
    normals[j * 3 + 2] = allNormals[i * 3 + 2];
    baseY[j] = allPositions[i * 3 + 1];
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

  return { topFaceGeo: geo, bezelBaseY: baseY };
}
