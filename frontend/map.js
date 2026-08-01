/**
 * map.js — India Climate Digital Twin
 *
 * PREMIUM MAP ENGINE v3.0 — IMD RASTER PIPELINE
 * ───────────────────────────────────────────────
 *  1. IMD 0.25°×0.25° GRID → bilinear interpolation → continuous raster PNG
 *     rendered via L.imageOverlay (NASA/IMD broadcast-quality visualization).
 *  2. IMAGE-BASED DYNAMIC CLOUDS — uses `cloud.png` for realistic drifting masses.
 *  3. State borders — transparent GeoJSON outlines for hover/tooltip/click.
 *  4. SONAR PING — dual-ring radar ripple on hover.
 *  5. Esri World Imagery satellite basemap.
 */

// ── GLOBALS ────────────────────────────────────────────────────
let map = null;
let currentLayer = "max_temp";
let indiaGeoData = null;
let choroplethLayer = null;   // Leaflet GeoJSON layer (border-only interaction)
let wxCanvas = null;   // Animated weather canvas
let wxCtx = null;
let animId = null;
let mapCtr = null;
let _wxThrottleTimer = null;   // throttle handle for weather rebuilds
let _cachedZoomFactor = 1;     // cached per-frame zoom factor
let _isMapMoving = false;      // true during zoom/pan — animation paused for smoothness
let _lastFrameTime = 0;        // for delta-time animation

// Load cloud image asset
const cloudImg = new Image();
cloudImg.src = "cloud.png";
let cloudImgLoaded = false;
cloudImg.onload = () => { cloudImgLoaded = true; };

// ── IMD 0.25°×0.25° GRID RASTER ENGINE ────────────────────────
let rasterOverlay = null;      // L.imageOverlay for the temperature PNG
const IMD_GRID = {
  latMin: 6.0,  latMax: 38.0,
  lonMin: 68.0, lonMax: 98.0,
  step: 0.25,
  rows: 129,    // (38-6)/0.25 + 1
  cols: 121,    // (98-68)/0.25 + 1
  data: null    // Float32Array [row * cols + col]
};
const RASTER_W = 800;
const RASTER_H = 850;

let clouds = [], rain = [];

