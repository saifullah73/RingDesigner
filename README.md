# Ring Designer

A single-page web tool for sculpting real-world terrain onto 3D ring models. Pick a ring (the built-in signet or your own model), choose where the terrain comes from (an uploaded heightmap image or a live map location), and the elevation is displaced onto the ring's top face in real time. Export the result as GLB or STL.

No installation or build step — it's plain HTML/CSS/ES-module JavaScript with all libraries loaded from CDN.

---

## Features

- **Two ring sources** — a procedurally-built signet ring (with style/shoulder/band options) or any uploaded model (`GLB`, `GLTF`, `OBJ`, `STL`).
- **Top-face targeting for uploaded models**
  - *Auto-detect* — finds the upward-facing surface; the threshold controls how far a face may tilt from "up" before it's excluded (works on rotated models).
  - *Paint mode* — manually brush the region to displace, with a live on-surface brush-size ring and surface-aware selection (the brush won't bleed through the model's thickness).
- **Two terrain sources**
  - *Heightmap image* — upload any image; pan/zoom and a bezel-aspect crop box selects the region; brightness becomes elevation.
  - *Live map* — a Mapbox terrain map (light style + hillshade relief, blue water); a centered crop box samples real elevation data for just that area, updating the ring as you pan.
- **Adjustable displacement** — height/exaggeration slider and Low/Medium/High mesh resolution (default ring).
- **Export** — choose **GLB** (faithful round-trip: preserves normals and mesh structure) or **STL** (flat triangle soup for 3D-printing/jewelry slicers).
- **Real-time 3D preview** — metallic PBR material, environment reflections, orbit/zoom controls.

---

## Dependencies

All loaded from CDN at runtime — nothing to install.

| Library | Version | Purpose |
|---------|---------|---------|
| [Three.js](https://threejs.org) | 0.165.0 | 3D rendering, geometry, loaders/exporters, OrbitControls |
| [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/) | 3.3.0 | Live terrain map for the Location step |

A **Mapbox public token** is required only for the Live Map feature (free tier). The Upload Heightmap option needs no token.

---

## Running the project

The tool is plain HTML/CSS/JS, but browsers block ES modules over `file://`, so it must be served over HTTP.

### Option 1 — Python (quickest)

```bash
cd D:\Dev\RingDesigner
python -m http.server 8080
```

Open **http://localhost:8080**.

### Option 2 — Node.js

```bash
cd D:\Dev\RingDesigner
npx serve .
```

### Option 3 — VS Code Live Server

Right-click `index.html` → **Open with Live Server**.

---

## Mapbox token (Live Map only)

1. Sign up at https://account.mapbox.com
2. Copy your **public token** (`pk.eyJ1…`)
3. Paste it into the token field in the Live Map tab — it's saved to `localStorage`, so you only do this once.

---

## Workflow

| Step | What you do |
|------|-------------|
| **Style** | Use the default signet ring, or upload your own model. |
| **Zone** | *(uploaded models only)* Orient the model with the rotation sliders, then **Auto-Detect** the top face or **Paint** it manually. |
| **Location** | Upload a heightmap image and crop it, or position the live map so the crop box frames your location. |
| **Terrain** | Set displacement height/exaggeration and (default ring) mesh detail. |
| **Finish / Export** | Click **Export** (or **Finish**) and choose **GLB** or **STL** to download. |

### Paint-mode controls

| Action | Control |
|--------|---------|
| Paint vertices | Left-drag |
| Erase vertices | **Ctrl**-drag (brush turns grey) |
| Orbit the scene | **Alt**-drag |
| Zoom | Scroll wheel |

Picked vertices are highlighted red; unpicked ones show as small faint dots. The brush ring on the surface shows the exact brush size.

---

## Project structure

```
index.html        Markup + CDN import map (Three.js, Mapbox)
css/style.css     All styling
js/
  main.js         App entry: wizard steps, UI wiring, state, export menu
  scene.js        Three.js renderer, lights, environment, camera, orbit controls
  ring.js         Procedural default signet ring (band, bezel walls, displaceable top)
  loaders.js      Model import (GLB/GLTF/OBJ/STL), normalisation, top-face auto-detect
  painter.js      Paint-mode brush: raycasting, weight overlay, brush-size ring
  picker.js       Heightmap-image cropper (pan/zoom canvas with bezel-aspect crop box)
  mapbox.js       Live map, crop-box elevation sampling, terrain-RGB decode
  terrain.js      Heightmap → displacement (default bezel and uploaded-model paths)
  exporter.js     GLB (GLTFExporter) and binary STL export
```

### How displacement works

- **Default ring** (`terrain.js` → `_applyDefault`): the bezel top is a grid; each vertex's Y is offset by the bilinearly-sampled heightmap, with the border clamped to zero so terrain meets the bezel walls cleanly.
- **Uploaded models** (`_applyCustom`): the detected/painted region is projected onto the world X-Z plane for UVs and displaced along world-up (so terrain rises correctly regardless of model rotation), then written back into local space. Untouched vertices stay at their captured base positions.

### Heightmap sources

- `heightmapFromImage` (used by `picker.js`) — luminance of the cropped image region.
- `heightmapFromElevations` (used by `mapbox.js`) — Mapbox terrain-RGB tiles decoded to meters and normalised; decoded tiles are cached so panning back over an area is instant.

---

## Notes & limitations

- The live map's crop-to-bounds sampling assumes a **north-up, non-tilted** map (the default orientation).
- **STL** cannot store smooth-shading normals, so a reimported STL looks faceted on curved surfaces — use **GLB** if you need a visually identical round-trip.
- Displacing only a selected region of an uploaded model can stretch the boundary where it meets the rest of the mesh; keeping displacement moderate avoids visible seams.
</content>
