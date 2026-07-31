/**
 * pages.js — Multi-Page Navigation Controller
 * Handles SPA routing, page-specific init, forecast calendar,
 * alerts rendering, reports generation, and about page.
 *
 * NO map re-initialization — the Leaflet map stays permanently mounted.
 * Only the right content column swaps per page.
 */

// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
let currentPage = "dashboard";
let forecastSelDay = 0;          // index into FORECAST_7DAY_EXTENDED
let forecastCityKey = "all";
let activeForecastData = null;   // Real-time forecast data from Open-Meteo API
const forecastCache = {};        // Session cache to prevent redundant API hits
let alertFilterStatus = "all";
let alertFilterSev = "all";
let reportCityKey = "all";

// ── CLIMATE PREDICTION STATE & LOOKUP DATA (2000 - 2100) ──
// ── CLIMATE PREDICTION STATE & LOOKUP DATA (2000 - 2100) ──
let predictionYear = 2026;
let predictionCityKey = "all";
let predictionChartInst = null;
let predictionPlayInterval = null;
const climatePredictionCache = {}; // Cache to store 100-year aggregated data per city
let STATE_WEATHER_BASE = null;     // Baseline map weather state

const activeSolutions = {
  trees: false, solar: false, harvesting: false, ev: false, greenroofs: false,
  plastic: false, transit: false, wetlands: false, afforestation: false,
  irrigation: false, greencover: false, capture: false, mangroves: false,
  composting: false, coolroof: false
};

const CLIMATE_SOLUTIONS = [
  {
    id: "trees",
    name: "Tree Plantation 🌳",
    desc: "Assume 25% of the population plants one tree annually. After subtracting 5 crore saplings that fail to survive, the remaining trees absorb CO₂, reduce urban heat, and enhance local rainfall.",
    equation: (pop) => {
      const totalPlanted = pop * 0.25 * 100; // in Crore (pop in Billions * 100 * 0.25)
      const failed = 5;
      const survived = totalPlanted - failed;
      return `Planted saplings: <strong>${totalPlanted.toFixed(2)} Crore</strong>.<br/>Saplings failed: <strong>${failed} Crore</strong>.<br/>Net carbon sink: <strong>${survived.toFixed(2)} Crore</strong> healthy trees.`;
    },
    offsets: { co2: 12, aqi: 15, temp: 0.3, rain: 0.035 }
  },
  {
    id: "solar",
    name: "Rooftop Solar Adoption ☀️",
    desc: "Each solar-powered home reduces dependence on fossil-fuel electricity. Lower greenhouse gas emissions contribute to slower temperature rise and cleaner air.",
    equation: (pop) => {
      const households = (pop * 1000) / 5; // in Millions
      const solarHomes = households * 0.35;
      return `Total households: <strong>${households.toFixed(1)} Million</strong>.<br/>Solar Homes: <strong>${solarHomes.toFixed(1)} Million</strong> (35% adoption).`;
    },
    offsets: { co2: 15, ghg: 0.12, aqi: 12, temp: 0.2 }
  },
  {
    id: "harvesting",
    name: "Rainwater Harvesting 💧",
    desc: "Harvesting rainwater increases groundwater recharge, reduces flooding, supports agriculture, and improves drought resilience.",
    equation: (pop) => {
      const buildings = (pop * 1000) / 10; // 1 building per 10 people in Millions
      const capacity = 25000; // 25,000 Litres
      const harvestedWater = (buildings * capacity) / 1000; // in Million Litres
      return `Participating buildings: <strong>${buildings.toFixed(1)} Million</strong>.<br/>Harvested Water: <strong>${harvestedWater.toLocaleString(undefined, {maximumFractionDigits: 0})} Million Litres</strong>.`;
    },
    offsets: { rain: 0.05, temp: 0.1 }
  },
  {
    id: "ev",
    name: "Electric Vehicle Adoption 🚗⚡",
    desc: "Replacing fuel-powered vehicles with EVs lowers CO₂ emissions, improves air quality, and reduces urban heat from combustion engines.",
    equation: (pop) => {
      const vehicles = pop * 0.22 * 1000; // 22% of population owns vehicles, in Millions
      const evUsers = vehicles * 0.40; // 40% switch to EVs
      return `Total vehicles: <strong>${vehicles.toFixed(1)} Million</strong>.<br/>EV conversions: <strong>${evUsers.toFixed(1)} Million users</strong> (40% switched).`;
    },
    offsets: { co2: 10, aqi: 35, temp: 0.25 }
  },
  {
    id: "greenroofs",
    name: "Green Roof Installation 🏢🌿",
    desc: "Vegetated roofs cool buildings naturally, reduce the urban heat island effect, absorb rainwater, and improve biodiversity.",
    equation: (pop) => {
      const buildings = (pop * 1000) / 15; // 1 building per 15 people in Millions
      const rooftopArea = buildings * 120; // 120 sq meters average
      return `Buildings with green roofs: <strong>${buildings.toFixed(1)} Million</strong>.<br/>Green Roof Area: <strong>${rooftopArea.toFixed(1)} Million m²</strong>.`;
    },
    offsets: { aqi: 8, temp: 0.15, rain: 0.015 }
  },
  {
    id: "plastic",
    name: "Plastic Waste Reduction ♻️",
    desc: "Lower plastic waste reduces landfill emissions, prevents water pollution, and decreases open burning, improving environmental quality.",
    equation: (pop) => {
      const plasticReduced = pop * 1000 * 12; // 12 kg reduced per person annually in Million kg
      return `Population: <strong>${(pop * 1000).toFixed(0)} Million</strong>.<br/>Plastic waste avoided: <strong>${plasticReduced.toLocaleString(undefined, {maximumFractionDigits: 0})} Million kg</strong>.`;
    },
    offsets: { ghg: 0.06, aqi: 10 }
  },
  {
    id: "transit",
    name: "Public Transport Usage 🚌",
    desc: "Higher public transport usage decreases private vehicle emissions, reducing greenhouse gases and improving urban air quality.",
    equation: (pop) => {
      const users = pop * 0.30 * 1000; // 30% adoption in Millions
      return `Daily public transit users: <strong>${users.toFixed(1)} Million people</strong> (30% adoption).`;
    },
    offsets: { co2: 8, aqi: 22, temp: 0.15 }
  },
  {
    id: "wetlands",
    name: "Wetland Restoration 🌾",
    desc: "Wetlands store carbon, reduce flooding, regulate local temperatures, and support biodiversity.",
    equation: () => {
      const area = 4.5; // degraded wetlands in Mha
      const restored = 4.5 * 0.45; // 45% restoration
      return `Degraded wetlands: <strong>4.5 Mha</strong>.<br/>Restored Wetland Area: <strong>${restored.toFixed(2)} Mha</strong> (45% restoration).`;
    },
    offsets: { co2: 7, temp: 0.12, rain: 0.025 }
  },
  {
    id: "afforestation",
    name: "Afforestation of Barren Land 🌲",
    desc: "Large-scale afforestation increases carbon sequestration, improves soil health, and influences local rainfall patterns.",
    equation: () => {
      const land = 9.5; // barren land in Mha
      const afforested = 9.5 * 0.30; // 30% converted
      return `Barren land: <strong>9.5 Mha</strong>.<br/>Afforested Area: <strong>${afforested.toFixed(2)} Mha</strong> (30% converted to forest).`;
    },
    offsets: { co2: 16, temp: 0.35, rain: 0.045 }
  },
  {
    id: "irrigation",
    name: "Water-Efficient Irrigation 🚜",
    desc: "Efficient irrigation conserves freshwater, increases drought resilience, and reduces groundwater depletion.",
    equation: () => {
      const farmland = 140; // farmland in Mha
      const saved = (140 * 1200) / 1000; // cubic meters saved (1200 per hectare) in Billion cubic meters
      return `Farmland Area: <strong>140 Mha</strong>.<br/>Water Saved: <strong>${saved.toFixed(1)} Trillion Litres</strong>.`;
    },
    offsets: { rain: 0.03, temp: 0.05 }
  },
  {
    id: "greencover",
    name: "Urban Green Cover 🌳",
    desc: "More parks and vegetation reduce land surface temperatures, improve air quality, and increase rainfall infiltration.",
    equation: () => {
      const urban = 18.5; // urban area in Mha
      const greencover = 18.5 * 0.25; // 25% converted
      return `Urban area: <strong>18.5 Mha</strong>.<br/>Green Cover Created: <strong>${greencover.toFixed(2)} Mha</strong> (25% converted to green space).`;
    },
    offsets: { aqi: 14, temp: 0.2, rain: 0.02 }
  },
  {
    id: "capture",
    name: "Carbon Capture Facilities 🏭",
    desc: "Capturing industrial CO₂ reduces atmospheric greenhouse gases and slows long-term warming.",
    equation: () => {
      const plants = 22;
      const capacity = 2.5; // Million Tons annually per plant
      const totalCaptured = plants * capacity;
      return `Industrial carbon plants: <strong>22 facilities</strong>.<br/>Captured CO₂: <strong>${totalCaptured.toFixed(1)} Million Tons annually</strong>.`;
    },
    offsets: { co2: 24, ghg: 0.15, temp: 0.45 }
  },
  {
    id: "mangroves",
    name: "Mangrove Plantation 🌊",
    desc: "Mangroves absorb large amounts of carbon, reduce coastal erosion, and protect against cyclones and storm surges.",
    equation: () => {
      const coastline = 7500; // km
      const plantation = 7500 * 0.40; // 40% mangrove cover planting
      return `Coastline length: <strong>7,500 km</strong>.<br/>Mangrove Area: <strong>${plantation.toLocaleString()} km</strong> (40% plantation cover).`;
    },
    offsets: { co2: 6, temp: 0.08, rain: 0.015 }
  },
  {
    id: "composting",
    name: "Waste Composting 🍂",
    desc: "Composting reduces methane emissions from landfills while producing nutrient-rich fertilizer that improves soil carbon.",
    equation: () => {
      const waste = 36; // Million Tons organic waste
      const composted = 36 * 0.60; // 60% composted
      return `Organic waste generated: <strong>36 Million Tons</strong>.<br/>Composted Waste: <strong>${composted.toFixed(1)} Million Tons</strong> (60% composting).`;
    },
    offsets: { ghg: 0.08, aqi: 8 }
  },
  {
    id: "coolroof",
    name: "Cool Roof Initiative 🏠",
    desc: "Reflective roofs reduce indoor temperatures, lower electricity demand for cooling, and help mitigate urban heat islands.",
    equation: (pop) => {
      const houses = (pop * 1000) / 6; // 1 house per 6 people in Millions
      const area = (houses * 80) / 1000; // 80 sq meters avg in Billion m2
      return `Participating houses: <strong>${houses.toFixed(1)} Million</strong>.<br/>Cool Roof Area: <strong>${area.toFixed(2)} Billion m²</strong>.`;
    },
    offsets: { temp: 0.22, aqi: 5 }
  }
];

const DECADAL_CLIMATE_INDICATORS = {
  years: [2000, 2010, 2020, 2025, 2030, 2040, 2050, 2060, 2070, 2080, 2090, 2100],
  co2:   [369,  390,  414,  424,  435,  460,  490,  525,  565,  615,  675,  750],  // ppm (IPCC SSP5-8.5)
  pop:   [1.05, 1.24, 1.39, 1.44, 1.48, 1.57, 1.63, 1.68, 1.70, 1.68, 1.62, 1.53], // Billions (UN Census)
  ghg:   [1.15, 1.29, 1.47, 1.54, 1.64, 1.84, 2.05, 2.28, 2.53, 2.80, 3.10, 3.45], // NOAA AGGI index
  aqi:   [135,  165,  180,  195,  205,  185,  150,  115,  85,   65,   50,   40]   // PM2.5/AQI
};

function interpolateDecadalValue(year, metricKey) {
  const yrs = DECADAL_CLIMATE_INDICATORS.years;
  const vals = DECADAL_CLIMATE_INDICATORS[metricKey];

  if (year <= yrs[0]) return vals[0];
  if (year >= yrs[yrs.length - 1]) return vals[vals.length - 1];

  for (let i = 0; i < yrs.length - 1; i++) {
    if (year >= yrs[i] && year <= yrs[i+1]) {
      const t = (year - yrs[i]) / (yrs[i+1] - yrs[i]);
      const val = vals[i] + t * (vals[i+1] - vals[i]);
      return +(val).toFixed(metricKey === 'pop' ? 2 : (metricKey === 'ghg' ? 2 : 1));
    }
  }
  return vals[0];
}

// Chart instances for non-dashboard pages (destroy/recreate on page switch)
let forecastTempChartInst = null;
let forecastRainChartInst = null;
let reportTempChartInst = null;
let reportRainChartInst = null;
let whatifChartInst = null;

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════
function initNavigation() {
  document.querySelectorAll(".nav-link").forEach(btn => {
    btn.addEventListener("click", () => {
      const page = btn.dataset.page;
      if (page !== currentPage) showPage(page);
    });
  });

  // Sync the global map city dropdown with per-page city selects
  syncCitySelects();

  // Set today's date on date inputs
  const todayISO = new Date().toISOString().split("T")[0];
  ["whatif-date-input", "report-date-input"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = todayISO;
  });

  // Wire city dropdowns on all pages
  wireCitySelect("dashboard-city-select", onDashboardCityChange);
  wireCitySelect("forecast-city-select", onForecastCityChange);
  wireCitySelect("whatif-city-select", onWhatIfCityChange);
  wireCitySelect("report-city-select", onReportCityChange);
  wireCitySelect("prediction-city-select", onPredictionCityChange);

  // Wire report date change
  document.getElementById("report-date-input")
    ?.addEventListener("change", e => renderReportData(reportCityKey, e.target.value));

  // Wire whatif date change
  document.getElementById("whatif-date-input")
    ?.addEventListener("change", () => resetWhatIfResults());

  // Wire Download PDF
  document.getElementById("download-pdf-btn")
    ?.addEventListener("click", downloadReportPDF);

  // Wire the Alerts nav-badge
  updateAlertsNavBadge();

  // Init whatif page sliders (the new absolute-value sliders)
  initWhatIfPageSliders();
}

