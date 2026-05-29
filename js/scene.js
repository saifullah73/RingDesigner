import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  // Environment map — essential for realistic metallic look
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envTexture = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9e8e4);
  scene.environment = envTexture;  // drives reflections on metallic materials

  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
  // Position: slightly above and to the side, looking at ring face
  camera.position.set(1.6, 2.2, 3.8);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 1.5;
  controls.maxDistance = 14;
  controls.target.set(0, 0.1, 0);

  // Directional key light
  const key = new THREE.DirectionalLight(0xfff8f0, 2.0);
  key.position.set(4, 8, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  scene.add(key);

  // Fill
  const fill = new THREE.DirectionalLight(0xd0e8ff, 0.8);
  fill.position.set(-5, 2, -3);
  scene.add(fill);

  // Rim
  const rim = new THREE.DirectionalLight(0xffffff, 0.6);
  rim.position.set(0, -3, -5);
  scene.add(rim);

  // Ground shadow plane
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.ShadowMaterial({ opacity: 0.10 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.0;
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

  return { scene, camera, controls, renderer, canvas, setMesh, getMesh };
}
