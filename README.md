# MarsVerse

MarsVerse is an immersive, interactive 3D web application designed to allow users to seamlessly explore the surface of Mars, track historic rover missions, and scientifically analyze locations for future human settlement. Developed as a cutting-edge submission for the NASA HyperThon.

[![Screenshot of MarsVerse UI](https://esri.github.io/marsverse/screenshot.jpg)](#)

## Core Features

- **High-Fidelity 3D Planetary Globe**: Explore a mathematically accurate 3D model of Mars utilizing MOLA topographic global elevation rasters.
- **Historic Rover Tracking**: Follow the exact landing coordinates and data feeds from Perseverance, Curiosity, and Opportunity rovers.
- **Algorithmic Habitability Analysis**: AI-driven calculations generating 0-100% Habitability Scores based on real-time surface parameters (radiation shielding, temperature, water-ice proximity, and structural stability).
- **Custom Glassmorphic Dashboard**: A heavily customized, sleek UI HUD hovering above the 3D map allowing for seamless searches, location indexing, and camera manipulation.
- **Dynamic Database Integration**: Automatically fetches thousands of craters, mons, and valles directly into the UI for exploration.

---

## Technical Approach

The core of MarsVerse is built by intertwining modern frontend web development with heavy-duty Geographic Information System (GIS) SDKs.

### Architecture & Framework
The application is built using **TypeScript** and bundled via **Vite** for blazing fast HMR (Hot Module Replacement) and optimized production builds. 
The User Interface is built within the **ArcGIS JS SDK Custom Widget Architecture**, which utilizes a reactive Virtual DOM (similar to React/Preact) under the hood using TSX (TypeScript XML). This allows the UI layer to react instantly to the heavy 3D map state without causing render-blocking frame drops.

### 3D GIS Engine
The 3D visualization is powered by the **ArcGIS Maps SDK for JavaScript (`@arcgis/core`)**.
- **SceneView & Cameras**: The engine controls a `SceneView` utilizing a specialized custom Spatial Reference (Mars 2000 Sphere - WKID 104971) to mathematically project the globe accurately rather than using Earth's WGS84 coordinates.
- **Dynamic Feature Queries**: Instead of hardcoding massive datasets, the app executes live spatial SQL queries (`1=1`) against the `marsNamesLayer` FeatureService upon load, hydrating our HUD's database and rendering hundreds of 3D Point Graphics seamlessly onto the terrain.

### User Interface & Styling
- **Glassmorphism Design System**: The UI avoids standard opaque panels and native ArcGIS widgets. Instead, we use `backdrop-filter: blur()`, semi-transparent RGBA backgrounds, and strict z-index stacking to create a futuristic "glass" HUD overlaying the 3D canvas.
- **State Management**: The UI components (`HudLayer`) utilize reactive `@property()` decorators. When the user interacts with the search bar or sidebar, the Widget framework automatically schedules highly efficient partial DOM updates.

### Habitability Engine Calculation
The Habitability Scoring system doesn't rely on arbitrary numbers. We parse synthetic or external API JSON data arrays through a weighted normalization algorithm structured against Earth's habitable baselines:
- **Temperature Normalization**: Mars (-120°C to +20°C) is mathematically scaled (weighted at 20%).
- **Radiation Defense**: Subsurface shielding (weighted at 30%).
- **ISRU Potential**: Water-Ice Regolith Proximity (weighted at 25%).
- **Geologic Integrity**: Structural stability for habitat placement (weighted at 25%).

These values output a final AI assessment paragraph determining the survivability of an astronaut crew at that specific planetary sector.

---

## Instructions to Run Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+)
- npm

### Installation
```bash
# 1. Clone the repository
git clone https://github.com/your-org/marsverse.git
cd marsverse/

# 2. Install dependencies
npm install

# 3. Start the development server
npm run start
```

The application will be served at `http://localhost:3000`. 
*(Note: Due to memory constraints in the ArcGIS SDK, building for production via `npm run build` may require increased Node Heap limits).*

---

## Data Sources & Acknowledgements
- **NASA Planetary Data System (PDS)**: MOLA topographic global elevation rasters.
- **ESA Mars Express HRSC**: Multi-spectral stereoscopic digital terrain models.
- **USGS Astrogeology Science Center**: Unified Martian geographic nomenclature registry.