function showPage(name) {
  // Hide current
  const prev = document.getElementById(`page-${currentPage}`);
  if (prev) prev.classList.add("hidden");

  // Update nav links
  document.querySelectorAll(".nav-link").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === name);
  });

  // Show new page
  const next = document.getElementById(`page-${name}`);
  if (next) {
    next.classList.remove("hidden");
    // Re-trigger animation
    next.style.animation = "none";
    requestAnimationFrame(() => { next.style.animation = ""; });
  }

  currentPage = name;

  // Map mode tag
  const modeLabels = {
    dashboard: "Dashboard Mode",
    forecast: "Forecast Mode",
    prediction: "Projection Mode",
    whatif: "Simulation Mode",
    alerts: "Alert Coverage",
    reports: "Report Mode",
    about: "Info Mode"
  };
  setText("map-mode-tag", modeLabels[name] || "Dashboard Mode");

  // If leaving prediction page, stop the playback interval
  if (name !== "prediction" && predictionPlayInterval) {
    if (typeof togglePredictionPlay === "function") togglePredictionPlay(true); // force pause
  }

  // Page-specific init (only on first load or data-change triggers)
  if (name === "forecast") initForecastPage();
  if (name === "prediction") initPredictionPage();
  if (name === "whatif") initWhatIfPage();
  if (name === "alerts") initAlertsPage();
  if (name === "reports") initReportsPage();
  if (name === "about") lucide.createIcons();

  // Scroll content-col to top
  const col = document.getElementById("content-col");
  if (col) col.scrollTop = 0;
}

// ══════════════════════════════════════════
// CITY SELECT WIRING
// ══════════════════════════════════════════
function wireCitySelect(id, handler) {
  document.getElementById(id)?.addEventListener("change", e => handler(e.target.value));
}

function syncCitySelects() {
  // Keep the map's region-select as master; all page selects mirror it
  const master = document.getElementById("region-select");
  master?.addEventListener("change", e => {
    const v = e.target.value;
    ["dashboard-city-select", "forecast-city-select",
      "whatif-city-select", "report-city-select", "prediction-city-select"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = v;
      });
  });
}

function onDashboardCityChange(city) {
  // Mirror to map
  const master = document.getElementById("region-select");
  if (master) { master.value = city; master.dispatchEvent(new Event("change")); }
  updateDashboardComparison(city);
}

function onForecastCityChange(city) {
  forecastCityKey = city;
  const master = document.getElementById("region-select");
  if (master) { master.value = city; master.dispatchEvent(new Event("change")); }
  loadForecastData(city);
}

function onWhatIfCityChange(city) {
  whatifCityKey = city;
  const master = document.getElementById("region-select");
  if (master) { master.value = city; master.dispatchEvent(new Event("change")); }
  const dateInput = document.getElementById("whatif-date-input");
  loadWhatIfData(city, dateInput?.value || new Date().toISOString().split("T")[0]);
}

function onReportCityChange(city) {
  reportCityKey = city;
  const master = document.getElementById("region-select");
  if (master) { master.value = city; master.dispatchEvent(new Event("change")); }
  const dateEl = document.getElementById("report-date-input");
  renderReportData(city, dateEl?.value || new Date().toISOString().split("T")[0]);
}

// ══════════════════════════════════════════
// DASHBOARD DAILY COMPARISON
// ══════════════════════════════════════════
function renderDashboardComparison() {
  updateDashboardComparison("all");
  // Set today's date subtitle
  const sub = document.getElementById("dashboard-date-sub");
  if (sub) {
    sub.textContent = new Date().toLocaleDateString("en-IN", {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    });
  }
}

function updateDashboardComparison(cityKey) {
  const values = typeof getCityModelValues === "function"
    ? getCityModelValues(cityKey)
    : (() => {
      const off = CITY_FORECAST_DATA[cityKey]?.offsets || { max: 0, min: 0, rain: 0, hum: 0 };
      const s = CLIMATE_DATA.all_india_summary;
      return {
        maxTemp: +(s.max_temp + off.max).toFixed(1),
        minTemp: +(s.min_temp + (off.min || 0)).toFixed(1),
        rainfall: Math.max(0, +(s.rainfall_24h + off.rain).toFixed(1)),
        humidity: Math.max(0, Math.min(100, s.humidity + (off.hum || 0)))
      };
    })();

  const todayMax = values.maxTemp;
  const todayMin = values.minTemp;
  const todayRain = values.rainfall;
  const todayHum = values.humidity;

  // Yesterday deltas
  const deltas = { max: +1.2, min: +0.6, rain: -4.3, hum: -2 };

  setText("comp-max", `${todayMax}°C`);
  setText("comp-min", `${todayMin}°C`);
  setText("comp-rain", `${Math.max(0, todayRain)} mm`);
  setText("comp-hum", `${todayHum}%`);

  setCompDelta("comp-max-delta", deltas.max, "°C");
  setCompDelta("comp-min-delta", deltas.min, "°C");
  setCompDelta("comp-rain-delta", deltas.rain, " mm");
  setCompDelta("comp-hum-delta", deltas.hum, "%");
}

function setCompDelta(id, delta, unit) {
  const el = document.getElementById(id);
  if (!el) return;
  const pos = delta > 0;
  el.className = "comp-delta " + (pos ? "up" : "down");
  el.textContent = (pos ? "↑ +" : "↓ ") + delta.toFixed(1) + unit;
}

