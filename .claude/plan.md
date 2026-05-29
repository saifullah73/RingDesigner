# Ring Designer — Implementation Plan

## What We're Building
A single-page web tool where users load a signet ring (or use the built-in default), pick a terrain source (uploaded heightmap or live Mapbox map), adjust displacement height, and export the result as STL for 3D printing.

---

## Tech Stack
| Concern | Choice | Reason |
|---|---|---|
| 3D rendering | Three.js (CDN, ES modules) | Industry standard, no build step needed |
| Map | Mapbox GL JS | Terrain-RGB tiles = elevation in a single fetch |
| 3D loaders | Three.js GLTFLoader, OBJLoader, STLLoader | Covers GLB/GLTF, OBJ, STL |
| Export | Custom binary STL writer | Only format needed for 3D printing |
| Build | None — pure HTML/CSS/JS | Works on any machine, no Node required |

---

## File Structure
```
D:\Dev\RingDesigner\
├── index.html
├── css/
│   └── style.css
└── js/
    ├── main.js        — app init, UI event wiring
    ├── scene.js       — Three.js scene, camera, OrbitControls
    ├── ring.js        — default signet ring geometry + face tagging
    ├── loaders.js     — GLB/GLTF/OBJ/STL import + top-face detection
    ├── terrain.js     — displacement logic (applies heightmap to top face)
    ├── picker.js      — upload heightmap: pan/zoom canvas, crop selection
    ├── mapbox.js      — live map: Mapbox GL, selection box, elevation decode
    └── exporter.js    — binary STL export + download trigger
```

---

## UI Layout
```
┌──────────────────────────────────────────────────────────────┐
│  Ring Designer                                  [Export STL] │
├─────────────────────────┬────────────────────────────────────┤
│                         │  LOAD MODEL                        │
│                         │  [Use Default] [Upload .glb/.obj/.stl] │
│   Three.js Viewport     ├────────────────────────────────────┤
│   (orbit, zoom, pan)    │  TERRAIN                           │
│                         │  [Upload Heightmap] [Live Map]     │
│                         │                                    │
│                         │  ┌──────────────────────────────┐  │
│                         │  │  terrain picker panel        │  │
│                         │  │  (pan/zoom image OR map)     │  │
│                         │  └──────────────────────────────┘  │
│                         │                                    │
│                         │  Displacement Height               │
│                         │  ──────●──────  [slider 0–5mm]    │
└─────────────────────────┴────────────────────────────────────┘
```

---

## Key Technical Decisions

### 1. Default Signet Ring Geometry
Built procedurally in Three.js — no external model file needed:
- **Band**: Lathe geometry from a D-shaped 2D profile (ring cross-section), rotated 360°, with a gap at the top
- **Bezel top**: Flat rectangular grid of vertices (64×64) sitting on top of the band
- **Face tagging**: Bezel vertices stored separately so displacement targets them precisely

### 2. Terrain Displacement
- At startup: bezel vertex base positions stored
- On change: for each bezel vertex, sample heightmap at its (u, v) → displace along +Y by `sample * height_scale`
- Runs on CPU — no GPU compute needed, 64×64 = 4096 points, fast on any machine
- Geometry `needsUpdate = true` triggers re-render

### 3. Upload Heightmap (picker.js)
- User uploads any image (grayscale PNG/JPG works best, color also accepted → luminance)
- Image drawn to a canvas with pan/zoom controls (mouse wheel, drag)
- A fixed aspect-ratio rectangle overlay shows the crop region matching the bezel proportions
- On confirm: crop that region, read pixel data → Float32Array heightmap

### 4. Live Map — Mapbox (mapbox.js)
- User enters their Mapbox public token once (stored in localStorage)
- Mapbox GL JS map with `mapbox-terrain-rgb` layer
- User pans/zooms the map; a fixed rectangle overlay shows the capture region
- On confirm: fetch the Terrain-RGB tile(s) covering the selection, decode elevation:
  `elevation = -10000 + (R*65536 + G*256 + B) * 0.1`
- Normalize elevation range to 0–1 → Float32Array heightmap

### 5. Uploaded Model — Top Face Detection (loaders.js)
For user-uploaded rings:
- Load with appropriate Three.js loader (detect by file extension)
- Scan all faces: keep vertices where face normal · (0,1,0) > 0.85 AND Y > (maxY - threshold)
- Threshold exposed as a UI slider so user can fine-tune if auto-detect misses

### 6. STL Export (exporter.js)
- Iterate all triangles in the (modified) geometry
- Write binary STL: 80-byte header + triangle count + per-triangle (normal + 3 vertices + attribute)
- `Blob` → `URL.createObjectURL` → `<a download>` click trigger

---

## Implementation Phases

### Phase 1 — Core Viewer
- [ ] HTML skeleton + CSS layout
- [ ] Three.js scene, lighting, OrbitControls
- [ ] Default signet ring geometry with tagged bezel

### Phase 2 — Terrain Upload + Displacement
- [ ] Heightmap upload + pan/zoom picker canvas
- [ ] Displacement engine wired to slider
- [ ] Real-time preview

### Phase 3 — Live Map
- [ ] Mapbox GL integration with token input
- [ ] Selection overlay + elevation tile fetch + decode
- [ ] Feed decoded heightmap into same displacement engine

### Phase 4 — Model Import + Export
- [ ] GLB/GLTF/OBJ/STL loaders
- [ ] Top-face auto-detection
- [ ] Binary STL export

---

## Open Questions / Assumptions
- Mapbox token: user must supply their own (free tier: 50k loads/month). Shown as a setup step in the UI.
- Displacement is applied only upward (+Y); the ring interior/band is never modified.
- The tool does not support multiple terrain regions — one flat top face, one terrain.
- 64×64 bezel grid gives ~4000 triangles on the top face — enough detail without taxing weak hardware.
