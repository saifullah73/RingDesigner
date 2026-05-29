import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8e8e4);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
  camera.position.set(0, 2.8, 4.5);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 1.5;
  controls.maxDistance = 14;
  controls.target.set(0, 0, 0);

  // Lighting — warm key + cool fill for metallic look
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  const key = new THREE.DirectionalLight(0xfff5e0, 3.0);
  key.position.set(5, 10, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xd0e8ff, 1.2);
  fill.position.set(-5, 3, -3);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 0.8);
  rim.position.set(0, -4, -6);
  scene.add(rim);

  // Ground plane for shadow
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.ShadowMaterial({ opacity: 0.12 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.55;
  ground.receiveShadow = true;
  scene.add(ground);

  let currentMesh = null;

  function setMesh(mesh) {
    if (currentMesh) scene.remove(currentMesh);
    currentMesh = mesh;
    if (mesh) scene.add(mesh);
  }

  function getMesh() { return currentMesh; }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (renderer.domElement.width !== w || renderer.domElement.height !== h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  (function loop() {
    requestAnimationFrame(loop);
    resize();
    controls.update();
    renderer.render(scene, camera);
  })();

  return { scene, camera, controls, renderer, setMesh, getMesh };
}