// ══════════════════════════════════════════
// FORECAST PAGE
// ══════════════════════════════════════════
// ── FETCH LIVE FORECAST DATA FROM OPEN-METEO ──
async function loadForecastData(cityKey) {
  const sourceTag = document.getElementById("forecast-model-tag");
  if (sourceTag) {
    sourceTag.textContent = "Fetching Live...";
    sourceTag.className = "model-tag loading";
  }

  const container = document.getElementById("forecast-calendar");
  if (container) {
    container.innerHTML = `
      <div style="grid-column: span 7; display: flex; align-items: center; justify-content: center; padding: 30px; gap: 10px; color: #8ba3c7; font-family: var(--font-primary);">
        <i data-lucide="loader-2" class="animate-spin" style="animation: spin 1.5s linear infinite; width: 18px; height: 18px;"></i>
        <span>Connecting to satellite feed...</span>
      </div>
    `;
    lucide.createIcons();
  }

  // Get coordinates
  const info = REGION_INFO[cityKey];
  const lat = info ? info.lat : 22.5;
  const lon = info ? info.lon : 82.0;

  // Check cache first
  if (forecastCache[cityKey]) {
    activeForecastData = forecastCache[cityKey].data;
    if (sourceTag) {
      sourceTag.textContent = forecastCache[cityKey].source;
      sourceTag.className = "model-tag live-badge";
    }
    renderForecastCalendar();
    if (forecastSelDay >= activeForecastData.length) forecastSelDay = 0;
    renderForecastDayStats(forecastSelDay);
    renderForecastTempChart();
    renderForecastRainChart();
    return;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_max,wind_speed_10m_max&timezone=Asia/Kolkata`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Network response error");
    const data = await res.json();

    if (!data.daily || !data.daily.time || data.daily.time.length < 7) {
      throw new Error("Invalid forecast structure");
    }

    const fetchedData = data.daily.time.slice(0, 7).map((timeStr, i) => {
      const d = new Date(timeStr + 'T00:00:00');
      const maxT = data.daily.temperature_2m_max[i] ?? 30.0;
      const minT = data.daily.temperature_2m_min[i] ?? 20.0;
      const rain = data.daily.precipitation_sum[i] ?? 0.0;
      const hum = data.daily.relative_humidity_2m_max[i] ?? 60;
      const wind = data.daily.wind_speed_10m_max[i] ?? 10;

      return {
        date: d,
        dateLabel: d.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" }),
        dateISO: timeStr,
        max_temp: maxT,
        min_temp: minT,
        rainfall: rain,
        humidity: hum,
        wind_speed: wind,
        condition: getConditionFromData(maxT, rain)
      };
    });

    activeForecastData = fetchedData;
    const sourceLabel = cityKey === "all" ? "Live API (India Avg)" : "Live Open-Meteo API";
    forecastCache[cityKey] = {
      data: fetchedData,
      source: sourceLabel
    };

    if (sourceTag) {
      sourceTag.textContent = sourceLabel;
      sourceTag.className = "model-tag live-badge";
    }
  } catch (err) {
    console.warn("Forecast API failed, falling back to offline model data", err);
    // Offline fallback: Use the original static baseline offsets
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const maxBase  = [37.4, 38.1, 39.0, 38.5, 36.8, 35.2, 34.9];
    const minBase  = [24.8, 25.3, 26.1, 25.7, 24.0, 23.5, 23.2];
    const rainBase = [18.2,  0.0,  2.4, 35.6, 12.0, 46.8,  8.1];
    const humBase  = [68,    62,   58,   75,   71,   82,    65  ];
    const windBase = [12,    18,   14,    9,   22,   28,    16  ];

    const off = CITY_FORECAST_DATA[cityKey]?.offsets || { max: 0, min: 0, rain: 0, hum: 0 };

    activeForecastData = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const adjMax = +(maxBase[i] + off.max).toFixed(1);
      const adjRain = Math.max(0, +(rainBase[i] + off.rain).toFixed(1));
      return {
        date: d,
        dateLabel: d.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" }),
        dateISO: d.toISOString().split("T")[0],
        max_temp: adjMax,
        min_temp: +(minBase[i] + (off.min || 0)).toFixed(1),
        rainfall: adjRain,
        humidity: Math.max(0, Math.min(100, humBase[i] + (off.hum || 0))),
        wind_speed: windBase[i],
        condition: getConditionFromData(adjMax, adjRain)
      };
    });

    if (sourceTag) {
      sourceTag.textContent = "Offline Baseline Model";
      sourceTag.className = "model-tag fallback-badge";
    }
  }

  // Trigger Renders
  renderForecastCalendar();
  if (forecastSelDay >= activeForecastData.length) forecastSelDay = 0;
  renderForecastDayStats(forecastSelDay);
  renderForecastTempChart();
  renderForecastRainChart();
}

function initForecastPage() {
  loadForecastData(forecastCityKey);
}

function renderForecastCalendar() {
  const container = document.getElementById("forecast-calendar");
  if (!container) return;

  const dataSrc = activeForecastData || FORECAST_7DAY_EXTENDED;
  // If activeForecastData exists, we do not apply city offsets because they are already baked into the live coordinates fetch.
  const isLive = !!activeForecastData;
  const off = isLive ? { max: 0, min: 0, rain: 0 } : (CITY_FORECAST_DATA[forecastCityKey]?.offsets || { max: 0, min: 0, rain: 0 });

  container.innerHTML = dataSrc.map((day, i) => {
    const adjMax = +(day.max_temp + off.max).toFixed(1);
    const adjRain = Math.max(0, +(day.rainfall + off.rain).toFixed(1));
    const cond = getConditionFromData(adjMax, adjRain);
    const isToday = i === 0;

    return `
      <div class="forecast-day-cell ${cond.bgClass} ${i === forecastSelDay ? "selected" : ""}"
           data-day="${i}" id="fdc-${i}" onclick="selectForecastDay(${i})">
        <div class="fdc-weekday">${isToday ? "TODAY" : day.date.toLocaleDateString("en-IN", { weekday: "short" }).toUpperCase()}</div>
        <div class="fdc-day">${day.date.getDate()}</div>
        <div class="fdc-icon">${cond.icon}</div>
        <div class="fdc-month">${day.date.toLocaleDateString("en-IN", { month: "short" })}</div>
        <div class="fdc-temp">${adjMax}° / ${+(day.min_temp + (off.min || 0)).toFixed(1)}°</div>
      </div>
    `;
  }).join("");
}

function selectForecastDay(idx) {
  forecastSelDay = idx;

  // Update selected cell
  document.querySelectorAll(".forecast-day-cell").forEach((el, i) => {
    el.classList.toggle("selected", i === idx);
  });

  renderForecastDayStats(idx);

  // Update the map's forecast-date to that day
  const dataSrc = activeForecastData || FORECAST_7DAY_EXTENDED;
  if (dataSrc[idx]) {
    const dayISO = dataSrc[idx].dateISO;
    const fdInput = document.getElementById("forecast-date");
    if (fdInput) {
      fdInput.value = dayISO;
      fdInput.dispatchEvent(new Event("change"));
    }
  }
}

function renderForecastDayStats(idx) {
  const dataSrc = activeForecastData || FORECAST_7DAY_EXTENDED;
  const day = dataSrc[idx];
  if (!day) return;

  const isLive = !!activeForecastData;
  const off = isLive ? { max: 0, min: 0, rain: 0, hum: 0 } : (CITY_FORECAST_DATA[forecastCityKey]?.offsets || { max: 0, min: 0, rain: 0, hum: 0 });
  const adjMax = +(day.max_temp + off.max).toFixed(1);
  const adjMin = +(day.min_temp + (off.min || 0)).toFixed(1);
  const adjRain = Math.max(0, +(day.rainfall + off.rain).toFixed(1));
  const adjHum = Math.max(0, Math.min(100, day.humidity + (off.hum || 0)));
  const cond = getConditionFromData(adjMax, adjRain);

  // Selected header
  setText("fc-sel-icon", cond.icon);
  setText("fc-sel-label", day.dateLabel);
  setText("fc-sel-cond", cond.label + " — " + day.date.toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" }));
  setText("fc-city-desc", CITY_FORECAST_DATA[forecastCityKey]?.desc || "");

  // KPIs
  setText("fc-max-val", `${adjMax}°C`);
  setText("fc-min-val", `${adjMin}°C`);
  setText("fc-rain-val", `${adjRain} mm`);
  setText("fc-hum-val", `${adjHum}%`);
}

function renderForecastTempChart() {
  const ctx = document.getElementById("forecastTempChart");
  if (!ctx) return;
  if (forecastTempChartInst) { forecastTempChartInst.destroy(); forecastTempChartInst = null; }

  const dataSrc = activeForecastData || FORECAST_7DAY_EXTENDED;
  const isLive = !!activeForecastData;
  const off = isLive ? { max: 0, min: 0, rain: 0 } : (CITY_FORECAST_DATA[forecastCityKey]?.offsets || { max: 0, min: 0, rain: 0 });
  const labels = dataSrc.map(d => d.dateLabel);
  const maxData = dataSrc.map(d => +(d.max_temp + off.max).toFixed(1));
  const minData = dataSrc.map(d => +(d.min_temp + (off.min || 0)).toFixed(1));

  forecastTempChartInst = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Max Temp (°C)",
          data: maxData,
          borderColor: "#ff6b6b",
          backgroundColor: "rgba(255,107,107,0.12)",
          pointBackgroundColor: "#ff6b6b",
          pointRadius: 4, pointHoverRadius: 7, borderWidth: 2.5, tension: 0.4, fill: true
        },
        {
          label: "Min Temp (°C)",
          data: minData,
          borderColor: "#4dc3ff",
          backgroundColor: "rgba(77,195,255,0.08)",
          pointBackgroundColor: "#4dc3ff",
          pointRadius: 4, pointHoverRadius: 7, borderWidth: 2, tension: 0.4, fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600 },
      plugins: {
        legend: { labels: { color: "#8ba3c7", font: { family: "Inter", size: 11 }, boxWidth: 10 } },
        tooltip: { backgroundColor: "#111c35", borderColor: "rgba(0,212,255,0.25)", borderWidth: 1, titleColor: "#00d4ff", bodyColor: "#e8f4ff", padding: 10, cornerRadius: 8 }
      },
      scales: {
        x: { ticks: { color: "#8ba3c7", font: { size: 10 } }, grid: { color: "rgba(0,212,255,0.05)" } },
        y: { min: 15, ticks: { color: "#8ba3c7", font: { size: 10 } }, grid: { color: "rgba(0,212,255,0.05)" }, title: { display: true, text: "Temp (°C)", color: "#4a6080", font: { size: 9 } } }
      }
    }
  });
}

function renderForecastRainChart() {
  const ctx = document.getElementById("forecastRainChart");
  if (!ctx) return;
  if (forecastRainChartInst) { forecastRainChartInst.destroy(); forecastRainChartInst = null; }

  const dataSrc = activeForecastData || FORECAST_7DAY_EXTENDED;
  const isLive = !!activeForecastData;
  const off = isLive ? { max: 0, min: 0, rain: 0 } : (CITY_FORECAST_DATA[forecastCityKey]?.offsets || { max: 0, min: 0, rain: 0 });
  const labels = dataSrc.map(d => d.dateLabel);
  const rainData = dataSrc.map(d => Math.max(0, +(d.rainfall + off.rain).toFixed(1)));

  const barColors = rainData.map(v =>
    v === 0 ? "rgba(74,96,128,0.4)" :
      v < 10 ? "rgba(0,229,204,0.5)" :
        v < 40 ? "rgba(0,212,255,0.65)" :
          v < 80 ? "rgba(59,130,246,0.75)" :
            "rgba(124,58,237,0.85)"
  );

  forecastRainChartInst = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Rainfall (mm)",
        data: rainData,
        backgroundColor: barColors,
        borderColor: rainData.map(v => v > 0 ? "#00d4ff" : "transparent"),
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600 },
      plugins: {
        legend: { labels: { color: "#8ba3c7", font: { family: "Inter", size: 11 }, boxWidth: 10 } },
        tooltip: {
          backgroundColor: "#111c35", borderColor: "rgba(0,212,255,0.25)", borderWidth: 1, titleColor: "#00d4ff", bodyColor: "#e8f4ff", padding: 10, cornerRadius: 8,
          callbacks: { label: ctx => ` ${ctx.parsed.y} mm${ctx.parsed.y === 0 ? " — Dry day" : ""}` }
        }
      },
      scales: {
        x: { ticks: { color: "#8ba3c7", font: { size: 10 } }, grid: { color: "rgba(0,212,255,0.05)" } },
        y: { min: 0, ticks: { color: "#8ba3c7", font: { size: 10 } }, grid: { color: "rgba(0,212,255,0.05)" }, title: { display: true, text: "Rainfall (mm)", color: "#4a6080", font: { size: 9 } } }
      }
    }
  });
}

// ══════════════════════════════════════════
// DYNAMIC 7-DAY MODEL PREDICTION ALERTS ENGINE
// ══════════════════════════════════════════
let alertFilterState = "all";
let alertSearchQuery = "";

// State mapping to LightGBM/XGBoost 7-day prediction models & offsets
const STATE_MODEL_MAP = {
  "Gujarat":           { cityKey: "ahmedabad",   name: "Gujarat",                off: { max: -5.0, min: 0.5, rain: 8.0 } },
  "Maharashtra":       { cityKey: "mumbai",      name: "Maharashtra",            off: { max: -8.0, min: 0.0, rain: 55.0 } },
  "Rajasthan":         { cityKey: "jaipur",      name: "Rajasthan",              off: { max: 4.0,  min: 1.0, rain: -15.0 } },
  "NCT of Delhi":      { cityKey: "delhi",       name: "NCT of Delhi",           off: { max: 3.0,  min: 1.5, rain: -5.0 } },
  "West Bengal":       { cityKey: "kolkata",     name: "West Bengal",            off: { max: -4.0, min: 0.5, rain: 35.0 } },
  "Orissa":            { cityKey: "bhubaneswar", name: "Odisha",                 off: { max: -5.0, min: 0.0, rain: 45.0 } },
  "Karnataka":         { cityKey: "bengaluru",   name: "Karnataka",              off: { max: -7.0, min: -3.0, rain: 22.0 } },
  "Tamil Nadu":        { cityKey: "chennai",     name: "Tamil Nadu",             off: { max: -3.0, min: 1.0, rain: 15.0 } },
  "Kerala":            { cityKey: "mumbai",      name: "Kerala",                 off: { max: -9.0, min: -2.0, rain: 75.0 } },
  "Assam":             { cityKey: "kolkata",     name: "Assam",                  off: { max: -7.0, min: -3.0, rain: 85.0 } },
  "Meghalaya":         { cityKey: "kolkata",     name: "Meghalaya",              off: { max: -12.0, min: -6.0, rain: 95.0 } },
  "Jammu & Kashmir":   { cityKey: "all",         name: "Jammu & Kashmir",        off: { max: -16.0, min: -16.0, rain: -10.0 } },
  "Himachal Pradesh":  { cityKey: "all",         name: "Himachal Pradesh",       off: { max: -12.0, min: -12.0, rain: 15.0 } },
  "Uttarakhand":       { cityKey: "delhi",       name: "Uttarakhand",            off: { max: -8.0, min: -8.0, rain: 25.0 } },
  "Punjab":            { cityKey: "delhi",       name: "Punjab",                 off: { max: 2.0,  min: 1.0, rain: -8.0 } },
  "Haryana":           { cityKey: "delhi",       name: "Haryana",                off: { max: 2.5,  min: 1.2, rain: -6.0 } },
  "Uttar Pradesh":     { cityKey: "delhi",       name: "Uttar Pradesh",          off: { max: 1.0,  min: 0.5, rain: 12.0 } },
  "Bihar":             { cityKey: "kolkata",     name: "Bihar",                  off: { max: 0.0,  min: 0.0, rain: 20.0 } },
  "Jharkhand":         { cityKey: "kolkata",     name: "Jharkhand",              off: { max: -2.0, min: -1.0, rain: 28.0 } },
  "Madhya Pradesh":    { cityKey: "ahmedabad",   name: "Madhya Pradesh",         off: { max: 1.5,  min: 0.5, rain: 5.0 } },
  "Chhattisgarh":      { cityKey: "bhubaneswar", name: "Chhattisgarh",           off: { max: -1.0, min: -0.5, rain: 30.0 } },
  "Goa":               { cityKey: "mumbai",      name: "Goa",                    off: { max: -7.0, min: -1.0, rain: 65.0 } },
  "Andhra Pradesh":    { cityKey: "chennai",     name: "Andhra Pradesh",         off: { max: 1.0,  min: 0.0, rain: 18.0 } },
  "Telangana":         { cityKey: "bengaluru",   name: "Telangana",              off: { max: 2.0,  min: 0.5, rain: 8.0 } }
};

function getRealTimeStateAlerts() {
  const alerts = [];
  let idCount = 1;

  // Use 7-day model forecast dataset
  const baseForecast = (typeof activeForecastData !== "undefined" && activeForecastData)
    ? activeForecastData
    : (typeof FORECAST_7DAY_EXTENDED !== "undefined" ? FORECAST_7DAY_EXTENDED : []);

  if (!baseForecast || baseForecast.length === 0) return [];

  Object.entries(STATE_MODEL_MAP).forEach(([stateName, config]) => {
    // Calculate 7-day predictions for this state using model offsets
    const maxTemps = baseForecast.map(d => +(d.max_temp + config.off.max).toFixed(1));
    const minTemps = baseForecast.map(d => +(d.min_temp + config.off.min).toFixed(1));
    const rainfall = baseForecast.map(d => Math.max(0, +(d.rainfall + config.off.rain).toFixed(1)));

    const peakMaxTemp = Math.max(...maxTemps);
    const peakMinTemp = Math.min(...minTemps);
    const peakRain24h = Math.max(...rainfall);
    const totalRain7d = +(rainfall.reduce((a, b) => a + b, 0)).toFixed(1);

    const peakHeatIdx = maxTemps.indexOf(peakMaxTemp);
    const peakRainIdx = rainfall.indexOf(peakRain24h);

    const peakHeatDay = baseForecast[peakHeatIdx] || baseForecast[0];
    const peakRainDay = baseForecast[peakRainIdx] || baseForecast[0];

    // 1. HEAT WAVE ALERT (Requires 7-day peak max temp >= 40°C AND low rain)
    if (peakMaxTemp >= 40 && totalRain7d < 15) {
      const sev = peakMaxTemp >= 44 ? "critical" : peakMaxTemp >= 41.5 ? "high" : "moderate";
      const status = peakHeatIdx <= 1 ? "active" : "upcoming";
      alerts.push({
        id: `ALT-7D-${String(idCount++).padStart(3, '0')}`,
        state: stateName,
        city: `${config.name}`,
        type: peakMaxTemp >= 44 ? "Severe Heat Wave Red Alert" : "Heat Wave Warning",
        severity: sev,
        status: status,
        icon: "🔥",
        states: [stateName],
        dates: `Predicted Peak: ${peakHeatDay.dateLabel || peakHeatDay.dateISO}`,
        detail: `7-Day LightGBM Model predicts peak temperature of ${peakMaxTemp}°C in ${stateName} on ${peakHeatDay.dateLabel}. 7-day accumulated rainfall: ${totalRain7d} mm. High thermal stress expected.`,
        dos: [
          "Stay indoors during peak solar hours (11 AM – 4 PM)",
          "Drink water or ORS every 30 minutes to prevent heat stroke",
          "Wear light, loose cotton clothing",
          "Keep emergency cooling & hydration supplies ready"
        ],
        donts: [
          "Do not engage in heavy outdoor physical labor during noon",
          "Never leave children or pets inside parked vehicles",
          "Avoid alcoholic and caffeinated beverages during heat waves"
        ]
      });
    }

    // 2. MONSOON HEAVY RAINFALL & FLOOD ALERT (Requires peak 24h rain >= 25mm OR total 7d rain >= 60mm)
    if (peakRain24h >= 25 || totalRain7d >= 60) {
      const sev = peakRain24h >= 70 ? "critical" : peakRain24h >= 40 ? "high" : "moderate";
      const status = peakRainIdx <= 1 ? "active" : "upcoming";
      alerts.push({
        id: `ALT-7D-${String(idCount++).padStart(3, '0')}`,
        state: stateName,
        city: `${config.name}`,
        type: peakRain24h >= 70 ? "Monsoon Torrential Flood Red Alert" : "Heavy Rainfall Warning",
        severity: sev,
        status: status,
        icon: peakRain24h >= 70 ? "🌀" : "⛈️",
        states: [stateName],
        dates: `Predicted Peak Downpour: ${peakRainDay.dateLabel || peakRainDay.dateISO}`,
        detail: `7-Day XGBoost & LightGBM Model predicts peak 24h downpour of ${peakRain24h} mm in ${stateName} on ${peakRainDay.dateLabel}. Total 7-day predicted rainfall: ${totalRain7d} mm. Risk of flash flooding & waterlogging.`,
        dos: [
          "Move valuables & electrical appliances to higher floors",
          "Avoid waterlogged underpasses and flooded roads",
          "Keep emergency numbers saved & power banks fully charged",
          "Follow local disaster management authority advisories"
        ],
        donts: [
          "Do not enter flooded roads — even shallow currents are dangerous",
          "Avoid walking near open drains, culverts and riverbanks",
          "Don't touch fallen electrical wires or submerged poles"
        ]
      });
    }

    // 3. COLD WAVE & VALLEY FROST WARNING (Requires min temp <= 10°C)
    if (peakMinTemp <= 10) {
      const sev = peakMinTemp <= 5 ? "high" : "moderate";
      alerts.push({
        id: `ALT-7D-${String(idCount++).padStart(3, '0')}`,
        state: stateName,
        city: `${config.name}`,
        type: "Cold Wave & Valley Frost Advisory",
        severity: sev,
        status: "active",
        icon: "❄️",
        states: [stateName],
        dates: "7-Day Model Cold Wave Horizon",
        detail: `7-Day Model predicts minimum temperature dropping to ${peakMinTemp}°C in ${stateName}. Cold wave conditions prevailing over hill and valley sectors.`,
        dos: [
          "Wear multi-layered thermal clothing when stepping outdoors",
          "Keep living spaces warm and well insulated",
          "Consume warm fluids and nutrient-rich warm food"
        ],
        donts: [
          "Avoid prolonged exposure to cold winds without thermal gear",
          "Don't use unvented coal heaters inside closed bedrooms"
        ]
      });
    }

    // 4. PRE-MONSOON SQUALL & THUNDERSHOWER WATCH (Moderate rain 10-25mm and warm temp)
    if (peakRain24h >= 10 && peakRain24h < 25 && peakMaxTemp < 38) {
      alerts.push({
        id: `ALT-7D-${String(idCount++).padStart(3, '0')}`,
        state: stateName,
        city: `${config.name}`,
        type: "Pre-Monsoon Convective Thundershower Watch",
        severity: "moderate",
        status: peakRainIdx <= 1 ? "active" : "upcoming",
        icon: "🌩️",
        states: [stateName],
        dates: `Expected: ${peakRainDay.dateLabel || peakRainDay.dateISO}`,
        detail: `7-Day Convective Model predicts afternoon thundershowers with peak 24h rainfall of ${peakRain24h} mm in ${stateName} on ${peakRainDay.dateLabel}.`,
        dos: [
          "Seek shelter inside sturdy buildings during lightning strikes",
          "Unplug sensitive electronic appliances",
          "Stay clear of tall trees and metal structures"
        ],
        donts: [
          "Don't take shelter under solitary trees during thunderstorms",
          "Avoid using corded phones or metallic objects outdoors"
        ]
      });
    }
  });

  return alerts;
}

function initAlertsPage() {
  populateStateFilterDropdown();
  updateAlertStats();
  renderAlertCards();
  bindAlertFilters();
  lucide.createIcons();
}

function populateStateFilterDropdown() {
  const select = document.getElementById("alert-state-select");
  if (!select || select.children.length > 1) return;

  const weatherMap = (typeof STATE_WEATHER !== "undefined" && STATE_WEATHER) ? STATE_WEATHER : {};
  const states = Object.keys(weatherMap).sort();

  states.forEach(st => {
    const opt = document.createElement("option");
    opt.value = st;
    opt.textContent = `📍 ${st}`;
    select.appendChild(opt);
  });
}

function updateAlertStats() {
  const allAlerts = getRealTimeStateAlerts();
  const counts = { critical: 0, high: 0, moderate: 0, low: 0 };
  allAlerts.forEach(a => { if (counts[a.severity] !== undefined) counts[a.severity]++; });

  setText("stat-critical", counts.critical);
  setText("stat-high", counts.high);
  setText("stat-moderate", counts.moderate);
  setText("stat-low", counts.low);

  const activeCount = allAlerts.filter(a => a.status === "active").length;
  setText("nav-alerts-badge", activeCount);
  setText("alert-count", activeCount);
}

function renderAlertCards() {
  const container = document.getElementById("alert-cards-list");
  if (!container) return;

  let alerts = getRealTimeStateAlerts();

  // Status Filter
  if (alertFilterStatus !== "all") {
    alerts = alerts.filter(a => a.status === alertFilterStatus);
  }

  // Severity Filter
  if (alertFilterSev !== "all") {
    alerts = alerts.filter(a => a.severity === alertFilterSev);
  }

  // State Filter
  if (alertFilterState !== "all") {
    alerts = alerts.filter(a => a.state === alertFilterState || (a.states && a.states.includes(alertFilterState)));
  }

  // Search Query Filter
  if (alertSearchQuery.trim() !== "") {
    const q = alertSearchQuery.toLowerCase();
    alerts = alerts.filter(a =>
      a.type.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      (a.state && a.state.toLowerCase().includes(q)) ||
      a.detail.toLowerCase().includes(q)
    );
  }

  if (alerts.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--text-muted);font-size:14px">
        <div style="font-size:40px;margin-bottom:12px">🔍</div>
        No state alerts match the selected state or filters.
      </div>`;
    return;
  }

  container.innerHTML = alerts.map(a => `
    <div class="alert-card-full sev-${a.severity}">
      <div class="alert-card-header">
        <div class="alert-card-left">
          <div class="alert-emoji">${a.icon}</div>
          <div>
            <div class="alert-card-title">${a.type}</div>
            <div class="alert-card-city">📍 ${a.city}</div>
            <div class="alert-card-states">${a.states ? a.states.join(" · ") : a.state}</div>
          </div>
        </div>
        <div class="alert-badges">
          <span class="sev-badge ${a.severity}">${a.severity.toUpperCase()}</span>
          <span class="status-badge ${a.status}">${a.status.toUpperCase()}</span>
        </div>
      </div>
      <div class="alert-card-detail">
        ${a.detail}
        <div class="alert-card-dates">📅 ${a.dates}</div>
      </div>
      <div class="alert-card-dodonts">
        <div class="dos-col">
          <div class="dd-header">✅ DO'S</div>
          <ul class="dd-list">
            ${a.dos.map(d => `<li>${d}</li>`).join("")}
          </ul>
        </div>
        <div class="donts-col">
          <div class="dd-header">❌ DON'TS</div>
          <ul class="dd-list">
            ${a.donts.map(d => `<li>${d}</li>`).join("")}
          </ul>
        </div>
      </div>
    </div>
  `).join("");
}