// ═══════════════════════════════════════════════════════════════
//  SAMPLE STATE DATA
// ═══════════════════════════════════════════════════════════════
const STATE_WEATHER = {
  // name                       maxT  minT  rain  cloud  hasRain hasWind
  "Jammu & Kashmir": { maxTemp: 22, minTemp: 10, rainfall: 8, cloud: 0.22, hasRain: false, hasWind: false },
  "Himachal Pradesh": { maxTemp: 27, minTemp: 14, rainfall: 15, cloud: 0.33, hasRain: false, hasWind: false },
  "Uttarakhand": { maxTemp: 29, minTemp: 17, rainfall: 22, cloud: 0.44, hasRain: false, hasWind: false },
  "Punjab": { maxTemp: 40, minTemp: 27, rainfall: 3, cloud: 0.08, hasRain: false, hasWind: false },
  "Haryana": { maxTemp: 42, minTemp: 28, rainfall: 2, cloud: 0.06, hasRain: false, hasWind: false },
  "NCT of Delhi": { maxTemp: 43, minTemp: 29, rainfall: 1, cloud: 0.07, hasRain: false, hasWind: false },
  "Rajasthan": { maxTemp: 46, minTemp: 31, rainfall: 0, cloud: 0.03, hasRain: false, hasWind: false },
  "Uttar Pradesh": { maxTemp: 39, minTemp: 27, rainfall: 8, cloud: 0.22, hasRain: false, hasWind: false },
  "Bihar": { maxTemp: 37, minTemp: 26, rainfall: 18, cloud: 0.33, hasRain: false, hasWind: false },
  "Jharkhand": { maxTemp: 35, minTemp: 24, rainfall: 32, cloud: 0.50, hasRain: true, hasWind: true },
  "Madhya Pradesh": { maxTemp: 40, minTemp: 26, rainfall: 12, cloud: 0.25, hasRain: false, hasWind: false },
  "Chhattisgarh": { maxTemp: 36, minTemp: 24, rainfall: 38, cloud: 0.52, hasRain: true, hasWind: true },
  "West Bengal": { maxTemp: 33, minTemp: 25, rainfall: 48, cloud: 0.62, hasRain: true, hasWind: true },
  "Orissa": { maxTemp: 35, minTemp: 25, rainfall: 42, cloud: 0.57, hasRain: true, hasWind: true },
  "Assam": { maxTemp: 30, minTemp: 22, rainfall: 92, cloud: 0.92, hasRain: true, hasWind: true },
  "Meghalaya": { maxTemp: 24, minTemp: 17, rainfall: 98, cloud: 0.93, hasRain: true, hasWind: true },
  "Nagaland": { maxTemp: 26, minTemp: 18, rainfall: 76, cloud: 0.82, hasRain: true, hasWind: true },
  "Manipur": { maxTemp: 26, minTemp: 18, rainfall: 70, cloud: 0.78, hasRain: true, hasWind: true },
  "Mizoram": { maxTemp: 26, minTemp: 18, rainfall: 72, cloud: 0.79, hasRain: true, hasWind: true },
  "Tripura": { maxTemp: 30, minTemp: 22, rainfall: 65, cloud: 0.74, hasRain: true, hasWind: true },
  "Arunachal Pradesh": { maxTemp: 22, minTemp: 14, rainfall: 58, cloud: 0.70, hasRain: true, hasWind: true },
  "Sikkim": { maxTemp: 20, minTemp: 12, rainfall: 55, cloud: 0.68, hasRain: true, hasWind: true },
  "Gujarat": { maxTemp: 32, minTemp: 26, rainfall: 18, cloud: 0.55, hasRain: true, hasWind: true },
  "Maharashtra": { maxTemp: 32, minTemp: 23, rainfall: 72, cloud: 0.80, hasRain: true, hasWind: true },
  "Goa": { maxTemp: 30, minTemp: 23, rainfall: 88, cloud: 0.89, hasRain: true, hasWind: true },
  "Karnataka": { maxTemp: 31, minTemp: 22, rainfall: 75, cloud: 0.82, hasRain: true, hasWind: true },
  "Kerala": { maxTemp: 28, minTemp: 22, rainfall: 98, cloud: 0.95, hasRain: true, hasWind: true },
  "Tamil Nadu": { maxTemp: 37, minTemp: 27, rainfall: 20, cloud: 0.33, hasRain: false, hasWind: false },
  "Andhra Pradesh": { maxTemp: 37, minTemp: 25, rainfall: 24, cloud: 0.40, hasRain: false, hasWind: false },
  "Telangana": { maxTemp: 39, minTemp: 25, rainfall: 16, cloud: 0.28, hasRain: false, hasWind: false },
  "Andaman & Nicobar Island": { maxTemp: 30, minTemp: 24, rainfall: 68, cloud: 0.76, hasRain: true, hasWind: true },
  "Lakshadweep": { maxTemp: 29, minTemp: 24, rainfall: 74, cloud: 0.79, hasRain: true, hasWind: true },
  "Chandigarh": { maxTemp: 40, minTemp: 27, rainfall: 3, cloud: 0.08, hasRain: false, hasWind: false },
  "Puducherry": { maxTemp: 36, minTemp: 26, rainfall: 22, cloud: 0.35, hasRain: false, hasWind: false },
  "Dadra & Nagar Haveli": { maxTemp: 38, minTemp: 25, rainfall: 45, cloud: 0.60, hasRain: true, hasWind: true },
  "Daman & Diu": { maxTemp: 38, minTemp: 25, rainfall: 40, cloud: 0.55, hasRain: true, hasWind: true },
};
const STATE_FALLBACK = { maxTemp: 35, minTemp: 24, rainfall: 15, cloud: 0.30, hasRain: false, hasWind: false };

const STATE_CENTERS = {
  "Jammu & Kashmir": [34.0, 76.5], "Himachal Pradesh": [31.8, 77.1],
  "Uttarakhand": [30.3, 79.0], "Punjab": [31.0, 75.3],
  "Haryana": [29.0, 76.0], "NCT of Delhi": [28.7, 77.1],
  "Rajasthan": [27.0, 73.5], "Uttar Pradesh": [26.5, 80.5],
  "Bihar": [25.5, 85.5], "Jharkhand": [23.5, 85.3],
  "Madhya Pradesh": [23.5, 77.0], "Chhattisgarh": [21.5, 81.5],
  "West Bengal": [23.0, 87.5], "Orissa": [20.5, 84.3],
  "Assam": [26.2, 92.5], "Meghalaya": [25.3, 91.3],
  "Nagaland": [26.0, 94.3], "Manipur": [24.5, 93.8],
  "Mizoram": [23.5, 92.8], "Tripura": [23.8, 91.8],
  "Arunachal Pradesh": [28.0, 94.5], "Sikkim": [27.5, 88.5],
  "Gujarat": [22.5, 71.5], "Maharashtra": [19.0, 75.5],
  "Goa": [15.4, 74.0], "Karnataka": [14.5, 75.5],
  "Kerala": [10.5, 76.0], "Tamil Nadu": [11.0, 78.5],
  "Andhra Pradesh": [16.0, 79.5], "Telangana": [17.5, 79.0],
  "Andaman & Nicobar Island": [11.5, 92.7],
  "Lakshadweep": [9.5, 72.5], "Chandigarh": [30.7, 76.8],
  "Dadra & Nagar Haveli": [20.2, 73.0], "Daman & Diu": [20.4, 72.8],
};

function getStateData(feature) {
  const rawName = feature.properties.STNAME_SH || feature.properties.STNAME || feature.properties.NAME_1 || feature.properties.ST_NM || "";
  let name = rawName.trim();

  if (name === "Odisha") name = "Orissa";
  if (name === "Delhi") name = "NCT of Delhi";
  if (name === "Andaman & Nicobar") name = "Andaman & Nicobar Island";
  if (name === "Ladakh") name = "Jammu & Kashmir";

  return STATE_WEATHER[name] || STATE_WEATHER[rawName] || STATE_FALLBACK;
}

