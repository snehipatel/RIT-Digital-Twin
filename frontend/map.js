/**
 * map.js — India Climate Digital Twin
 *
 * ARCHITECTURE (fixes all bleeding issues):
 *  1. Leaflet GeoJSON CHOROPLETH fills each state polygon with its temperature
 *     colour → geometrically IMPOSSIBLE to bleed outside India borders.
 *  2. Separate canvas layer for weather (clouds / rain).
 *     Every particle is anchored to a specific state centre and CANNOT
 *     drift beyond a hard pixel radius from that centre.
 */

// ── GLOBALS ────────────────────────────────────────────────────
let map = null;
let currentLayer = "max_temp";
let indiaGeoData = null;
let choroplethLayer = null;   // Leaflet GeoJSON layer (fills state polygons)
let wxCanvas = null;   // Animated weather canvas
let wxCtx = null;
let hmCanvas = null;   // Continuous heatmap canvas
let hmCtx = null;
let animId = null;
let mapCtr = null;
let _hmThrottleTimer = null;   // throttle handle for heatmap redraws
let _wxThrottleTimer = null;   // throttle handle for weather rebuilds
let _cachedZoomFactor = 1;     // cached per-frame zoom factor
let _isMapMoving = false;      // true during zoom/pan — animation paused for smoothness

const offscreenCanvas = document.createElement("canvas");
offscreenCanvas.width = 100;
offscreenCanvas.height = 80;
const offscreenCtx = offscreenCanvas.getContext("2d", { willReadFrequently: true });

let clouds = [], rain = [];

// ═══════════════════════════════════════════════════════════════
//  SAMPLE STATE DATA
//  Keys MUST match NAME_1 property in geohacker India GeoJSON.
//  Replace values with real model outputs on Day 5.
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
  "Gujarat": { maxTemp: 40, minTemp: 27, rainfall: 9, cloud: 0.20, hasRain: false, hasWind: true },
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

// Geographic centre of each state for placing weather icons
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

// Helper: get data for a GeoJSON feature
function getStateData(feature) {
  const rawName = feature.properties.STNAME_SH || feature.properties.STNAME || feature.properties.NAME_1 || feature.properties.ST_NM || "";
  let name = rawName.trim();

  // Normalization mappings to align GeoJSON properties with STATE_WEATHER database keys
  if (name === "Odisha") name = "Orissa";
  if (name === "Delhi") name = "NCT of Delhi";
  if (name === "Andaman & Nicobar") name = "Andaman & Nicobar Island";
  if (name === "Ladakh") name = "Jammu & Kashmir";

  return STATE_WEATHER[name] || STATE_WEATHER[rawName] || STATE_FALLBACK;
}

// Helper: get display value for current layer
function getLayerValue(data) {
  if (currentLayer === "min_temp") return data.minTemp;
  if (currentLayer === "rainfall") return data.rainfall;
  return data.maxTemp;
}

// ── COLOUR HELPER ──────────────────────────────────────────────
// Returns "rgb(r,g,b)" suitable for Leaflet fillColor
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

// Wind field removed — no wind visualisation

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

function initHeatmapCanvas() {
  hmCanvas = document.createElement("canvas");
  hmCanvas.id = "heatmap-canvas";
  hmCanvas.style.cssText = `
    position:absolute; top:0; left:0;
    width:100%; height:100%;
    pointer-events:none; z-index:410;
  `;
  mapCtr.appendChild(hmCanvas);
  hmCtx = hmCanvas.getContext("2d");

  const resize = () => {
    hmCanvas.width = mapCtr.offsetWidth;
    hmCanvas.height = mapCtr.offsetHeight;
    drawHeatmap();
  };
  resize();
  window.addEventListener("resize", resize);
  map.on("resize", resize);

  // Throttle heatmap redraws during pan/zoom to reduce CPU load
  const throttledDrawHeatmap = () => {
    if (_hmThrottleTimer) return;
    _hmThrottleTimer = setTimeout(() => {
      _hmThrottleTimer = null;
      drawHeatmap();
    }, 60);
  };
  map.on("move zoom viewreset", throttledDrawHeatmap);
}