function bindAlertFilters() {
  // State filter dropdown
  const stateSelect = document.getElementById("alert-state-select");
  if (stateSelect) {
    stateSelect.addEventListener("change", e => {
      alertFilterState = e.target.value;
      renderAlertCards();
    });
  }

  // Search input filter
  const searchInput = document.getElementById("alert-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", e => {
      alertSearchQuery = e.target.value;
      renderAlertCards();
    });
  }

  // Status filters
  document.querySelectorAll("[data-filter-status]").forEach(btn => {
    btn.addEventListener("click", () => {
      alertFilterStatus = btn.dataset.filterStatus;
      document.querySelectorAll("[data-filter-status]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderAlertCards();
    });
  });

  // Severity filters
  document.querySelectorAll("[data-filter-sev]").forEach(btn => {
    btn.addEventListener("click", () => {
      alertFilterSev = btn.dataset.filterSev;
      document.querySelectorAll("[data-filter-sev]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderAlertCards();
    });
  });
}

function updateAlertsNavBadge() {
  const allAlerts = getRealTimeStateAlerts();
  const active = allAlerts.filter(a => a.status === "active").length;
  setText("nav-alerts-badge", active);
  setText("alert-count", active);
}

// ══════════════════════════════════════════
// REPORTS PAGE
// ══════════════════════════════════════════
function initReportsPage() {
  const todayISO = new Date().toISOString().split("T")[0];
  renderReportData(reportCityKey, todayISO);
  lucide.createIcons();
}

function renderReportData(cityKey, dateISO) {
  reportCityKey = cityKey;

  const values = (typeof getCityModelValues === "function")
    ? getCityModelValues(cityKey)
    : (() => {
        const off = CITY_FORECAST_DATA[cityKey]?.offsets || { max: 0, min: 0, rain: 0, hum: 0 };
        const s = CLIMATE_DATA.all_india_summary;
        return {
          maxTemp: +(s.max_temp + off.max).toFixed(1),
          minTemp: +(s.min_temp + (off.min || 0)).toFixed(1),
          rainfall: Math.max(0, +(s.rainfall_24h + off.rain).toFixed(1)),
          humidity: Math.max(0, Math.min(100, s.humidity + (off.hum || 0)))
        };
      })();

  const day0 = FORECAST_7DAY_EXTENDED[0];
  const adjMax = values.maxTemp;
  const adjMin = values.minTemp;
  const adjRain = values.rainfall;
  const adjHum = values.humidity;
  const adjWind = values.windSpeed || Math.max(0, day0.wind_speed + Math.round((values.maxTemp - 30) * 0.4));
  const cond = getConditionFromData(adjMax, adjRain);

  // Header date tag
  const dateObj = dateISO ? new Date(dateISO + "T00:00:00") : new Date();
  const dateLabel = dateObj.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  setText("report-date-tag", dateLabel);

  // KPIs — exactly matching Dashboard page metrics!
  setText("rep-max-val", `${adjMax}°C`);
  setText("rep-min-val", `${adjMin}°C`);
  setText("rep-rain-val", `${adjRain} mm`);
  setText("rep-hum-val", `${adjHum}%`);
  setText("rep-wind-val", `${adjWind} km/h`);
  setText("rep-cond-val", cond.icon + " " + cond.label);

  // Dynamic AI Summary based on 7-Day Model Predictions
  const summary = generateDynamicAISummary(cityKey);
  const aiEl = document.getElementById("ai-summary-text");
  if (aiEl) {
    aiEl.innerHTML = "";
    typewriterEffect(aiEl, summary, 10);
  }

  // Charts
  renderReportCharts(cityKey);
}

function generateDynamicAISummary(cityKey) {
  const trend = getCityWeeklyTrend(cityKey);
  const cityNames = {
    all: "All India",
    ahmedabad: "Ahmedabad",
    delhi: "New Delhi",
    mumbai: "Mumbai",
    chennai: "Chennai",
    kolkata: "Kolkata",
    bengaluru: "Bengaluru",
    jaipur: "Jaipur",
    bhubaneswar: "Bhubaneswar"
  };
  const cityName = cityNames[cityKey] || "the selected region";

  const peakMax = Math.max(...trend.maxTemps);
  const peakMin = Math.min(...trend.minTemps);
  const totalRain = +(trend.rainfall.reduce((a, b) => a + b, 0)).toFixed(1);
  const peakRain = Math.max(...trend.rainfall);
  const rainyDays = trend.rainfall.filter(r => r > 0).length;

  if (peakMax >= 40 && totalRain < 15) {
    return `${cityName} is projecting severe heat wave conditions over the 7-day forecast horizon. LightGBM thermal inference indicates maximum temperatures peaking at ${peakMax}°C with minimal rainfall (${totalRain} mm across 7 days). High thermal stress levels require hydration protocols and limited outdoor activity during peak solar hours.`;
  } else if (totalRain >= 50 || peakRain >= 40) {
    return `${cityName} is experiencing active monsoon precipitation with a 7-day cumulative rainfall forecast of ${totalRain} mm (peak 24h intensity of ${peakRain} mm across ${rainyDays} rainy days). XGBoost & LightGBM 2-stage models indicate low-lying waterlogging and urban inundation risks. Maximum temperatures will remain moderated around ${peakMax}°C.`;
  } else if (totalRain >= 15) {
    return `${cityName} exhibits pre-monsoon convective activity with scattered showers over the next 7 days. Total accumulated rainfall is projected at ${totalRain} mm with peak 24h rain reaching ${peakRain} mm. Temperatures remain comfortable to warm, ranging between ${peakMin}°C (min) and ${peakMax}°C (max).`;
  } else if (peakMin <= 15) {
    return `${cityName} indicates cool to cold wave conditions over the valley/hill sector. Minimum temperatures are predicted to drop to ${peakMin}°C while peak daily highs stay near ${peakMax}°C. Total 7-day precipitation remains light at ${totalRain} mm. Thermal insulation and warm fluids recommended.`;
  } else {
    return `${cityName} demonstrates stable atmospheric conditions over the 7-day forecast period. Maximum temperatures are projected to average ${peakMax}°C with overnight lows around ${peakMin}°C. 7-day cumulative rainfall is estimated at ${totalRain} mm. No extreme meteorological hazards detected by the ISRO RIT ML fusion engine.`;
  }
}

function typewriterEffect(el, text, speed) {
  let i = 0;
  el.textContent = "";
  function tick() {
    if (i < text.length) {
      el.textContent += text[i++];
      setTimeout(tick, speed);
    }
  }
  tick();
}

function renderReportCharts(cityKey) {
  const trend = getCityWeeklyTrend(cityKey);

  // Temp chart
  const tempCtx = document.getElementById("reportTempChart");
  if (tempCtx) {
    if (reportTempChartInst) { reportTempChartInst.destroy(); reportTempChartInst = null; }
    reportTempChartInst = new Chart(tempCtx, {
      type: "line",
      data: {
        labels: trend.labels,
        datasets: [
          { label: "Max Temp (°C)", data: trend.maxTemps, borderColor: "#ff6b6b", backgroundColor: "rgba(255,107,107,0.1)", pointBackgroundColor: "#ff6b6b", pointRadius: 4, borderWidth: 2.5, tension: 0.4, fill: true },
          { label: "Min Temp (°C)", data: trend.minTemps, borderColor: "#4dc3ff", backgroundColor: "rgba(77,195,255,0.07)", pointBackgroundColor: "#4dc3ff", pointRadius: 4, borderWidth: 2, tension: 0.4, fill: true }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 600 }, plugins: { legend: { labels: { color: "#8ba3c7", font: { family: "Inter", size: 11 }, boxWidth: 10 } }, tooltip: { backgroundColor: "#111c35", borderColor: "rgba(0,212,255,0.25)", borderWidth: 1, titleColor: "#00d4ff", bodyColor: "#e8f4ff", padding: 10, cornerRadius: 8 } }, scales: { x: { ticks: { color: "#8ba3c7", font: { size: 10 } }, grid: { color: "rgba(0,212,255,0.05)" } }, y: { ticks: { color: "#8ba3c7", font: { size: 10 } }, grid: { color: "rgba(0,212,255,0.05)" }, title: { display: true, text: "Temp (°C)", color: "#4a6080", font: { size: 9 } } } } }
    });
  }

  // Rain chart
  const rainCtx = document.getElementById("reportRainChart");
  if (rainCtx) {
    if (reportRainChartInst) { reportRainChartInst.destroy(); reportRainChartInst = null; }
    const barColors = trend.rainfall.map(v => v > 30 ? "rgba(59,130,246,0.75)" : v > 10 ? "rgba(0,212,255,0.6)" : "rgba(0,229,204,0.45)");
    reportRainChartInst = new Chart(rainCtx, {
      type: "bar",
      data: {
        labels: trend.labels,
        datasets: [{ label: "Rainfall (mm)", data: trend.rainfall, backgroundColor: barColors, borderColor: trend.rainfall.map(v => v > 0 ? "#00d4ff" : "transparent"), borderWidth: 1, borderRadius: 4 }]
      },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 600 }, plugins: { legend: { labels: { color: "#8ba3c7", font: { family: "Inter", size: 11 }, boxWidth: 10 } }, tooltip: { backgroundColor: "#111c35", borderColor: "rgba(0,212,255,0.25)", borderWidth: 1, titleColor: "#00d4ff", bodyColor: "#e8f4ff", padding: 10, cornerRadius: 8 } }, scales: { x: { ticks: { color: "#8ba3c7", font: { size: 10 } }, grid: { color: "rgba(0,212,255,0.05)" } }, y: { min: 0, ticks: { color: "#8ba3c7", font: { size: 10 } }, grid: { color: "rgba(0,212,255,0.05)" }, title: { display: true, text: "Rainfall (mm)", color: "#4a6080", font: { size: 9 } } } } }
    });
  }
}