function getLayerValue(data) {
  if (currentLayer === "min_temp") return data.minTemp;
  if (currentLayer === "rainfall") return data.rainfall;
  return data.maxTemp;
}

function scaleColor(val, scale) {
  const t = Math.max(0, Math.min(1, (val - scale.min) / (scale.max - scale.min)));
  const N = scale.stops.length;
  const pos = t * (N - 1);
  const lo = Math.min(Math.floor(pos), N - 2);
  const frac = pos - lo;
  const A = hexToRgb(scale.stops[lo]);
  const B = hexToRgb(scale.stops[lo + 1]);
  return `rgb(${Math.round(A.r + (B.r - A.r) * frac)},${Math.round(A.g + (B.g - A.g) * frac)},${Math.round(A.b + (B.b - A.b) * frac)})`;
}

// ── HEATMAP OVERLAY & IDW INTERPOLATION ─────────────────────────
function getStateValue(stateName, layer) {
  const data = STATE_WEATHER[stateName] || STATE_FALLBACK;
  if (layer === "min_temp") return data.minTemp;
  if (layer === "rainfall") return data.rainfall;
  return data.maxTemp;
}

function getRGBColor(value, scale) {
  const { min, max, stops } = scale;
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const idx = t * (stops.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, stops.length - 1);
  const frac = idx - lo;

  const c1 = hexToRgb(stops[lo]);
  const c2 = hexToRgb(stops[hi]);
  return {
    r: Math.round(c1.r + (c2.r - c1.r) * frac),
    g: Math.round(c1.g + (c2.g - c1.g) * frac),
    b: Math.round(c1.b + (c2.b - c1.b) * frac)
  };
}

function interpolateValue(lat, lon, layer) {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const [stateName, center] of Object.entries(STATE_CENTERS)) {
    const val = getStateValue(stateName, layer);
    const dLat = lat - center[0];
    const dLon = lon - center[1];
    const distSq = dLat * dLat + dLon * dLon;

    if (distSq < 0.0001) {
      return val;
    }

    const weight = 1 / distSq;
    weightedSum += val * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

function drawGeoJsonPath(ctx) {
  if (!indiaGeoData) return;

  ctx.beginPath();
  indiaGeoData.features.forEach(feature => {
    const geom = feature.geometry;
    if (!geom) return;

    if (geom.type === "Polygon") {
      drawPolygon(ctx, geom.coordinates);
    } else if (geom.type === "MultiPolygon") {
      geom.coordinates.forEach(polyCoords => {
        drawPolygon(ctx, polyCoords);
      });
    }
  });
}

function drawPolygon(ctx, rings) {
  rings.forEach(ring => {
    if (ring.length < 3) return;

    const p0 = map.latLngToContainerPoint([ring[0][1], ring[0][0]]);
    ctx.moveTo(p0.x, p0.y);

    for (let i = 1; i < ring.length; i++) {
      const p = map.latLngToContainerPoint([ring[i][1], ring[i][0]]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  });
}

// ── GAUSSIAN BLUR for smooth contour heatmap ──────────────────
function gaussianBlurImageData(imgData, w, h, radius) {
  const pixels = imgData.data;
  const tempData = new Uint8ClampedArray(pixels.length);

  const kernel = buildGaussianKernel(radius);
  const kLen = kernel.length;
  const kHalf = Math.floor(kLen / 2);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < kLen; k++) {
        const sx = Math.min(w - 1, Math.max(0, x + k - kHalf));
        const idx = (y * w + sx) * 4;
        const weight = kernel[k];
        r += pixels[idx] * weight;
        g += pixels[idx + 1] * weight;
        b += pixels[idx + 2] * weight;
        a += pixels[idx + 3] * weight;
      }
      const dIdx = (y * w + x) * 4;
      tempData[dIdx] = r;
      tempData[dIdx + 1] = g;
      tempData[dIdx + 2] = b;
      tempData[dIdx + 3] = a;
    }
  }

  // Vertical pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < kLen; k++) {
        const sy = Math.min(h - 1, Math.max(0, y + k - kHalf));
        const idx = (sy * w + x) * 4;
        const weight = kernel[k];
        r += tempData[idx] * weight;
        g += tempData[idx + 1] * weight;
        b += tempData[idx + 2] * weight;
        a += tempData[idx + 3] * weight;
      }
      const dIdx = (y * w + x) * 4;
      pixels[dIdx] = r;
      pixels[dIdx + 1] = g;
      pixels[dIdx + 2] = b;
      pixels[dIdx + 3] = a;
    }
  }
}

function buildGaussianKernel(radius) {
  const sigma = radius / 2;
  const size = radius * 2 + 1;
  const kernel = new Float32Array(size);
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum;
  return kernel;
}

