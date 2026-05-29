# Ring Designer

A single-page web tool for applying real-world terrain displacement onto 3D signet ring models. No installation or build step required.

---

## Dependencies

All dependencies are loaded from CDN at runtime — nothing needs to be installed locally.

| Library | Version | Purpose |
|---------|---------|---------|
| [Three.js](https://threejs.org) | 0.165.0 | 3D rendering, geometry, OrbitControls |
| [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/) | 3.3.0 | Live satellite/terrain map for the Location step |

A **Mapbox public token** is required only if you use the Live Map feature (free tier, see below).

---

## Running the project

The tool is plain HTML/CSS/JS — no build step. You just need a local HTTP server because browsers block ES modules over `file://`.

### Option 1 — Python (quickest)

```bash
cd D:\Dev\RingDesigner
python -m http.server 8080
```

Open **http://localhost:8080** in your browser.

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
3. Paste it into the token field in the Live Map tab — it is saved to `localStorage` so you only need to do this once.

The Upload Heightmap option works without any token.

---

## Workflow

| Step | What you do |
|------|-------------|
| **Style** | Use the default signet ring, or upload your own model (GLB, GLTF, OBJ, STL) |
| **Zone** | For uploaded models: auto-detect the top face or paint it manually in the viewport |
| **Location** | Upload a heightmap image and pan/zoom to crop it, or pick a location on the live map |
| **Terrain** | Adjust displacement height and mesh resolution (Low / Medium / High) |
| **Finish** | Click **Finish** or the **Export STL** button to download the model for 3D printing |