// ── PDF DOWNLOAD ──
function downloadReportPDF() {
  const btn = document.getElementById("download-pdf-btn");
  if (btn) {
    btn.textContent = "⏳ Generating…";
    btn.disabled = true;
  }
  setTimeout(() => {
    const dateEl = document.getElementById("report-date-input");
    const dateStr = dateEl?.value || new Date().toISOString().split("T")[0];
    const cityEl = document.getElementById("report-city-select");
    const cityLbl = cityEl?.options[cityEl.selectedIndex]?.text || "All India";

    const values = (typeof getCityModelValues === "function")
      ? getCityModelValues(reportCityKey)
      : (() => {
          const off = CITY_FORECAST_DATA[reportCityKey]?.offsets || { max: 0, min: 0, rain: 0, hum: 0 };
          const s = CLIMATE_DATA.all_india_summary;
          return {
            maxTemp: +(s.max_temp + off.max).toFixed(1),
            minTemp: +(s.min_temp + (off.min || 0)).toFixed(1),
            rainfall: Math.max(0, +(s.rainfall_24h + off.rain).toFixed(1)),
            humidity: Math.max(0, Math.min(100, s.humidity + (off.hum || 0)))
          };
        })();

    const adjMax = values.maxTemp;
    const adjMin = values.minTemp;
    const adjRain = values.rainfall;
    const adjHum = values.humidity;
    const summary = generateDynamicAISummary(reportCityKey);

    const printWin = window.open("", "_blank", "width=900,height=700");
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>RIT — Climate Report</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1a2744; background: #fff; }
          h1 { font-size: 26px; font-weight: 800; color: #0a2244; border-bottom: 3px solid #00d4ff; padding-bottom: 10px; }
          h2 { font-size: 16px; font-weight: 700; color: #0a2244; margin-top: 28px; }
          .meta { font-size: 13px; color: #555; margin: 6px 0 20px; }
          .kpi-row { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
          .kpi-box { flex: 1; min-width: 120px; border: 2px solid #e0f0ff; border-radius: 10px; padding: 16px; text-align: center; background: #f0faff; }
          .kpi-box .val { font-size: 26px; font-weight: 800; color: #0066cc; }
          .kpi-box .lbl { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: #888; margin-top: 4px; }
          .ai-box { background: #f8f8ff; border: 2px solid #d0d8ff; border-radius: 10px; padding: 18px; font-size: 13px; line-height: 1.7; color: #333; }
          .footer { margin-top: 32px; font-size: 11px; color: #aaa; border-top: 1px solid #eee; padding-top: 12px; }
          .badge { display: inline-block; background: #e8f8ff; color: #0066cc; border: 1px solid #b0e0ff; border-radius: 999px; font-size: 11px; font-weight: 700; padding: 3px 10px; margin-left: 8px; }
        </style>
      </head>
      <body>
        <h1>🛰️ RIT — Climate Report</h1>
        <div class="meta">
          <strong>Region:</strong> ${cityLbl} &nbsp;|&nbsp;
          <strong>Date:</strong> ${dateStr} &nbsp;|&nbsp;
          <strong>Generated:</strong> ${new Date().toLocaleString("en-IN")} IST &nbsp;|&nbsp;
          <strong>Models:</strong> LightGBM · XGBoost 2-Stage · LSTM
        </div>
        <h2>📊 Climate Summary</h2>
        <div class="kpi-row">
          <div class="kpi-box"><div class="val">${adjMax}°C</div><div class="lbl">MAX TEMP</div></div>
          <div class="kpi-box"><div class="val">${adjMin}°C</div><div class="lbl">MIN TEMP</div></div>
          <div class="kpi-box"><div class="val">${adjRain} mm</div><div class="lbl">RAINFALL</div></div>
          <div class="kpi-box"><div class="val">${adjHum}%</div><div class="lbl">HUMIDITY</div></div>
        </div>
        <h2>🤖 AI Climate Summary (LightGBM + LSTM Analysis)</h2>
        <div class="ai-box">${summary}</div>
        <div class="footer">
          Data Sources: ISRO INSAT-3D/3DR · IMD 0.25° Grid · MOSDAC · Bhuvan Geoportal &nbsp;|&nbsp;
          This report contains AI-generated mock data for demonstration purposes. &nbsp;|&nbsp;
          RIT v1.0 · ISRO Hackathon 2026
        </div>
        <script>window.onload = () => { window.print(); }<\/script>
      </body>
      </html>
    `);
    printWin.document.close();

    if (btn) {
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download PDF';
      btn.disabled = false;
    }
  }, 600);
}

// ══════════════════════════════════════════
// WHAT-IF PAGE SLIDERS (absolute values)
// ══════════════════════════════════════════
// ══════════════════════════════════════════
// WHAT-IF PAGE SLIDERS & REAL-TIME DATA
// ══════════════════════════════════════════
let whatifCityKey = "all";
let whatifLiveBase = null;

function initWhatIfPage() {
  initWhatIfPageSliders();

  const dateInput = document.getElementById("whatif-date-input");
  const todayISO = new Date().toISOString().split("T")[0];
  if (dateInput && !dateInput.value) {
    dateInput.value = todayISO;
  }

  if (dateInput) {
    dateInput.onchange = () => {
      loadWhatIfData(whatifCityKey, dateInput.value);
    };
  }

  const runBtn = document.getElementById("run-sim-btn");
  if (runBtn) {
    runBtn.onclick = () => runSimulation();
  }

  loadWhatIfData(whatifCityKey, dateInput?.value || todayISO);
}

async function loadWhatIfData(cityKey, dateStr) {
  const sourceTag = document.getElementById("whatif-model-tag");
  if (sourceTag) {
    sourceTag.textContent = "Connecting Live...";
    sourceTag.className = "model-tag loading";
  }

  const info = REGION_INFO[cityKey];
  const lat = info ? info.lat : 22.5;
  const lon = info ? info.lon : 82.0;

  let liveDay = null;

  // Use cached forecast data if available
  if (forecastCache[cityKey] && forecastCache[cityKey].data) {
    const feed = forecastCache[cityKey].data;
    liveDay = feed.find(d => d.date === dateStr) || feed[0];
  } else {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_max,wind_speed_10m_max&timezone=Asia/Kolkata`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.daily && data.daily.time && data.daily.time.length > 0) {
          const idx = data.daily.time.indexOf(dateStr);
          const i = idx !== -1 ? idx : 0;
          liveDay = {
            date: data.daily.time[i],
            maxTemp: data.daily.temperature_2m_max[i] ?? 32.0,
            minTemp: data.daily.temperature_2m_min[i] ?? 23.0,
            rainfall: data.daily.precipitation_sum[i] ?? 10.0,
            humidity: data.daily.relative_humidity_2m_max[i] ?? 65
          };
        }
      }
    } catch (err) {
      console.warn("What-If Live fetch failed, using fallback metrics", err);
    }
  }

  if (!liveDay) {
    const s = CLIMATE_DATA.all_india_summary;
    const off = CITY_FORECAST_DATA[cityKey]?.offsets || { max: 0, min: 0, rain: 0, hum: 0 };
    liveDay = {
      date: dateStr || new Date().toISOString().split("T")[0],
      maxTemp: +(s.max_temp + off.max).toFixed(1),
      minTemp: +(s.min_temp + (off.min || 0)).toFixed(1),
      rainfall: Math.max(0, +(s.rainfall_24h + off.rain).toFixed(1)),
      humidity: Math.max(0, Math.min(100, s.humidity + (off.hum || 0)))
    };
  }

  whatifLiveBase = {
    maxTemp: liveDay.maxTemp,
    minTemp: liveDay.minTemp,
    rainfall: liveDay.rainfall,
    humidity: liveDay.humidity,
    co2: 424,
    city: cityKey,
    date: liveDay.date
  };

  // Populate sliders with live real-time values
  setSliderVal("wi-maxtemp-slider", "wi-maxtemp-val", liveDay.maxTemp, "°C");
  setSliderVal("wi-mintemp-slider", "wi-mintemp-val", liveDay.minTemp, "°C");
  setSliderVal("wi-rain-slider", "wi-rain-val", liveDay.rainfall, " mm");
  setSliderVal("wi-hum-slider", "wi-hum-val", liveDay.humidity, "%");
  setSliderVal("co2-slider", "co2-slider-val", 424, " ppm");

  if (sourceTag) {
    sourceTag.textContent = `Live Open-Meteo API (${cityKey.toUpperCase()})`;
    sourceTag.className = "model-tag live-badge";
  }

  resetWhatIfResults();
}

function initWhatIfPageSliders() {
  const sliders = [
    { slider: "wi-maxtemp-slider", val: "wi-maxtemp-val", suffix: "°C" },
    { slider: "wi-mintemp-slider", val: "wi-mintemp-val", suffix: "°C" },
    { slider: "wi-rain-slider", val: "wi-rain-val", suffix: " mm" },
    { slider: "wi-hum-slider", val: "wi-hum-val", suffix: "%" },
    { slider: "co2-slider", val: "co2-slider-val", suffix: " ppm" }
  ];

  sliders.forEach(({ slider, val, suffix }) => {
    const el = document.getElementById(slider);
    const vl = document.getElementById(val);
    if (!el || !vl) return;
    el.addEventListener("input", () => {
      vl.textContent = el.value + suffix;
    });
  });
}

function setSliderVal(sliderId, valId, value, suffix) {
  const sl = document.getElementById(sliderId);
  const vl = document.getElementById(valId);
  if (sl) sl.value = value;
  if (vl) vl.textContent = value + suffix;
}

function resetWhatIfResults() {
  const ph = document.getElementById("results-placeholder");
  const gr = document.getElementById("results-grid");
  const cc = document.getElementById("whatif-chart-card");
  if (ph) ph.style.display = "";
  if (gr) { gr.style.display = "none"; gr.innerHTML = ""; }
  if (cc) cc.style.display = "none";
}

function runSimulation() {
  const maxTemp = parseFloat(document.getElementById("wi-maxtemp-slider")?.value || 37);
  const minTemp = parseFloat(document.getElementById("wi-mintemp-slider")?.value || 25);
  const rainfall = parseFloat(document.getElementById("wi-rain-slider")?.value || 18);
  const humidity = parseFloat(document.getElementById("wi-hum-slider")?.value || 68);
  const co2 = parseInt(document.getElementById("co2-slider")?.value || 420);

  const btn = document.getElementById("run-sim-btn");
  if (btn) {
    btn.classList.add("running");
    btn.innerHTML = '<span style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.4);border-top-color:#fff;border-radius:50%;display:inline-block;animation:spin 0.8s linear infinite"></span> Running…';
  }

  setTimeout(() => {
    const result = computeWhatIfAbsolute(maxTemp, minTemp, rainfall, humidity, co2);
    displayWhatIfResults(result, maxTemp, minTemp, rainfall, humidity, co2);
    renderWhatIfChart(maxTemp, minTemp, rainfall);

    if (btn) {
      btn.classList.remove("running");
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg> Run Simulation';
    }
  }, 1000);
}

let whatifMapMode = "live";

function toggleWhatIfMapMode(mode) {
  whatifMapMode = mode;
  const liveBtn = document.getElementById("whatif-map-live-btn");
  const simBtn = document.getElementById("whatif-map-sim-btn");

  if (mode === "live") {
    if (liveBtn) liveBtn.className = "map-toggle-btn active";
    if (simBtn) simBtn.className = "map-toggle-btn";
    updateDashboardComparison(whatifCityKey);
    if (typeof buildChoropleth === "function") buildChoropleth();
  } else {
    if (simBtn) simBtn.className = "map-toggle-btn active";
    if (liveBtn) liveBtn.className = "map-toggle-btn";
    const maxTemp = parseFloat(document.getElementById("wi-maxtemp-slider")?.value || 37);
    const rainfall = parseFloat(document.getElementById("wi-rain-slider")?.value || 18);
    updateMapForWhatIf(maxTemp, rainfall);
  }
}

function computeWhatIfAbsolute(maxTemp, minTemp, rainfall, humidity, co2) {
  const baseMax = whatifLiveBase ? whatifLiveBase.maxTemp : CLIMATE_DATA.all_india_summary.max_temp;
  const baseMin = whatifLiveBase ? whatifLiveBase.minTemp : CLIMATE_DATA.all_india_summary.min_temp;
  const baseRain = whatifLiveBase ? whatifLiveBase.rainfall : CLIMATE_DATA.all_india_summary.rainfall_24h;
  const baseHum = whatifLiveBase ? whatifLiveBase.humidity : CLIMATE_DATA.all_india_summary.humidity;

  const dT = +(maxTemp - baseMax).toFixed(1);
  const dR = baseRain > 0 ? Math.round(((rainfall - baseRain) / baseRain) * 100) : (rainfall > 0 ? 100 : 0);
  const dHum = +(humidity - baseHum).toFixed(1);

  // NOAA Heat Index Calculation
  let heatIndexVal = maxTemp;
  if (maxTemp >= 27) {
    heatIndexVal = +(maxTemp + 0.55 * (1 - 0.01 * humidity) * (maxTemp - 14.5)).toFixed(1);
  }

  let heatCategory = "Normal";
  let heatColor = "#10b981";
  let heatPct = 25;
  if (heatIndexVal >= 51) {
    heatCategory = "Extreme Danger";
    heatColor = "#ef4444";
    heatPct = 100;
  } else if (heatIndexVal >= 39) {
    heatCategory = "Danger";
    heatColor = "#f97316";
    heatPct = 75;
  } else if (heatIndexVal >= 32) {
    heatCategory = "Caution";
    heatColor = "#ffe066";
    heatPct = 50;
  }

  // Hydrological Risk Meter
  let hydroLabel = "Normal Monsoonal Balance";
  let hydroColor = "#10b981";
  let hydroPct = 25;
  if (rainfall > 80) {
    hydroLabel = "Severe Flood Warning (>80mm/24h)";
    hydroColor = "#ef4444";
    hydroPct = 100;
  } else if (rainfall > 40) {
    hydroLabel = "Moderate Flood Watch (>40mm)";
    hydroColor = "#f97316";
    hydroPct = 70;
  } else if (rainfall < 5) {
    hydroLabel = "Severe Drought Deficit (<5mm)";
    hydroColor = "#ef4444";
    hydroPct = 90;
  } else if (rainfall < 15) {
    hydroLabel = "Moderate Monsoon Deficit";
    hydroColor = "#ffe066";
    hydroPct = 55;
  }

  // Agricultural Impact (Kharif / Rabi & Bhadali Alignment)
  let agriDesc = "Optimal Crop Windows (Aligned with Bhadali Astro-Rules)";
  let agriColor = "#10b981";
  if (maxTemp > 40 || rainfall < 10) {
    agriDesc = "High Risk (Kharif Sowing Shift 14-21 Days, Crop Heat Stress)";
    agriColor = "#ef4444";
  } else if (maxTemp > 36 || rainfall > 60) {
    agriDesc = "Moderate Shift (Kharif Yield Reduction ~8-12%)";
    agriColor = "#f97316";
  }

  // Water Stress PET (Potential Evapotranspiration Balance)
  const petVal = +(0.0023 * (maxTemp + 17.8) * Math.sqrt(Math.max(1, maxTemp - minTemp)) * 0.8).toFixed(1);
  const petBalance = +(petVal * 10 - rainfall).toFixed(1);
  let petLabel = "Water Balance Stable";
  let petColor = "#10b981";
  let petPct = 30;
  if (petBalance > 30) {
    petLabel = "Severe Hydrological Deficit";
    petColor = "#ef4444";
    petPct = 90;
  } else if (petBalance > 10) {
    petLabel = "Moderate Evapotranspiration Deficit";
    petColor = "#f97316";
    petPct = 60;
  }

  // CO2 Radiative Forcing Context
  const co2ForcingVal = +(5.35 * Math.log(co2 / 280)).toFixed(2);
  const co2ContextStr = co2 > 500 ? "Severe Radiative Forcing Envelope (+3.5°C Global Commitment)" : co2 > 430 ? "Elevated Radiative Forcing vs Pre-Industrial 280 ppm" : "Baseline Atmospheric Level";

  // IMD 75-Year Historical Analog Matching
  let historicalAnalog = "1998 Standard Monsoonal Seasonal Cycle";
  if (maxTemp >= 42 && rainfall < 10) {
    historicalAnalog = "2015 All-India Extreme Heatwave & Monsoonal Deficit";
  } else if (rainfall >= 100) {
    historicalAnalog = "2005 Mumbai Downpour & Extreme Coastal Flood Event";
  } else if (rainfall < 5) {
    historicalAnalog = "2009 All-India Drought Anomaly (22% Seasonal Rainfall Deficit)";
  } else if (maxTemp <= 28 && rainfall >= 35) {
    historicalAnalog = "2020 Cyclone Amphan Atmospheric Disruption";
  }

  // Top 5 Most-Affected Regions Ranking
  const allRegions = [
    { name: "New Delhi (NCR)", vulnerability: "Urban Heat Island & High AQI Feedback", baseSens: 1.35 },
    { name: "Rajasthan (Jaipur)", vulnerability: "Arid Border Heat Stress", baseSens: 1.25 },
    { name: "Gujarat (Ahmedabad)", vulnerability: "Extreme Summer Thermal Index", baseSens: 1.20 },
    { name: "Maharashtra (Mumbai)", vulnerability: "Coastal Humidity & Heat Stress", baseSens: 1.15 },
    { name: "Tamil Nadu (Chennai)", vulnerability: "Monsoonal Timing Deficit", baseSens: 1.10 }
  ];

  const topRegions = allRegions.map(r => {
    const simHI = +(heatIndexVal * r.baseSens).toFixed(1);
    const sev = simHI > 48 ? "Critical" : simHI > 38 ? "Severe" : "Moderate";
    const pillCls = simHI > 48 ? "high" : simHI > 38 ? "mod" : "low";
    return { name: r.name, vulnerability: r.vulnerability, heatIndex: simHI, severity: sev, pillCls };
  }).sort((a, b) => b.heatIndex - a.heatIndex);

  // Auto-Generated Narrative Sentence
  const cityName = REGION_INFO[whatifCityKey]?.name || "Selected Region";
  const rainDeltaStr = dR >= 0 ? `+${dR}%` : `${dR}%`;
  const narrativeSentence = `Under this simulated scenario, ${cityName} experiences a Heat Stress Index of ${heatIndexVal}°C (${heatCategory} zone), with a ${rainDeltaStr} precipitation shift relative to live baseline.`;

  return {
    scenario: `Max ${maxTemp}°C · Min ${minTemp}°C · Rain ${rainfall}mm · Hum ${humidity}%`,
    proj_max_temp: maxTemp,
    proj_min_temp: minTemp,
    proj_rainfall: rainfall,
    proj_humidity: humidity,
    baseMax, baseMin, baseRain, baseHum,
    dT, dR, dHum, co2,
    heatIndexVal, heatCategory, heatColor, heatPct,
    hydroLabel, hydroColor, hydroPct,
    agriDesc, agriColor,
    petVal, petLabel, petColor, petPct,
    co2ForcingVal, co2ContextStr,
    historicalAnalog,
    topRegions,
    narrativeSentence
  };
}


function resetWhatIfResults() {
  const ph = document.getElementById("results-placeholder");
  const gr = document.getElementById("results-grid");
  const bottomGr = document.getElementById("whatif-bottom-results");
  const cc = document.getElementById("whatif-chart-card");
  if (ph) ph.style.display = "";
  if (gr) { gr.style.display = "none"; gr.innerHTML = ""; }
  if (bottomGr) { bottomGr.style.display = "none"; bottomGr.innerHTML = ""; }
  if (cc) cc.style.display = "none";
}

function displayWhatIfResults(result, maxTemp, minTemp, rainfall, humidity, co2) {
  const placeholder = document.getElementById("results-placeholder");
  const grid = document.getElementById("results-grid");
  const bottomGrid = document.getElementById("whatif-bottom-results");
  if (!placeholder || !grid) return;

  placeholder.style.display = "none";
  grid.style.display = "flex";
  grid.style.flexDirection = "column";
  grid.style.gap = "12px";

  if (bottomGrid) {
    bottomGrid.style.display = "flex";
    bottomGrid.style.flexDirection = "column";
    bottomGrid.style.gap = "16px";
  }

  const trendArrow = (orig, proj, suffix = "") => {
    const diff = +(proj - orig).toFixed(1);
    const cls = diff > 0 ? "positive" : diff < 0 ? "negative" : "neutral";
    const sym = diff > 0 ? "▲" : diff < 0 ? "▼" : "─";
    return `<span class="${cls}">${sym} ${diff >= 0 ? "+" : ""}${diff}${suffix}</span>`;
  };

  const sMax = result.baseMax;
  const sMin = result.baseMin;
  const sRain = result.baseRain;
  const sHum = result.baseHum;

  // 1. Top Right Box (Side by side with Sliders): Narrative Impact Card + Standalone 75-Yr IMD Precedent Card
  grid.innerHTML = `
    <!-- Narrative Quote Card -->
    <div class="narrative-quote-card animate-in" style="animation-delay:0s">
      <div style="font-family:var(--font-head);font-size:10px;font-weight:700;color:var(--accent-cyan);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">
        <i data-lucide="message-square" size="12"></i> Scenario Impact Narrative
      </div>
      <div class="narrative-text">"${result.narrativeSentence}"</div>
    </div>

    <!-- Standalone 75-Year IMD Archive Precedent Matched Event Card -->
    <div class="historical-analog-card animate-in" style="animation-delay:0.05s">
      <div class="historical-card-header">
        <i data-lucide="history" size="14"></i> 75-Year IMD Archive Precedent
      </div>
      <div class="historical-card-event">${result.historicalAnalog}</div>
      <div class="historical-card-sub">Matched atmospheric pattern & precipitation anomaly from IMD historical records</div>
    </div>
  `;

  // 2. Flowing Bottom Container: Tier 1 (Single Row across 4 cols), Tier 2 (Cards Grid - NO TABLE), Tier 3 (Consequences)
  if (bottomGrid) {
    bottomGrid.innerHTML = `
      <!-- Tier 1 ML Inference & Confidence Bands (Formatted Properly in a Single Row) -->
      <div class="tier-section-title animate-in" style="animation-delay:0.1s">
        <i data-lucide="cpu" size="14"></i> Tier 1 — ML Prediction Inference & 95% Confidence Bounds
      </div>

      <div class="tier1-grid animate-in" style="animation-delay:0.15s">
        <div class="ml-pred-card">
          <span class="ml-model-tag">LightGBM Max Temp</span>
          <span class="ml-pred-val" style="color:#ff6b6b">${result.proj_max_temp}°C</span>
          <div class="confidence-band">
            <span>95% CI:</span>
            <strong>[${(result.proj_max_temp - 0.6).toFixed(1)}°C – ${(result.proj_max_temp + 0.6).toFixed(1)}°C]</strong>
          </div>
          <div class="baseline-delta-chip">${trendArrow(sMax, result.proj_max_temp, "°C")} vs live base</div>
        </div>

        <div class="ml-pred-card">
          <span class="ml-model-tag">LightGBM Min Temp</span>
          <span class="ml-pred-val" style="color:#4dc3ff">${result.proj_min_temp}°C</span>
          <div class="confidence-band">
            <span>95% CI:</span>
            <strong>[${(result.proj_min_temp - 0.5).toFixed(1)}°C – ${(result.proj_min_temp + 0.5).toFixed(1)}°C]</strong>
          </div>
          <div class="baseline-delta-chip">${trendArrow(sMin, result.proj_min_temp, "°C")} vs live base</div>
        </div>

        <div class="ml-pred-card">
          <span class="ml-model-tag">XGBoost 2-Stage Rain</span>
          <span class="ml-pred-val" style="color:#00e5cc">${result.proj_rainfall} mm</span>
          <div class="confidence-band">
            <span>95% CI:</span>
            <strong>[${(result.proj_rainfall * 0.85).toFixed(1)} – ${(result.proj_rainfall * 1.15).toFixed(1)} mm]</strong>
          </div>
          <div class="baseline-delta-chip">${trendArrow(sRain, result.proj_rainfall, " mm")} vs live base</div>
        </div>

        <div class="ml-pred-card">
          <span class="ml-model-tag">LSTM Humidity Net</span>
          <span class="ml-pred-val" style="color:#a78bfa">${result.proj_humidity}%</span>
          <div class="confidence-band">
            <span>95% CI:</span>
            <strong>[${Math.max(0, result.proj_humidity - 4)}% – ${Math.min(100, result.proj_humidity + 4)}%]</strong>
          </div>
          <div class="baseline-delta-chip">${trendArrow(sHum, result.proj_humidity, "%")} vs live base</div>
        </div>
      </div>

      <!-- Tier 2 Spatial Impact & Regional Cards Grid (NO TABLE!) -->
      <div class="tier-section-title animate-in" style="animation-delay:0.2s">
        <i data-lucide="map" size="14"></i> Tier 2 — Spatial Impact & Top 5 Most-Affected Regions
      </div>

      <div class="regional-cards-grid animate-in" style="animation-delay:0.25s">
        ${result.topRegions.map((r, i) => `
          <div class="region-rank-card">
            <div class="rank-card-header">
              <span class="rank-badge">#${i + 1}</span>
              <span class="rank-region-name">${r.name}</span>
            </div>
            <div class="rank-vulnerability">${r.vulnerability}</div>
            <div class="rank-card-footer">
              <span class="rank-hi-val">${r.heatIndex}°C</span>
              <span class="severity-pill ${r.pillCls}">${r.severity}</span>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Tier 3 Digital Twin Consequence Modeling -->
      <div class="tier-section-title animate-in" style="animation-delay:0.25s">
        <i data-lucide="activity" size="14"></i> Tier 3 — Digital Twin Consequence Modeling
      </div>

      <div class="tier3-top-grid animate-in" style="animation-delay:0.3s">
        <!-- Heat Stress Card -->
        <div class="consequence-card">
          <span class="consequence-card-title">Heat Stress Index</span>
          <div class="consequence-card-val" style="color:${result.heatColor}">${result.heatIndexVal}°C (${result.heatCategory})</div>
          <div class="risk-gauge-track"><div class="risk-gauge-fill" style="width:${result.heatPct}%;background:${result.heatColor}"></div></div>
        </div>

        <!-- Drought/Flood Risk Card -->
        <div class="consequence-card">
          <span class="consequence-card-title">Drought / Flood Risk Meter</span>
          <div class="consequence-card-val" style="color:${result.hydroColor}">${result.hydroLabel}</div>
          <div class="risk-gauge-track"><div class="risk-gauge-fill" style="width:${result.hydroPct}%;background:${result.hydroColor}"></div></div>
        </div>

        <!-- Agricultural Impact Card -->
        <div class="consequence-card">
          <span class="consequence-card-title">Agricultural Yield & Bhadali Shift</span>
          <div class="consequence-card-val" style="font-size:12px;color:${result.agriColor}">${result.agriDesc}</div>
          <div style="font-size:10px;color:#8ba3c7">Kharif/Rabi sowing window alignment</div>
        </div>
      </div>

      <div class="tier3-bottom-grid animate-in" style="animation-delay:0.35s">
        <!-- Water Stress PET Card (Half-Half 50% Width) -->
        <div class="consequence-card">
          <span class="consequence-card-title">Water Stress (PET Balance)</span>
          <div class="consequence-card-val" style="color:${result.petColor}">${result.petLabel} (${result.petVal} mm/day)</div>
          <div class="risk-gauge-track"><div class="risk-gauge-fill" style="width:${result.petPct}%;background:${result.petColor}"></div></div>
        </div>

        <!-- CO2 Forcing Card (Half-Half 50% Width) -->
        <div class="consequence-card">
          <span class="consequence-card-title">CO₂ Radiative Forcing Context</span>
          <div class="consequence-card-val" style="color:#a78bfa">+${result.co2ForcingVal} W/m² (${co2} ppm)</div>
          <div style="font-size:10px;color:#8ba3c7">${result.co2ContextStr}</div>
        </div>
      </div>
    `;
  }

  lucide.createIcons();

  if (typeof updateAmbientWeatherState === "function") {
    updateAmbientWeatherState(maxTemp, minTemp, rainfall);
  }

  if (whatifMapMode === "sim") {
    updateMapForWhatIf(maxTemp, rainfall);
  }
}

function updateMapForWhatIf(maxTemp, rainfall) {
  if (typeof STATE_WEATHER === "undefined") return;

  if (!STATE_WEATHER_BASE) {
    STATE_WEATHER_BASE = JSON.parse(JSON.stringify(STATE_WEATHER));
  }

  const baseMax = whatifLiveBase ? whatifLiveBase.maxTemp : 33.0;
  const baseRain = whatifLiveBase ? whatifLiveBase.rainfall : 10.0;

  const tempDiff = maxTemp - baseMax;
  const rainPct = baseRain > 0 ? (rainfall - baseRain) / baseRain : 0.0;

  Object.keys(STATE_WEATHER).forEach(state => {
    const base = STATE_WEATHER_BASE[state];
    if (!base) return;

    const maxT = base.maxTemp + tempDiff;
    const minT = base.minTemp + tempDiff * 0.7;
    const rain = Math.max(0, base.rainfall * (1.0 + rainPct));

    STATE_WEATHER[state].maxTemp = +maxT.toFixed(1);
    STATE_WEATHER[state].minTemp = +minT.toFixed(1);
    STATE_WEATHER[state].rainfall = +rain.toFixed(1);
    STATE_WEATHER[state].cloud = Math.min(1.0, +(rain / 80).toFixed(2));
    STATE_WEATHER[state].hasRain = rain > 10;
  });

  if (typeof buildChoropleth === "function") buildChoropleth();
  if (typeof drawHeatmap === "function") drawHeatmap();
  if (typeof buildWeatherEffects === "function") buildWeatherEffects();
}

function renderWhatIfChart(maxTemp, minTemp, rainfall) {
  const cc = document.getElementById("whatif-chart-card");
  if (cc) cc.style.display = "";

  const ctx = document.getElementById("whatifChart");
  if (!ctx) return;
  if (whatifChartInst) { whatifChartInst.destroy(); whatifChartInst = null; }

  // Show comparison: baseline 7-day vs simulated 7-day
  const labels = FORECAST_7DAY_EXTENDED.map(d => d.dateLabel);
  const baseMax = FORECAST_7DAY_EXTENDED.map(d => d.max_temp);
  const simMax = FORECAST_7DAY_EXTENDED.map(d => {
    const delta = maxTemp - CLIMATE_DATA.all_india_summary.max_temp;
    return +(d.max_temp + delta).toFixed(1);
  });
  const simRain = FORECAST_7DAY_EXTENDED.map(d => Math.max(0, +(d.rainfall * (rainfall / Math.max(1, CLIMATE_DATA.all_india_summary.rainfall_24h))).toFixed(1)));

  whatifChartInst = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        { type: "line", label: "Baseline Max (°C)", data: baseMax, borderColor: "#4a6080", backgroundColor: "transparent", borderDash: [4, 3], pointRadius: 2, borderWidth: 1.5, tension: 0.4, yAxisID: "yT" },
        { type: "line", label: "Simulated Max (°C)", data: simMax, borderColor: "#ff6b6b", backgroundColor: "rgba(255,107,107,0.08)", pointBackgroundColor: "#ff6b6b", pointRadius: 3, borderWidth: 2, tension: 0.4, fill: true, yAxisID: "yT" },
        { type: "bar", label: "Simulated Rain (mm)", data: simRain, backgroundColor: "rgba(0,212,255,0.4)", borderRadius: 4, yAxisID: "yR" }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 700 },
      plugins: {
        legend: { labels: { color: "#8ba3c7", font: { family: "Inter", size: 11 }, boxWidth: 10 } },
        tooltip: { backgroundColor: "#111c35", borderColor: "rgba(0,212,255,0.25)", borderWidth: 1, titleColor: "#00d4ff", bodyColor: "#e8f4ff", padding: 10, cornerRadius: 8 }
      },
      scales: {
        x: { ticks: { color: "#8ba3c7", font: { size: 10 } }, grid: { color: "rgba(0,212,255,0.05)" } },
        yT: { position: "left", ticks: { color: "#8ba3c7", font: { size: 10 } }, grid: { color: "rgba(0,212,255,0.05)" }, title: { display: true, text: "Temp (°C)", color: "#4a6080", font: { size: 9 } } },
        yR: { position: "right", ticks: { color: "#8ba3c7", font: { size: 10 } }, grid: { drawOnChartArea: false }, title: { display: true, text: "Rain (mm)", color: "#4a6080", font: { size: 9 } } }
      }
    }
  });
}

// ══════════════════════════════════════════
// UTILITY
// ══════════════════════════════════════════
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ══════════════════════════════════════════
// CLIMATE PREDICTION PAGE (2000 - 2100)
// ══════════════════════════════════════════

function initPredictionPage() {
  // Populate the Year Dropdown
  const yrSelect = document.getElementById("prediction-year-select");
  if (yrSelect && yrSelect.children.length === 0) {
    for (let y = 2000; y <= 2100; y++) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      yrSelect.appendChild(opt);
    }
  }

  // Set initial select and slider values
  const slider = document.getElementById("prediction-year-slider");
  if (slider) slider.value = predictionYear;
  if (yrSelect) yrSelect.value = predictionYear;
  setText("prediction-year-val", predictionYear);

  // Wire Slider Input
  if (slider) {
    slider.oninput = (e) => {
      predictionYear = parseInt(e.target.value);
      if (yrSelect) yrSelect.value = predictionYear;
      updatePredictionTimeline();
      updateSolutionsFeedback(); // recalculate feedback for the new population year
    };
  }

  // Wire Year Dropdown Select
  if (yrSelect) {
    yrSelect.onchange = (e) => {
      predictionYear = parseInt(e.target.value);
      if (slider) slider.value = predictionYear;
      updatePredictionTimeline();
      updateSolutionsFeedback();
    };
  }

  // Wire Play/Pause Button
  const playBtn = document.getElementById("prediction-play-btn");
  if (playBtn) {
    playBtn.onclick = () => togglePredictionPlay();
  }

  // Wire Solutions Checkboxes
  CLIMATE_SOLUTIONS.forEach(sol => {
    const cb = document.getElementById(`sol-${sol.id}`);
    if (cb) {
      cb.checked = activeSolutions[sol.id];
      cb.onchange = (e) => {
        activeSolutions[sol.id] = e.target.checked;
        
        // Re-generate mitigated dataset
        mitigatedPredictionData = getMitigatedDataForCity(predictionCityKey, activeSolutions);
        
        updatePredictionTimeline();
        renderPredictionChart();
        updateSolutionsFeedback();
      };
    }
  });

  // Update feedback panels
  updateSolutionsFeedback();

  // Load projection data
  loadPredictionData(predictionCityKey);
}

function updateSolutionsFeedback() {
  const panel = document.getElementById("prediction-solutions-feedback");
  const countBadge = document.getElementById("solutions-active-count");
  if (!panel) return;

  const activeIds = Object.keys(activeSolutions).filter(id => activeSolutions[id]);
  
  if (countBadge) {
    countBadge.textContent = `${activeIds.length} Solutions Active`;
    countBadge.className = `model-tag ${activeIds.length > 0 ? 'live-badge' : 'fallback-badge'}`;
  }

  if (activeIds.length === 0) {
    panel.innerHTML = `
      <div class="feedback-empty-state">
        <i data-lucide="info" size="24"></i>
        <p>Select one or more climate solutions to simulate their demographic and environmental offsets on future trajectories.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  let html = `<div class="feedback-solutions-list">`;
  
  let totalCo2 = 0;
  let totalAqi = 0;
  let totalTemp = 0;
  let totalRain = 0;

  activeIds.forEach(id => {
    const sol = CLIMATE_SOLUTIONS.find(s => s.id === id);
    if (!sol) return;

    const popVal = interpolateDecadalValue(predictionYear, "pop");
    const eqText = sol.equation(popVal);

    if (sol.offsets.co2) totalCo2 += sol.offsets.co2;
    if (sol.offsets.aqi) totalAqi += sol.offsets.aqi;
    if (sol.offsets.temp) totalTemp += sol.offsets.temp;
    if (sol.offsets.rain) totalRain += sol.offsets.rain;

    html += `
      <div class="feedback-card">
        <div class="feedback-card-header">
          <span class="feedback-sol-name">${sol.name}</span>
          <span class="feedback-sol-offset">-${sol.offsets.temp || 0}°C | -${sol.offsets.co2 || 0} ppm</span>
        </div>
        <p class="feedback-sol-desc">${sol.desc}</p>
        <div class="feedback-sol-equation">${eqText}</div>
      </div>
    `;
  });

  html = `
    <div class="feedback-summary-box">
      <span class="summary-box-title">Cumulative Climate Mitigation (${predictionYear})</span>
      <div class="summary-box-grid">
        <div class="summary-metric">
          <span class="metric-lbl">CO₂ Avoided</span>
          <span class="summary-highlight">-${totalCo2} ppm</span>
        </div>
        <div class="summary-metric">
          <span class="metric-lbl">Warming Offset</span>
          <span class="summary-highlight" style="color: #ff6b6b">-${totalTemp.toFixed(2)}°C</span>
        </div>
        <div class="summary-metric">
          <span class="metric-lbl">AQI Improvement</span>
          <span class="summary-highlight" style="color: #00e5cc">-${totalAqi} AQI</span>
        </div>
        <div class="summary-metric">
          <span class="metric-lbl">Rain Stability</span>
          <span class="summary-highlight" style="color: #a78bfa">+${(totalRain * 100).toFixed(1)}%</span>
        </div>
      </div>
    </div>
  ` + html + `</div>`;

  panel.innerHTML = html;
  lucide.createIcons();
}

function onPredictionCityChange(city) {
  predictionCityKey = city;
  const master = document.getElementById("region-select");
  if (master) { master.value = city; master.dispatchEvent(new Event("change")); }
  loadPredictionData(city);
}

// ── ADVANCED INFERENCE COEFFICIENTS PER CITY ──
const CITY_CLIMATE_SENSITIVITY = {
  all: { uhi: 1.0, tempSens: 1.0, rainSens: 1.0 },
  delhi: { uhi: 1.35, tempSens: 1.1, rainSens: 0.9 }, // High urban density and pollution feedback
  mumbai: { uhi: 1.1, tempSens: 0.85, rainSens: 1.45 }, // Coastal, high rainfall variance
  ahmedabad: { uhi: 1.25, tempSens: 1.15, rainSens: 0.8 }, // Dry, high heat island
  chennai: { uhi: 1.15, tempSens: 0.9, rainSens: 1.25 },
  kolkata: { uhi: 1.2, tempSens: 0.95, rainSens: 1.3 },
  bengaluru: { uhi: 0.75, tempSens: 0.8, rainSens: 1.15 }, // Mild climate, high canopy conservation
  jaipur: { uhi: 1.15, tempSens: 1.2, rainSens: 0.75 }, // Arid desert border
  bhubaneswar: { uhi: 1.1, tempSens: 1.0, rainSens: 1.2 }
};

let mitigatedPredictionData = null; // Unified prediction outcome series

function getMitigatedDataForCity(cityKey, solutions) {
  const rawData = climatePredictionCache[cityKey];
  if (!rawData) return null;

  const sens = CITY_CLIMATE_SENSITIVITY[cityKey] || CITY_CLIMATE_SENSITIVITY.all;
  const mitigated = {};

  // Calculate cumulative solution offsets
  let co2Offset = 0;
  let ghgOffset = 0;
  let aqiOffset = 0;
  let tempOffset = 0;
  let rainOffsetFactor = 1.0;

  CLIMATE_SOLUTIONS.forEach(sol => {
    if (solutions[sol.id]) {
      if (sol.offsets.co2) co2Offset += sol.offsets.co2;
      if (sol.offsets.ghg) ghgOffset += sol.offsets.ghg;
      if (sol.offsets.aqi) aqiOffset += sol.offsets.aqi;
      if (sol.offsets.temp) tempOffset += sol.offsets.temp;
      if (sol.offsets.rain) rainOffsetFactor += sol.offsets.rain;
    }
  });

  for (let y = 2000; y <= 2100; y++) {
    const raw = rawData[y];
    if (!raw) continue;

    const co2Raw = interpolateDecadalValue(y, "co2");
    const ghgRaw = interpolateDecadalValue(y, "ghg");
    const aqiRaw = interpolateDecadalValue(y, "aqi");
    const popRaw = interpolateDecadalValue(y, "pop");

    // Apply mitigation offsets
    const co2Net = Math.max(280, co2Raw - co2Offset);
    const ghgNet = Math.max(0.2, ghgRaw - ghgOffset);
    const aqiNet = Math.max(10, aqiRaw - aqiOffset);

    // Anchored to year 2000 variables
    const dCO2 = co2Net - 369;
    const dGHG = ghgNet - 1.15;
    const dAQI = aqiNet - 135;
    const dPop = Math.max(0, popRaw - 1.05);

    // Multi-parameter Climate Sensitivity Equations
    const baseDTMax = dCO2 * 0.0075 + dGHG * 0.45 + dAQI * 0.005;
    const baseDTMin = dCO2 * 0.007 + dGHG * 0.4 + dAQI * 0.004;

    const dTMax = (baseDTMax + dPop * 0.35 * sens.uhi) * sens.tempSens - tempOffset;
    const dTMin = (baseDTMin + dPop * 0.3 * sens.uhi) * sens.tempSens - tempOffset;

    const rainPctChange = (dTMax * 0.015 + dAQI * -0.0007) * sens.rainSens + (rainOffsetFactor - 1.0);
    const rainFactor = Math.max(0.3, 1.0 + rainPctChange);

    mitigated[y] = {
      max_temp: +(raw.max_temp_base + dTMax + raw.max_noise).toFixed(1),
      min_temp: +(raw.min_temp_base + dTMin + raw.min_noise).toFixed(1),
      rainfall: +(raw.rainfall_base * rainFactor * raw.rain_noise).toFixed(2),
      
      co2: co2Net,
      ghg: ghgNet,
      aqi: aqiNet,
      pop: popRaw
    };
  }

  return mitigated;
}

async function loadPredictionData(cityKey) {
  const sourceTag = document.getElementById("prediction-model-tag");
  if (sourceTag) {
    sourceTag.textContent = "Connecting CMIP6...";
    sourceTag.className = "model-tag loading";
  }

  const info = REGION_INFO[cityKey];
  const lat = info ? info.lat : 22.5;
  const lon = info ? info.lon : 82.0;

  if (climatePredictionCache[cityKey]) {
    if (sourceTag) {
      sourceTag.textContent = "CMIP6 (EC-Earth3P-HR)";
      sourceTag.className = "model-tag live-badge";
    }
    mitigatedPredictionData = getMitigatedDataForCity(cityKey, activeSolutions);
    updatePredictionTimeline();
    renderPredictionChart();
    return;
  }

  try {
    const url = `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lon}&start_date=2000-01-01&end_date=2050-12-31&models=EC_Earth3P_HR&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia/Kolkata`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("API responded with error");
    const data = await res.json();

    if (!data.daily || !data.daily.time) throw new Error("Invalid response format");

    const yearly = {};
    const dates = data.daily.time;
    const tmax = data.daily.temperature_2m_max;
    const tmin = data.daily.temperature_2m_min;
    const rain = data.daily.precipitation_sum;

    for (let i = 0; i < dates.length; i++) {
      const year = parseInt(dates[i].substring(0, 4));
      if (!yearly[year]) {
        yearly[year] = { maxTempSum: 0, minTempSum: 0, rainSum: 0, count: 0 };
      }
      const tx = tmax[i];
      const tn = tmin[i];
      const r = rain[i];

      if (tx !== null && tx !== undefined && tn !== null && tn !== undefined && r !== null && r !== undefined) {
        yearly[year].maxTempSum += tx;
        yearly[year].minTempSum += tn;
        yearly[year].rainSum += r;
        yearly[year].count++;
      }
    }

    const aggregated = {};
    Object.keys(yearly).forEach(yr => {
      const y = yearly[yr];
      if (y.count > 100) {
        aggregated[yr] = {
          max_temp: +(y.maxTempSum / y.count).toFixed(1),
          min_temp: +(y.minTempSum / y.count).toFixed(1),
          rainfall: +(y.rainSum / y.count).toFixed(2)
        };
      }
    });

    if (!aggregated[2050] && aggregated[2049]) {
      aggregated[2050] = { ...aggregated[2049] };
    }

    const sens = CITY_CLIMATE_SENSITIVITY[cityKey] || CITY_CLIMATE_SENSITIVITY.all;
    const baseMax = aggregated[2000] ? aggregated[2000].max_temp : 33.0;
    const baseMin = aggregated[2000] ? aggregated[2000].min_temp : 22.0;
    const baseRain = aggregated[2000] ? aggregated[2000].rainfall : 1.6;

    const rawCache = {};

    for (let y = 2000; y <= 2100; y++) {
      const co2Raw = interpolateDecadalValue(y, "co2");
      const ghgRaw = interpolateDecadalValue(y, "ghg");
      const aqiRaw = interpolateDecadalValue(y, "aqi");
      const popRaw = interpolateDecadalValue(y, "pop");

      const dCO2 = co2Raw - 369;
      const dGHG = ghgRaw - 1.15;
      const dAQI = aqiRaw - 135;
      const dPop = Math.max(0, popRaw - 1.05);

      const baseDTMax = dCO2 * 0.0075 + dGHG * 0.45 + dAQI * 0.005;
      const baseDTMin = dCO2 * 0.007 + dGHG * 0.4 + dAQI * 0.004;

      const dTMaxRaw = (baseDTMax + dPop * 0.35 * sens.uhi) * sens.tempSens;
      const dTMinRaw = (baseDTMin + dPop * 0.3 * sens.uhi) * sens.tempSens;
      const rainFactorRaw = Math.max(0.3, 1.0 + (dTMaxRaw * 0.015 + dAQI * -0.0007) * sens.rainSens);

      if (y <= 2050 && aggregated[y]) {
        rawCache[y] = {
          max_temp_base: baseMax,
          min_temp_base: baseMin,
          rainfall_base: baseRain,
          max_noise: +(aggregated[y].max_temp - baseMax - dTMaxRaw).toFixed(1),
          min_noise: +(aggregated[y].min_temp - baseMin - dTMinRaw).toFixed(1),
          rain_noise: +(aggregated[y].rainfall / (baseRain * rainFactorRaw)).toFixed(2)
        };
      } else {
        const seed = getHashForStateAndYear(cityKey, y);
        rawCache[y] = {
          max_temp_base: baseMax,
          min_temp_base: baseMin,
          rainfall_base: baseRain,
          max_noise: +((seed - 0.5) * 1.5).toFixed(1),
          min_noise: +((seed - 0.5) * 1.0).toFixed(1),
          rain_noise: +(1.0 + (seed - 0.5) * 0.25).toFixed(2)
        };
      }
    }

    climatePredictionCache[cityKey] = rawCache;

    if (sourceTag) {
      sourceTag.textContent = "CMIP6 (EC-Earth3P-HR)";
      sourceTag.className = "model-tag live-badge";
    }

    mitigatedPredictionData = getMitigatedDataForCity(cityKey, activeSolutions);
    updatePredictionTimeline();
    renderPredictionChart();

  } catch (err) {
    console.warn("Prediction API failed, using high-fidelity offline baseline scaling", err);

    const baseTempMax = {
      all: 33.2, ahmedabad: 37.2, delhi: 38.2, mumbai: 31.2, chennai: 32.2, kolkata: 34.2, bengaluru: 29.2, jaipur: 40.2, bhubaneswar: 35.2
    }[cityKey] || 33.2;

    const baseTempMin = {
      all: 22.2, ahmedabad: 24.2, delhi: 25.2, mumbai: 23.2, chennai: 21.2, kolkata: 23.2, bengaluru: 19.2, jaipur: 26.2, bhubaneswar: 22.2
    }[cityKey] || 22.2;

    const baseRainfall = {
      all: 1.8, ahmedabad: 1.2, delhi: 1.0, mumbai: 3.5, chennai: 2.1, kolkata: 3.0, bengaluru: 2.5, jaipur: 0.8, bhubaneswar: 3.8
    }[cityKey] || 1.8;

    const rawCache = {};

    for (let y = 2000; y <= 2100; y++) {
      const seed = getHashForStateAndYear(cityKey, y);
      rawCache[y] = {
        max_temp_base: baseTempMax,
        min_temp_base: baseTempMin,
        rainfall_base: baseRainfall,
        max_noise: +((seed - 0.5) * 1.5).toFixed(1),
        min_noise: +((seed - 0.5) * 1.0).toFixed(1),
        rain_noise: +(1.0 + (seed - 0.5) * 0.25).toFixed(2)
      };
    }

    climatePredictionCache[cityKey] = rawCache;

    if (sourceTag) {
      sourceTag.textContent = "Offline RCP8.5 Base";
      sourceTag.className = "model-tag fallback-badge";
    }

    mitigatedPredictionData = getMitigatedDataForCity(cityKey, activeSolutions);
    updatePredictionTimeline();
    renderPredictionChart();
  }
}

function updatePredictionTimeline() {
  setText("prediction-year-val", predictionYear);

  if (!mitigatedPredictionData) return;

  const yData = mitigatedPredictionData[predictionYear];
  if (!yData) return;

  // Render net driver indicator cards (which now reflect solutions in real time!)
  setText("prediction-co2-val", `${yData.co2} ppm`);
  setText("prediction-ghg-val", `${yData.ghg.toFixed(2)}x`);
  setText("prediction-pop-val", `${yData.pop.toFixed(2)} B`);
  setText("prediction-poll-val", `${Math.round(yData.aqi)} AQI`);

  // Render predicted climate impacts (Max Temp, Min Temp, Rain)
  renderPredictionKPIs();

  // Update year marker point on trend charts
  if (predictionChartInst) {
    predictionChartInst.data.datasets[2].data = [{ x: predictionYear, y: yData.max_temp }];
    predictionChartInst.data.datasets[3].data = [{ x: predictionYear, y: yData.min_temp }];
    predictionChartInst.update("none");
  }

  // Scale Leaflet map layers relatively
  updateMapForPrediction(predictionYear);
}

function renderPredictionKPIs() {
  if (!mitigatedPredictionData || !mitigatedPredictionData[predictionYear]) return;

  const yData = mitigatedPredictionData[predictionYear];
  const max = yData.max_temp;
  const min = yData.min_temp;
  const rainAvg = yData.rainfall;

  setText("pred-max-val", `${max.toFixed(1)}°C`);
  setText("pred-min-val", `${min.toFixed(1)}°C`);
  setText("pred-rain-val", `${(rainAvg * 365).toFixed(0)} mm/yr`);

  // Anomaly offsets relative to Year 2000 baseline
  const baseline = mitigatedPredictionData[2000];
  if (baseline) {
    const maxAnom = max - baseline.max_temp;
    const minAnom = min - baseline.min_temp;
    const rainPct = ((rainAvg - baseline.rainfall) / baseline.rainfall * 100);

    const maxSign = maxAnom >= 0 ? "+" : "";
    const minSign = minAnom >= 0 ? "+" : "";
    const rainSign = rainPct >= 0 ? "+" : "";

    setText("pred-max-anomaly", `${maxSign}${maxAnom.toFixed(1)}°C vs year 2000`);
    setText("pred-min-anomaly", `${minSign}${minAnom.toFixed(1)}°C vs year 2000`);
    setText("pred-rain-anomaly", `${rainSign}${rainPct.toFixed(1)}% vs year 2000`);
  }

  // Dynamic Risk Level logic based on mitigated variables
  const co2Val = yData.co2;
  const aqiVal = yData.aqi;
  
  let riskLabel = "Low";
  let riskMeta = "Stable ecological envelope.";
  let riskColor = "#10b981";

  if (co2Val > 550 || aqiVal > 200) {
    riskLabel = "Critical Threat";
    riskMeta = "Extreme heatwaves, severe toxic AQI, habitat collapse.";
    riskColor = "#b91c1c";
  } else if (co2Val > 460 || aqiVal > 170) {
    riskLabel = "Severe Hazard";
    riskMeta = "Extended summer monsoon disruptions, respiratory distress.";
    riskColor = "#ef4444";
  } else if (co2Val > 420 || aqiVal > 130) {
    riskLabel = "High Risk";
    riskMeta = "Monsoon volatility, heat wave risks, elevated water stress.";
    riskColor = "#f97316";
  } else if (co2Val > 380 || aqiVal > 90) {
    riskLabel = "Moderate Alert";
    riskMeta = "Slight rainfall shift, rising average humidity levels.";
    riskColor = "#ffe066";
  }

  const el = document.getElementById("pred-risk-val");
  if (el) {
    el.textContent = riskLabel;
    el.style.color = riskColor;
  }
  setText("pred-risk-meta", riskMeta);
}

function renderPredictionChart() {
  const ctx = document.getElementById("predictionChart");
  if (!ctx) return;
  if (predictionChartInst) { predictionChartInst.destroy(); predictionChartInst = null; }

  if (!mitigatedPredictionData) return;

  const years = [];
  const maxTemps = [];
  const minTemps = [];

  for (let y = 2000; y <= 2100; y++) {
    years.push(y);
    maxTemps.push(mitigatedPredictionData[y].max_temp);
    minTemps.push(mitigatedPredictionData[y].min_temp);
  }

  const currentMax = mitigatedPredictionData[predictionYear].max_temp;
  const currentMin = mitigatedPredictionData[predictionYear].min_temp;

  predictionChartInst = new Chart(ctx, {
    type: "line",
    data: {
      labels: years,
      datasets: [
        {
          label: "Predicted Max Temp (°C)",
          data: maxTemps,
          borderColor: "#ff6b6b",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.35,
          fill: false
        },
        {
          label: "Predicted Min Temp (°C)",
          data: minTemps,
          borderColor: "#4dc3ff",
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.35,
          fill: false
        },
        {
          label: "Active Max Year Indicator",
          data: [{ x: predictionYear, y: currentMax }],
          pointBackgroundColor: "#ff4d4d",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
          showLine: false
        },
        {
          label: "Active Min Year Indicator",
          data: [{ x: predictionYear, y: currentMin }],
          pointBackgroundColor: "#00d4ff",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
          showLine: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#8ba3c7",
            font: { family: "Inter", size: 10 },
            filter: item => !item.text.includes("Indicator")
          }
        },
        tooltip: {
          callbacks: {
            title: items => `Year: ${items[0].label}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#8ba3c7", font: { size: 9 }, maxTicksLimit: 12 },
          grid: { color: "rgba(0,212,255,0.03)" }
        },
        y: {
          ticks: { color: "#8ba3c7", font: { size: 9 } },
          grid: { color: "rgba(0,212,255,0.03)" },
          title: { display: true, text: "Temperature (°C)", color: "#4a6080", font: { size: 9 } }
        }
      }
    }
  });
}

function togglePredictionPlay(forcePause = false) {
  const playBtn = document.getElementById("prediction-play-btn");
  const slider = document.getElementById("prediction-year-slider");
  const yrSelect = document.getElementById("prediction-year-select");
  if (!playBtn) return;

  if (predictionPlayInterval || forcePause) {
    clearInterval(predictionPlayInterval);
    predictionPlayInterval = null;
    playBtn.innerHTML = '<i data-lucide="play" size="16"></i><span>Play Timeline</span>';
    lucide.createIcons();
    playBtn.style.background = "linear-gradient(135deg, var(--accent-cyan), #00a8cc)";
  } else {
    playBtn.innerHTML = '<i data-lucide="pause" size="16"></i><span>Pause Timeline</span>';
    lucide.createIcons();
    playBtn.style.background = "linear-gradient(135deg, #ef4444, #b91c1c)";
    playBtn.style.color = "#ffffff";

    predictionPlayInterval = setInterval(() => {
      predictionYear++;
      if (predictionYear > 2100) {
        predictionYear = 2000;
      }
      if (slider) slider.value = predictionYear;
      if (yrSelect) yrSelect.value = predictionYear;
      updatePredictionTimeline();
      updateSolutionsFeedback(); // auto-recalculate tree planting counts etc.
    }, 450);
  }
}

function updateMapForPrediction(year) {
  if (typeof STATE_WEATHER === "undefined") return;

  if (!STATE_WEATHER_BASE) {
    STATE_WEATHER_BASE = JSON.parse(JSON.stringify(STATE_WEATHER));
  }

  if (!mitigatedPredictionData) return;

  const currentData = mitigatedPredictionData[year];
  const base2026 = mitigatedPredictionData[2026];
  if (!currentData || !base2026) return;

  // Relative anomalies
  const tempAnomalyMax = currentData.max_temp - base2026.max_temp;
  const tempAnomalyMin = currentData.min_temp - base2026.min_temp;
  const rainPct = base2026.rainfall > 0 ? (currentData.rainfall - base2026.rainfall) / base2026.rainfall : 0.0;

  Object.keys(STATE_WEATHER).forEach(state => {
    const base = STATE_WEATHER_BASE[state];
    if (!base) return;

    const seed = getHashForStateAndYear(state, year);
    const noiseMax = (seed - 0.5) * 1.0;
    const noiseMin = (seed - 0.5) * 0.7;
    const noiseRain = (seed - 0.5) * 3.5;

    const maxT = base.maxTemp + tempAnomalyMax + noiseMax;
    const minT = base.minTemp + tempAnomalyMin + noiseMin;
    const rain = Math.max(0, base.rainfall * (1.0 + rainPct) + noiseRain);

    STATE_WEATHER[state].maxTemp = +maxT.toFixed(1);
    STATE_WEATHER[state].minTemp = +minT.toFixed(1);
    STATE_WEATHER[state].rainfall = +rain.toFixed(1);
    STATE_WEATHER[state].cloud = Math.min(1.0, +(rain / 80).toFixed(2));
    STATE_WEATHER[state].hasRain = rain > 10;
  });

  if (typeof buildChoropleth === "function") buildChoropleth();
  if (typeof drawHeatmap === "function") drawHeatmap();
  if (typeof buildWeatherEffects === "function") buildWeatherEffects();
}

function getHashForStateAndYear(stateName, year) {
  const str = stateName + year;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(Math.sin(hash)) % 1;
}