// ═══════════════════════════════════════════════════════════════
//  IMD 0.25°×0.25° RASTER RENDERING ENGINE
//  Populates a dense lat/lon grid via IDW from station data,
//  then renders bilinear-interpolated continuous raster,
//  clips to India GeoJSON boundary, and overlays as L.imageOverlay.
// ═══════════════════════════════════════════════════════════════

/** Populate the 0.25° grid from current layer's station/state data */
function buildIMDGrid() {
  const { latMax, lonMin, step, rows, cols } = IMD_GRID;
  IMD_GRID.data = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    const lat = latMax - r * step;
    for (let c = 0; c < cols; c++) {
      const lon = lonMin + c * step;
      IMD_GRID.data[r * cols + c] = interpolateValue(lat, lon, currentLayer);
    }
  }
}

/** Bilinear interpolation between 4 surrounding grid cells */
function bilinearSample(lat, lon) {
  const { latMax, lonMin, step, rows, cols, data } = IMD_GRID;
  if (!data) return null;

  const row = (latMax - lat) / step;
  const col = (lon - lonMin) / step;

  if (row < 0 || row >= rows - 1 || col < 0 || col >= cols - 1) return null;

  const r0 = Math.floor(row);
  const c0 = Math.floor(col);
  const r1 = r0 + 1;
  const c1 = c0 + 1;
  const fr = row - r0;
  const fc = col - c0;

  const v00 = data[r0 * cols + c0];
  const v01 = data[r0 * cols + c1];
  const v10 = data[r1 * cols + c0];
  const v11 = data[r1 * cols + c1];

  return v00 * (1 - fr) * (1 - fc) + v01 * (1 - fr) * fc +
         v10 * fr * (1 - fc) + v11 * fr * fc;
}

/** Convert geographic coordinates to raster pixel coordinates */
function geoToPixel(lon, lat) {
  const { latMin, latMax, lonMin, lonMax } = IMD_GRID;
  return {
    x: ((lon - lonMin) / (lonMax - lonMin)) * RASTER_W,
    y: ((latMax - lat) / (latMax - latMin)) * RASTER_H
  };
}

/** Draw India GeoJSON boundary as a clip path on the raster canvas */
function drawGeoClipPath(ctx) {
  if (!indiaGeoData) return;
  ctx.beginPath();
  indiaGeoData.features.forEach(feature => {
    const geom = feature.geometry;
    if (!geom) return;
    const processRings = (rings) => {
      rings.forEach(ring => {
        if (ring.length < 3) return;
        const p0 = geoToPixel(ring[0][0], ring[0][1]);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < ring.length; i++) {
          const p = geoToPixel(ring[i][0], ring[i][1]);
          ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
      });
    };
    if (geom.type === "Polygon") processRings(geom.coordinates);
    else if (geom.type === "MultiPolygon") geom.coordinates.forEach(processRings);
  });
}

/**
 * Core raster rendering pipeline:
 *  1. Build 0.25° IMD grid from current climate data
 *  2. Bilinear-interpolate every pixel → continuous temperature field
 *  3. Clip to India boundary via canvas composite masking
 *  4. Export as transparent PNG → L.imageOverlay
 */
function renderRasterOverlay() {
  if (!indiaGeoData || !map) return;

  // 1. Populate grid from current climate data (dynamic)
  buildIMDGrid();

  const scale = COLOR_SCALES[currentLayer];
  const { latMin, latMax, lonMin, lonMax } = IMD_GRID;

  // 2. Render bilinear-interpolated raster
  const rCanvas = document.createElement("canvas");
  rCanvas.width = RASTER_W;
  rCanvas.height = RASTER_H;
  const rCtx = rCanvas.getContext("2d");

  const imgData = rCtx.createImageData(RASTER_W, RASTER_H);
  const pixels = imgData.data;

  for (let y = 0; y < RASTER_H; y++) {
    const lat = latMax - (y / (RASTER_H - 1)) * (latMax - latMin);
    for (let x = 0; x < RASTER_W; x++) {
      const lon = lonMin + (x / (RASTER_W - 1)) * (lonMax - lonMin);
      const val = bilinearSample(lat, lon);
      if (val === null) continue;

      const color = getRGBColor(val, scale);
      const idx = (y * RASTER_W + x) * 4;
      pixels[idx]     = color.r;
      pixels[idx + 1] = color.g;
      pixels[idx + 2] = color.b;
      pixels[idx + 3] = 215;
    }
  }

  rCtx.putImageData(imgData, 0, 0);

  // 3. Clip to India boundary via composite masking
  const clipCanvas = document.createElement("canvas");
  clipCanvas.width = RASTER_W;
  clipCanvas.height = RASTER_H;
  const clipCtx = clipCanvas.getContext("2d");

  // Draw India mask shape
  clipCtx.fillStyle = "#ffffff";
  drawGeoClipPath(clipCtx);
  clipCtx.fill("evenodd");

  // Composite: keep raster only inside India boundary
  clipCtx.globalCompositeOperation = "source-in";
  clipCtx.drawImage(rCanvas, 0, 0);

  // 4. Export as transparent PNG data URL
  const dataUrl = clipCanvas.toDataURL("image/png");

  // 5. Create or update L.imageOverlay
  const bounds = [[latMin, lonMin], [latMax, lonMax]];
  if (rasterOverlay) {
    rasterOverlay.setUrl(dataUrl);
  } else {
    rasterOverlay = L.imageOverlay(dataUrl, bounds, {
      opacity: 0.92,
      interactive: false,
      pane: "rasterPane",
      className: "imd-raster-overlay"
    }).addTo(map);
  }
}