function drawHeatmap() {
  if (!hmCtx || !hmCanvas || !map || !indiaGeoData) return;

  const width = hmCanvas.width;
  const height = hmCanvas.height;
  hmCtx.clearRect(0, 0, width, height);

  const bounds = map.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const latMin = sw.lat;
  const latMax = ne.lat;
  const lonMin = sw.lng;
  const lonMax = ne.lng;

  const gw = offscreenCanvas.width;
  const gh = offscreenCanvas.height;
  const imgData = offscreenCtx.createImageData(gw, gh);
  const data = imgData.data;

  const scale = COLOR_SCALES[currentLayer];

  for (let y = 0; y < gh; y++) {
    const lat = latMax - (y / (gh - 1)) * (latMax - latMin);
    for (let x = 0; x < gw; x++) {
      const lon = lonMin + (x / (gw - 1)) * (lonMax - lonMin);

      const val = interpolateValue(lat, lon, currentLayer);
      const color = getRGBColor(val, scale);

      const idx = (y * gw + x) * 4;
      data[idx] = color.r;
      data[idx + 1] = color.g;
      data[idx + 2] = color.b;
      data[idx + 3] = 160; // Beautiful translucent layer for dark mode integration
    }
  }
  offscreenCtx.putImageData(imgData, 0, 0);

  hmCtx.save();
  drawGeoJsonPath(hmCtx);
  hmCtx.clip("evenodd");
  hmCtx.drawImage(offscreenCanvas, 0, 0, width, height);
  hmCtx.restore();
}

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
  mapCtr = document.getElementById("india-map");
  const r = REGION_INFO["all"];

  map = L.map("india-map", {
    center: [r.lat, r.lon], zoom: r.zoom,
    zoomControl: true, attributionControl: true,
    minZoom: 4, maxZoom: 12,
  });

  // Dark base tiles — no labels (labels come from separate layer on top)
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
    attribution: "© OpenStreetMap | © CartoDB | ISRO RIT",
    subdomains: "abcd", maxZoom: 19,
  }).addTo(map);

  // Create the weather-effects canvas
  initWeatherCanvas();
  initHeatmapCanvas();

  // Load LOCAL india.geojson (served by python -m http.server, zero latency, no CORS)
  fetch("india.geojson")
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(geo => {
      indiaGeoData = geo;
      buildChoropleth();
      drawHeatmap();
      buildWeatherEffects();
      startAnim();
      updateLegend(COLOR_SCALES["max_temp"], "max_temp");
    })
    .catch(err => {
      console.error("GeoJSON failed:", err);
      // Still start the animation (weather effects won't have choropleth)
      startAnim();
      updateLegend(COLOR_SCALES["max_temp"], "max_temp");
    });

  // Dark labels on top of everything
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd", maxZoom: 19, zIndex: 700,
    pane: "overlayPane",
  }).addTo(map);

  addOceanLabels();

  // ── INTERACTION PERF: pause canvas animation during zoom/pan ──
  // Leaflet animates tiles via CSS transforms (GPU, free). Our canvas
  // calls latLngToContainerPoint each frame which is expensive during
  // the CSS zoom animation. Pausing the RAF loop eliminates the stutter.
  map.on("zoomstart movestart", () => {
    _isMapMoving = true;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
  });

  map.on("zoomend moveend", () => {
    _isMapMoving = false;
    // Rebuild particle positions after map settles, then resume animation
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

// ═══════════════════════════════════════════════════════════════
//  CHOROPLETH — state polygons filled with temperature colour
//  ✓ Zero bleeding: Leaflet clips the fill to the polygon path.
// ═══════════════════════════════════════════════════════════════
function buildChoropleth() {
  if (!indiaGeoData || !map) return;

  // Remove previous
  if (choroplethLayer) map.removeLayer(choroplethLayer);
  if (window._glowLayers) window._glowLayers.forEach(l => map.removeLayer(l));
  window._glowLayers = [];

  const scale = COLOR_SCALES[currentLayer];

  // ── FILL LAYER ──
  choroplethLayer = L.geoJSON(indiaGeoData, {
    style: feature => ({
      fillColor: scaleColor(getLayerValue(getStateData(feature)), scale),
      fillOpacity: 0.0,
      color: "rgba(0,220,255,0.0)",  // no border on fill layer (separate glow pass)
      weight: 0,
    }),
    onEachFeature: (feature, layer) => {
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
    }
  }).addTo(map);

  // ── BORDER GLOW (3 passes for neon effect) ──
  const borderStyles = [
    { color: "rgba(0,212,255,0.06)", weight: 14 },
    { color: "rgba(0,212,255,0.22)", weight: 4 },
    { color: "#00e5ff", weight: 1.3, opacity: 0.88 },
  ];
  borderStyles.forEach(style => {
    const l = L.geoJSON(indiaGeoData, { style: { ...style, fillOpacity: 0 } }).addTo(map);
    window._glowLayers.push(l);
  });
}

// ═══════════════════════════════════════════════════════════════
//  WEATHER CANVAS  (clouds / rain / wind)
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

// ── Spawn weather particles for each state ──
function buildWeatherEffects() {
  clouds = [];
  rain = [];
  if (!map) return;

  Object.entries(STATE_WEATHER).forEach(([stateName, data]) => {
    const center = STATE_CENTERS[stateName];
    if (!center) return;
    const [lat, lon] = center;

    // ── CLOUDS ── max 2 per state, strictly near center
    //   Heavy cloud (≥0.60): dark gray-blue storm cloud — large regional size
    //   Light  cloud (0.25–0.59): white fair-weather cloud — medium regional size
    //   Clear  (< 0.25): none
    const numC = data.cloud < 0.25 ? 0 : data.cloud < 0.60 ? 1 : 2;
    const storm = data.cloud >= 0.60;

    for (let i = 0; i < numC; i++) {
      // Place clouds near state centre but slightly offset
      const angle = (i / numC) * Math.PI * 2 + Math.random();
      const latOff = Math.cos(angle) * (0.2 + Math.random() * 0.5);
      const lonOff = Math.sin(angle) * (0.3 + Math.random() * 0.7);
      clouds.push({
        baseLat: lat + latOff,
        baseLon: lon + lonOff,
        dLon: (Math.random() - 0.3) * 0.2,   // initial drift phase
        maxDrift: 0.6,                         // max lon drift
        // Increased sizes: storm 28–42px, fair 20–32px (regional weather system scale)
        size: storm ? 28 + Math.random() * 14
          : 20 + Math.random() * 12,
        opacity: storm ? 0.70 + data.cloud * 0.22
          : 0.48 + data.cloud * 0.28,
        speed: 0.00012 + Math.random() * 0.0001,
        storm,
        homeLat: lat, homeLon: lon
      });
    }

    // ── RAIN ── only hasRain states, confined to ±55px of state centre
    // Reduced particle count for performance (capped at 30)
    if (data.hasRain) {
      const n = Math.min(Math.round(data.rainfall * 0.28), 30);
      for (let i = 0; i < n; i++) {
        rain.push({
          ox: (Math.random() - 0.5) * 110,   // ±55px horizontal
          oy: Math.random() * 100,            // 0–100px vertical cycle
          cLat: lat,
          cLon: lon,
          len: 4 + Math.random() * 5,
          spd: 2.0 + Math.random() * 2.5,
          opa: 0.18 + Math.random() * 0.28,
          sinA: Math.sin((9 + Math.random() * 8) * Math.PI / 180),
          cosA: Math.cos((9 + Math.random() * 8) * Math.PI / 180),
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
  if (_isMapMoving) return;  // don't start if map is mid-transition
  (function frame() {
    if (_isMapMoving) { animId = null; return; }  // stop if zoom starts
    drawWeather();
    animId = requestAnimationFrame(frame);
  })();
}

function drawWeather() {
  if (!wxCtx || !wxCanvas || !map) return;
  // Cache zoom factor once per frame
  const zoom = map.getZoom();
  _cachedZoomFactor = Math.max(0.6, Math.min(4.0, Math.pow(1.28, zoom - 5)));
  wxCtx.clearRect(0, 0, wxCanvas.width, wxCanvas.height);
  drawRain(wxCtx);
  drawClouds(wxCtx);
}

// Wind rendering removed — wind particles/streamlines have been eliminated

// ── RAIN (strictly within ±55px of state centre) ──────────────
// Batched by opacity bucket to minimise ctx state changes
function drawRain(ctx) {
  // Group rain drops by centre point to batch latLngToContainerPoint calls
  // (each unique cLat/cLon pair is looked up once)
  const baseCache = new Map();

  ctx.lineWidth = 0.7;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(170,215,255,0.9)";

  rain.forEach(d => {
    d.oy = (d.oy + d.spd) % 100;

    const key = d.cLat + "|" + d.cLon;
    let base = baseCache.get(key);
    if (!base) {
      base = map.latLngToContainerPoint([d.cLat, d.cLon]);
      baseCache.set(key, base);
    }

    const x = base.x + d.ox + d.oy * d.sinA * 0.18;
    const y = base.y - 40 + d.oy;

    ctx.globalAlpha = d.opa;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + d.sinA * d.len, y + d.cosA * d.len);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

// ── CLOUDS (anchored to state centres) ────────────────────────
function drawClouds(ctx) {
  // Use cached zoom factor computed once per frame in drawWeather()
  const zf = _cachedZoomFactor;

  clouds.forEach(c => {
    c.dLon += c.speed;
    // Bounce back within maxDrift degrees
    if (Math.abs(c.dLon) > c.maxDrift) c.speed = -Math.abs(c.speed) * Math.sign(c.dLon);

    const px = map.latLngToContainerPoint([c.baseLat, c.baseLon + c.dLon]);
    ctx.globalAlpha = c.opacity;
    paintCloud(ctx, px.x, px.y, c.size * zf, c.storm);
  });
  ctx.globalAlpha = 1;
}

function paintCloud(ctx, cx, cy, s, storm) {
  // ── CLOUD SILHOUETTE ─────────────────────────────────────────
  // All bumps drawn in ONE beginPath + ONE fill → unified crisp shape.
  // Single linear gradient instead of 4 radial gradients → 4× faster.
  // No alpha fade-to-zero edges → defined cloud boundary, not cotton.
  ctx.beginPath();
  // Base layer — wide flat body
  ctx.arc(cx, cy + s * 0.08, s * 0.44, 0, Math.PI * 2);
  ctx.arc(cx - s * 0.40, cy + s * 0.12, s * 0.30, 0, Math.PI * 2);
  ctx.arc(cx + s * 0.40, cy + s * 0.12, s * 0.30, 0, Math.PI * 2);
  // Top bumps — give the classic cumulus silhouette
  ctx.arc(cx - s * 0.16, cy - s * 0.18, s * 0.34, 0, Math.PI * 2);
  ctx.arc(cx + s * 0.22, cy - s * 0.24, s * 0.30, 0, Math.PI * 2);
  // Top-left shoulder
  ctx.arc(cx - s * 0.42, cy - s * 0.06, s * 0.23, 0, Math.PI * 2);

  // One linear gradient top→bottom for the whole cloud
  const g = ctx.createLinearGradient(cx, cy - s * 0.6, cx, cy + s * 0.5);
  if (storm) {
    g.addColorStop(0, "rgba(195,200,225,0.96)");
    g.addColorStop(0.40, "rgba(140,150,195,0.94)");
    g.addColorStop(0.80, "rgba(100,112,168,0.90)");
    g.addColorStop(1, "rgba(75, 88, 148,0.88)");
  } else {
    g.addColorStop(0, "rgba(255,255,255,0.97)");
    g.addColorStop(0.40, "rgba(242,248,255,0.95)");
    g.addColorStop(0.80, "rgba(220,236,252,0.90)");
    g.addColorStop(1, "rgba(195,218,245,0.85)");
  }
  ctx.fillStyle = g;
  ctx.fill();

  // Thin highlight stroke for a crisp top edge
  ctx.strokeStyle = storm
    ? "rgba(210,215,240,0.30)"
    : "rgba(255,255,255,0.55)";
  ctx.lineWidth = 0.6;
  ctx.stroke();

  // Bottom shadow strip — gives flat-base depth
  ctx.beginPath();
  ctx.ellipse(cx, cy + s * 0.28, s * 0.68, s * 0.13, 0, 0, Math.PI * 2);
  const sh = ctx.createLinearGradient(cx, cy + s * 0.15, cx, cy + s * 0.45);
  sh.addColorStop(0, storm ? "rgba(55,65,125,0.38)" : "rgba(130,165,210,0.28)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sh;
  ctx.fill();
}

// ═══════════════════════════════════════════════════════════════
//  LAYER SWITCHING
// ═══════════════════════════════════════════════════════════════
function renderGrid(layerKey) {
  currentLayer = layerKey;
  buildChoropleth();
  drawHeatmap();
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

// ═══════════════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════════════
function flyToRegion(regionKey) {
  const r = REGION_INFO[regionKey] || REGION_INFO["all"];
  map.flyTo([r.lat, r.lon], r.zoom, { animate: true, duration: 1.2 });
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