// Legacy compatibility stubs (no longer used but may be called by event listeners)
function drawHeatmap() {}
function initHeatmapCanvas() {}

// ═══════════════════════════════════════════════════════════════
//  PREMIUM VISUAL SKIN
//  Chrome/UI polish (tooltip, HUD, legend, sonar, ocean labels,
//  vignette) now lives in styles.css alongside the rest of the
//  design system — see the "MAP PANEL" and "HOT ZONE GLOW" sections
//  there. This function is intentionally a no-op so map.js never
//  fights the real stylesheet with duplicate/!important rules.
// ═══════════════════════════════════════════════════════════════
function injectPremiumStyles() { /* styling now owned by styles.css */ }

function addOceanLabels() {
  if (!map) return;
  const labels = [
    { name: "ARABIAN SEA", coords: [15.0, 66.5] },
    { name: "BAY OF BENGAL", coords: [15.0, 89.5] },
    { name: "INDIAN OCEAN", coords: [5.0, 78.5] }
  ];
  labels.forEach(l => {
    L.marker(l.coords, {
      icon: L.divIcon({
        className: "ocean-label",
        html: l.name,
        iconSize: [200, 30],
        iconAnchor: [100, 15]
      }),
      interactive: false
    }).addTo(map);
  });
}

// ═══════════════════════════════════════════════════════════════
//  INIT MAP
// ═══════════════════════════════════════════════════════════════
function initMap() {
  injectPremiumStyles();
  mapCtr = document.getElementById("india-map");
  const r = REGION_INFO["all"];

  map = L.map("india-map", {
    center: [r.lat, r.lon], zoom: r.zoom,
    zoomControl: true, attributionControl: true,
    minZoom: 4, maxZoom: 12,
  });

  // Space Satellite Imagery Basemap (Esri World Imagery — HD Ocean & Terrain View)
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Esri World Imagery | ISRO RIT",
    maxZoom: 19,
  }).addTo(map);

  // Custom Leaflet pane for the IMD raster (sits below borders, above tiles)
  map.createPane("rasterPane");
  map.getPane("rasterPane").style.zIndex = 390;
  map.getPane("rasterPane").style.pointerEvents = "none";

  initWeatherCanvas();

  fetch("india.geojson")
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(geo => {
      indiaGeoData = geo;
      buildChoropleth();
      buildWeatherEffects();
      startAnim();
      updateLegend(COLOR_SCALES["max_temp"], "max_temp");

      autoInitAmbientFromData();
    })
    .catch(err => {
      console.error("GeoJSON failed:", err);
      startAnim();
      updateLegend(COLOR_SCALES["max_temp"], "max_temp");
      autoInitAmbientFromData();
    });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd", maxZoom: 19, zIndex: 700,
    pane: "overlayPane",
  }).addTo(map);

  addOceanLabels();

  map.on("zoomstart movestart", () => {
    _isMapMoving = true;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
  });

  map.on("zoomend moveend", () => {
    _isMapMoving = false;
    const throttledBuildWx = () => {
      if (_wxThrottleTimer) clearTimeout(_wxThrottleTimer);
      _wxThrottleTimer = setTimeout(() => {
        _wxThrottleTimer = null;
        buildWeatherEffects();
        if (!animId) startAnim();
      }, 80);
    };
    throttledBuildWx();
  });
}

function autoInitAmbientFromData() {
  const regionSelect = document.getElementById("region-select");
  const regionKey = regionSelect?.value || "ahmedabad";
  if (typeof updateKPIsForRegion === "function") {
    updateKPIsForRegion(regionKey);
  }
}

// ═══════════════════════════════════════════════════════════════
//  MAP VISUALIZATION — IMD RASTER + BORDER OVERLAYS
//  Temperature is rendered as a continuous bilinear-interpolated
//  raster PNG (L.imageOverlay). State borders are transparent
//  GeoJSON outlines above the raster for hover/tooltip/click.
// ═══════════════════════════════════════════════════════════════
function buildChoropleth() {
  if (!indiaGeoData || !map) return;

  // Clean up previous layers
  if (choroplethLayer) map.removeLayer(choroplethLayer);
  if (window._glowLayers) window._glowLayers.forEach(l => map.removeLayer(l));
  window._glowLayers = [];
  // Note: rasterOverlay is reused (setUrl), not removed

  // ── 1. RENDER THE IMD RASTER OVERLAY ──────────────────────────
  renderRasterOverlay();

  // ── 2. STATE BORDERS — transparent outlines for interaction ───
  choroplethLayer = L.geoJSON(indiaGeoData, {
    style: () => ({
      fillColor: "transparent",
      fillOpacity: 0.0,
      color: "rgba(55, 65, 81, 0.65)",
      weight: 0.7
    }),
    onEachFeature: (feature, layer) => {
      layer.on("mouseover", () => layer.setStyle({
        weight: 1.4, color: "rgba(255, 255, 255, 0.85)", fillColor: "rgba(255,255,255,0.06)", fillOpacity: 0.08
      }));
      layer.on("mouseout", () => layer.setStyle({
        weight: 0.7, color: "rgba(55, 65, 81, 0.65)", fillColor: "transparent", fillOpacity: 0.0
      }));

      const d = getStateData(feature);
      const name = feature.properties.NAME_1 || "–";
      layer.bindTooltip(
        `<div class="map-tooltip-inner">
           <strong>${name}</strong>
           <span>Max ${d.maxTemp}°C · Min ${d.minTemp}°C</span>
           <span>Rain ${d.rainfall} mm/day</span>
         </div>`,
        { className: "map-tooltip", sticky: true }
      );

      layer.on("mouseover", (e) => {
        if (mapCtr && e.latlng) {
          const pt = map.latLngToContainerPoint(e.latlng);

          const ping1 = document.createElement("div");
          ping1.className = "sonar-ping-marker";
          ping1.style.left = pt.x + "px";
          ping1.style.top = pt.y + "px";
          mapCtr.appendChild(ping1);
          setTimeout(() => ping1.remove(), 1400);

          setTimeout(() => {
            const ping2 = document.createElement("div");
            ping2.className = "sonar-ping-marker sonar-ring-2";
            ping2.style.left = pt.x + "px";
            ping2.style.top = pt.y + "px";
            mapCtr.appendChild(ping2);
            setTimeout(() => ping2.remove(), 1400);
          }, 200);

          const dot = document.createElement("div");
          dot.className = "sonar-center-dot";
          dot.style.left = pt.x + "px";
          dot.style.top = pt.y + "px";
          mapCtr.appendChild(dot);
          setTimeout(() => dot.remove(), 800);
        }

        if (typeof updateAmbientWeatherState === "function") {
          updateAmbientWeatherState(d.maxTemp, d.minTemp, d.rainfall);
        }
      });
    }
  }).addTo(map);

  // ── 3. PREMIUM NATIONAL OUTLINE — soft cyan glow ─────────────
  const outlineLayer = L.geoJSON(indiaGeoData, {
    style: {
      fillOpacity: 0,
      color: "#B9FFFF",
      weight: 1.3,
      opacity: 0.85,
      className: "india-premium-outline"
    },
    interactive: false
  }).addTo(map);
  window._glowLayers.push(outlineLayer);
}

// ═══════════════════════════════════════════════════════════════
//  WEATHER CANVAS (IMAGE CLOUDS USING `cloud.png` + RAIN)
// ═══════════════════════════════════════════════════════════════
function initWeatherCanvas() {
  wxCanvas = document.createElement("canvas");
  wxCanvas.id = "wx-canvas";
  wxCanvas.style.cssText = `
    position:absolute; top:0; left:0;
    width:100%; height:100%;
    pointer-events:none; z-index:450;
  `;
  mapCtr.appendChild(wxCanvas);
  wxCtx = wxCanvas.getContext("2d");

  const resize = () => {
    wxCanvas.width = mapCtr.offsetWidth;
    wxCanvas.height = mapCtr.offsetHeight;
  };
  resize();
  window.addEventListener("resize", resize);
  map.on("resize", resize);
}

function buildWeatherEffects() {
  clouds = [];
  rain = [];
  if (windArcs.length === 0) buildWindArcs();
  if (!map) return;

  Object.entries(STATE_WEATHER).forEach(([stateName, data]) => {
    const center = STATE_CENTERS[stateName];
    if (!center) return;
    const [lat, lon] = center;

    // ── DYNAMIC CLOUDS & RAIN (WHEREVER RAINFALL > 0 MM) ──
    if (data.rainfall > 0) {
      const severity = Math.min(1, data.rainfall / 100);
      const numClouds = data.rainfall < 15 ? 1 : data.rainfall < 50 ? 2 : 3;
      const isStorm = data.rainfall >= 35;
      const isMonsoon = lon > 78;
      const windAngle = isMonsoon ? (Math.PI * 0.75 + Math.random() * 0.2) : (Math.PI * 0.5 + Math.random() * 0.3);

      for (let i = 0; i < numClouds; i++) {
        const angle = (i / numClouds) * Math.PI * 2 + Math.random();
        const dist = 0.2 + Math.random() * 0.4;
        const latOff = Math.cos(angle) * dist;
        const lonOff = Math.sin(angle) * dist * 1.3;

        clouds.push({
          baseLat: lat + latOff,
          baseLon: lon + lonOff,
          dLon: 0,
          dLat: 0,
          speedLon: Math.cos(windAngle) * (0.00012 + Math.random() * 0.00015),
          speedLat: Math.sin(windAngle) * (0.00006 + Math.random() * 0.00008),
          maxDrift: 0.7 + Math.random() * 0.3,
          width: isStorm ? 65 + Math.random() * 30 : 45 + Math.random() * 25,
          height: isStorm ? 38 + Math.random() * 18 : 28 + Math.random() * 15,
          opacity: isStorm ? Math.min(0.95, 0.70 + severity * 0.25) : Math.min(0.85, 0.45 + severity * 0.35),
          turbSeed: Math.random() * Math.PI * 2,
          turbSpeed: 0.8 + Math.random() * 1.2,
          isStorm
        });
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
//  ANIMATION LOOP
// ═══════════════════════════════════════════════════════════════
function startAnim() {
  if (animId) cancelAnimationFrame(animId);
  if (_isMapMoving) return;
  _lastFrameTime = performance.now();
  (function frame(now) {
    if (_isMapMoving) { animId = null; return; }
    const dt = Math.min((now - _lastFrameTime) / 16.67, 3);
    _lastFrameTime = now;
    drawWeather(dt, now);
    animId = requestAnimationFrame(frame);
  })(performance.now());
}

function drawWeather(dt, now) {
  if (!wxCtx || !wxCanvas || !map) return;
  const zoom = map.getZoom();
  _cachedZoomFactor = Math.max(0.6, Math.min(4.0, Math.pow(1.28, zoom - 5)));
  wxCtx.clearRect(0, 0, wxCanvas.width, wxCanvas.height);
  drawWindArcs(wxCtx, dt, now);
  drawCloudSprites(wxCtx, dt, now);
}

function drawRainParticles(ctx, dt) {
  // Rain particles on map removed per user request
}

// ── CLOUDS USING `cloud.png` IMAGE ASSET ─────────────────────
function drawCloudSprites(ctx, dt, now) {
  if (!cloudImgLoaded) return;
  const zf = _cachedZoomFactor;
  const time = now * 0.001;

  if (showCloudsOnMap) {
    clouds.forEach(c => {
    c.dLon += c.speedLon * dt;
    c.dLat += c.speedLat * dt;

    const turbX = Math.sin(time * c.turbSpeed + c.turbSeed) * 0.0004;
    const turbY = Math.cos(time * c.turbSpeed * 0.8 + c.turbSeed) * 0.0003;

    if (Math.abs(c.dLon) > c.maxDrift) {
      c.speedLon = -Math.abs(c.speedLon) * Math.sign(c.dLon);
    }

    const px = map.latLngToContainerPoint([
      c.baseLat + c.dLat + turbY,
      c.baseLon + c.dLon + turbX
    ]);

    const w = c.width * zf;
    const h = c.height * zf;

    ctx.save();
    ctx.globalAlpha = c.opacity;

    if (c.isStorm) {
      // Dark stormy tint with a cool electric rim, echoes storm-front lighting
      ctx.filter = "brightness(0.6) contrast(1.3) saturate(1.15) drop-shadow(0px 10px 16px rgba(5,15,35,0.65)) drop-shadow(0px 0px 10px rgba(70,150,255,0.18))";
    } else {
      // Crisp bright cloud with a soft warm-white glow
      ctx.filter = "brightness(1.1) contrast(1.05) drop-shadow(0px 5px 12px rgba(0,0,0,0.3)) drop-shadow(0px 0px 8px rgba(255,255,255,0.12))";
    }

    ctx.drawImage(cloudImg, px.x - w / 2, px.y - h / 2, w, h);
    ctx.filter = "none";
    ctx.restore();
  });
  } // end if (showCloudsOnMap)
  ctx.globalAlpha = 1;
}

// ═══════════════════════════════════════════════════════════════
//  WIND-FLOW ARCS — signature premium element: glowing animated
//  monsoon flow lines sweeping over the map with traveling light
//  particles, echoing the reference art's isobar/wind streams.
// ═══════════════════════════════════════════════════════════════
let windArcs = [];

function buildWindArcs() {
  windArcs = [
    { from: [8.5, 68.0], to: [26.0, 82.0], ctrl: [16.0, 68.0], speed: 0.09, particles: 3 },
    { from: [11.0, 72.0], to: [29.0, 88.0], ctrl: [19.0, 74.0], speed: 0.075, particles: 3 },
    { from: [14.0, 78.0], to: [30.5, 92.0], ctrl: [22.0, 82.0], speed: 0.06, particles: 2 },
    { from: [9.0, 88.0], to: [27.0, 91.5], ctrl: [16.0, 92.0], speed: 0.08, particles: 2 },
  ];
}

function quadPoint(p0, c, p1, t) {
  const mt = 1 - t;
  return [
    mt * mt * p0[0] + 2 * mt * t * c[0] + t * t * p1[0],
    mt * mt * p0[1] + 2 * mt * t * c[1] + t * t * p1[1],
  ];
}

function drawWindArcs(ctx, dt, now) {
  if (!map || !showCloudsOnMap || windArcs.length === 0) return;
  const zoom = map.getZoom();
  if (zoom > 8) return; // only show at country/regional scale
  const t = now * 0.001;
  const fadeByZoom = Math.max(0, Math.min(1, (8 - zoom) / 2));

  windArcs.forEach((arc, i) => {
    const steps = 40;
    const pts = [];
    for (let s = 0; s <= steps; s++) {
      const tt = s / steps;
      const [lat, lon] = quadPoint(arc.from, arc.ctrl, arc.to, tt);
      pts.push(map.latLngToContainerPoint([lat, lon]));
    }

    ctx.save();
    ctx.globalAlpha = 0.30 * fadeByZoom;
    ctx.strokeStyle = "rgba(140,225,255,0.9)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 7]);
    ctx.lineDashOffset = -(t * 40) % 9;
    ctx.beginPath();
    pts.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // traveling glow particles along the arc
    for (let p = 0; p < arc.particles; p++) {
      const phase = (t * arc.speed + p / arc.particles + i * 0.13) % 1;
      const [lat, lon] = quadPoint(arc.from, arc.ctrl, arc.to, phase);
      const pt = map.latLngToContainerPoint([lat, lon]);
      const edgeFade = Math.sin(phase * Math.PI); // fade in/out at ends

      ctx.save();
      ctx.globalAlpha = 0.85 * edgeFade * fadeByZoom;
      const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 6);
      grad.addColorStop(0, "rgba(220,250,255,1)");
      grad.addColorStop(1, "rgba(0,180,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
}

let showCloudsOnMap = true;
function toggleMapClouds(enabled) {
  showCloudsOnMap = enabled;
  if (!enabled && wxCtx && wxCanvas) {
    wxCtx.clearRect(0, 0, wxCanvas.width, wxCanvas.height);
  }
}

function toggleMapCloudsBtn() {
  const cb = document.getElementById("cloud-toggle-checkbox");
  const newState = !showCloudsOnMap;
  if (cb) cb.checked = newState;
  toggleMapClouds(newState);

  const btn = document.getElementById("btn-toggle-clouds");
  if (btn) {
    btn.classList.toggle("active", newState);
  }
}

function toggleMapHUD() {
  const huds = document.querySelectorAll(".map-hud");
  const btn = document.getElementById("btn-toggle-hud");
  let isHidden = false;
  huds.forEach(hud => {
    hud.classList.toggle("hud-hidden");
    if (hud.classList.contains("hud-hidden")) isHidden = true;
  });
  if (btn) {
    btn.classList.toggle("active", !isHidden);
    btn.title = isHidden ? "Show Map HUD Controls" : "Hide Map HUD Controls";
  }
}

// ═══════════════════════════════════════════════════════════════
//  LAYER SWITCHING & NAVIGATION
// ═══════════════════════════════════════════════════════════════
function renderGrid(layerKey) {
  currentLayer = layerKey;
  buildChoropleth();
  updateLegend(COLOR_SCALES[layerKey], layerKey);
}

function switchLayer(layerKey) {
  renderGrid(layerKey);
  document.querySelectorAll(".layer-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.layer === layerKey)
  );
}

function updateLegend(scale) {
  const g = document.getElementById("legend-gradient");
  const mn = document.getElementById("legend-min");
  const mid = document.getElementById("legend-mid");
  const mx = document.getElementById("legend-max");
  if (!g) return;
  g.style.background = `linear-gradient(90deg,${scale.stops.join(",")})`;
  mn.textContent = scale.min + scale.unit;
  mid.textContent = scale.midLabel;
  mx.textContent = scale.max + scale.unit;
}

function flyToRegion(regionKey) {
  const city = (typeof MASTER_CITIES !== "undefined" && MASTER_CITIES[regionKey])
    ? MASTER_CITIES[regionKey]
    : (REGION_INFO[regionKey] || REGION_INFO["all"]);

  if (city) {
    const zoomLevel = regionKey === "all" ? 5 : 8;
    map.flyTo([city.lat, city.lon], zoomLevel, { animate: true, duration: 1.2 });
  }
}

function updateChartsForRegion(regionKey) {
  const off = {
    ahmedabad: { max: 3, min: 2 }, delhi: { max: 5, min: 3 },
    mumbai: { max: -2, min: -1 }, chennai: { max: -1, min: -2 },
    kolkata: { max: 1, min: 1 }, bengaluru: { max: -4, min: -3 },
    jaipur: { max: 7, min: 4 }, bhubaneswar: { max: 2, min: 0 },
  }[regionKey] || { max: 0, min: 0 };

  updateTempChartData(
    FORECAST_7DAY.map(d => +(d.max_temp + off.max + (Math.random() - .5)).toFixed(1)),
    FORECAST_7DAY.map(d => +(d.min_temp + off.min + (Math.random() - .5)).toFixed(1))
  );
}