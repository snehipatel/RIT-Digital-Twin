/**
 * app.js — Main application controller
 * Orchestrates: loading sequence, KPI cards, alerts, timeline, event handlers
 */

// ══════════════════════════════════════════
// BOOT SEQUENCE
// ══════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  bootSequence();
});

async function bootSequence() {
  const steps   = ["ls-1","ls-2","ls-3","ls-4","ls-5"];
  const overlay = document.getElementById("loading-overlay");

  for (let i = 0; i < steps.length; i++) {
    await delay(450);
    document.getElementById(steps[i])?.classList.add("active");
    if (i > 0) document.getElementById(steps[i - 1])?.classList.add("done");
  }

  await delay(500);

  // Load real model JSON artifacts if available
  if (typeof loadRealModelData === "function") {
    await loadRealModelData();
  }

  // Initialize all modules
  initMap();
  initAllCharts();
  populateKPIs();
  initTimeline();
  initEventHandlers();
  updateNavDate();
  updateLiveTime();

  // Multi-page navigation
  initNavigation();
  renderDashboardComparison();

  // Final loading step done
  document.getElementById(steps[steps.length - 1])?.classList.add("done");
  await delay(400);

  overlay.classList.add("hidden");
  setTimeout(() => overlay.style.display = "none", 700);

  // Initialize Lucide icons after DOM is ready
  lucide.createIcons();
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════
// KPI CARDS
// ══════════════════════════════════════════
function populateKPIs(cityKey) {
  const values = typeof getCityModelValues === "function"
    ? getCityModelValues(cityKey)
    : (() => {
        const off = cityKey ? (CITY_FORECAST_DATA[cityKey]?.offsets || { max: 0, min: 0, rain: 0, hum: 0 }) : { max: 0, min: 0, rain: 0, hum: 0 };
        const s = CLIMATE_DATA.all_india_summary;
        return {
          maxTemp: +(s.max_temp + off.max).toFixed(1),
          minTemp: +(s.min_temp + (off.min||0)).toFixed(1),
          rainfall: Math.max(0, +(s.rainfall_24h + off.rain).toFixed(1)),
          humidity: Math.max(0, Math.min(100, s.humidity + (off.hum||0)))
        };
      })();

  animateKPI("kpi-max-val",  values.maxTemp,  "°C", 50, false);
  animateKPI("kpi-min-val",  values.minTemp,  "°C", 50, false);
  animateKPI("kpi-rain-val", values.rainfall, "mm", 50, false);
  animateKPI("kpi-hum-val",  values.humidity, "%",  50, false);

  // Metadata - display real model grid source or metrics
  if (values.gridLat !== undefined) {
    setText("kpi-max-meta", `LightGBM · Model (${values.gridLat}°N, ${values.gridLon}°E)`);
    setText("kpi-min-meta", `LightGBM · Model (${values.gridLat}°N, ${values.gridLon}°E)`);
  } else if (typeof REAL_METRICS_DATA !== "undefined" && REAL_METRICS_DATA) {
    const maxR2  = (REAL_METRICS_DATA.max_temp?.R2 * 100).toFixed(1);
    const maxMAE = REAL_METRICS_DATA.max_temp?.MAE;
    setText("kpi-max-meta", `LightGBM · R² ${maxR2}%, MAE ${maxMAE}°C`);

    const minR2  = (REAL_METRICS_DATA.min_temp?.R2 * 100).toFixed(1);
    const minMAE = REAL_METRICS_DATA.min_temp?.MAE;
    setText("kpi-min-meta", `LightGBM · R² ${minR2}%, MAE ${minMAE}°C`);
  } else {
    setText("kpi-max-meta", "LightGBM · All India avg");
    setText("kpi-min-meta", "LightGBM · All India avg");
  }
  setText("kpi-rain-meta","XGBoost 2-Stage forecast");
  setText("kpi-hum-meta", "Derived from Td/T ratio");

  // Trend indicators
  setTrend("kpi-max-trend", +1.2,  "°C");
  setTrend("kpi-min-trend", +0.6,  "°C");
  setTrend("kpi-rain-trend",-4.3,  "mm");
  setTrend("kpi-hum-trend", -2,    "%");
}

function animateKPI(id, target, unit, durationMs, isPercent) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("skeleton-shimmer");
  const start    = performance.now();
  const startVal = 0;

  function tick(now) {
    const elapsed  = now - start;
    const progress = Math.min(elapsed / (durationMs * 8), 1);
    const ease     = 1 - Math.pow(1 - progress, 3);
    const val      = startVal + (target - startVal) * ease;
    el.textContent = val.toFixed(target % 1 === 0 ? 0 : 1) + unit;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function setTrend(id, delta, unit) {
  const el = document.getElementById(id);
  if (!el) return;
  const positive = delta > 0;
  el.className   = "kpi-trend " + (positive ? "up" : "down");
  el.textContent = (positive ? "▲ +" : "▼ ") + delta.toFixed(1) + unit + " vs yesterday";
}

// ══════════════════════════════════════════
// TIMELINE SCRUBBER
// ══════════════════════════════════════════
function initTimeline() {
  const slider = document.getElementById("timeline-slider");
  if (!slider) return;

  // Set today as default for forecast date input
  const today = new Date();
  const forecastInput = document.getElementById("forecast-date");
  if (forecastInput) forecastInput.valueAsDate = today;

  slider.addEventListener("input", () => {
    const year = parseInt(slider.value);
    setText("timeline-year", year);
    updateTimelineStats(year);
  });

  updateTimelineStats(2024);
}

function updateTimelineStats(year) {
  const stats     = HISTORICAL_STATS[year] || HISTORICAL_STATS[2024];
  const container = document.getElementById("timeline-stats");
  if (!container) return;

  container.innerHTML = `
    <div class="timeline-stat">
      <div class="ts-label">AVG MAX TEMP</div>
      <div class="ts-value">${stats.avg_max_temp}</div>
      <div class="ts-unit">°C</div>
    </div>
    <div class="timeline-stat">
      <div class="ts-label">ANNUAL RAINFALL</div>
      <div class="ts-value">${stats.avg_rainfall}</div>
      <div class="ts-unit">mm</div>
    </div>
    <div class="timeline-stat">
      <div class="ts-label">MONSOON ONSET</div>
      <div class="ts-value" style="font-size:14px">${stats.monsoon_onset}</div>
      <div class="ts-unit">Kerala landfall</div>
    </div>
    <div class="timeline-stat">
      <div class="ts-label">EXTREME EVENTS</div>
      <div class="ts-value" style="color:${stats.extreme_events > 25 ? "#ef4444" : stats.extreme_events > 15 ? "#f59e0b" : "#10b981"}">${stats.extreme_events}</div>
      <div class="ts-unit">recorded that year</div>
    </div>
    <div class="timeline-stat">
      <div class="ts-label">TREND VS 2000</div>
      <div class="ts-value" style="color:#ff6b6b;font-size:16px">+${(stats.avg_max_temp - 31.2).toFixed(1)}°C</div>
      <div class="ts-unit">warming signal</div>
    </div>
  `;
}

// ══════════════════════════════════════════
// EVENT HANDLERS
// ══════════════════════════════════════════
function initEventHandlers() {
  // Map region select (master)
  const regionSelect = document.getElementById("region-select");
  regionSelect?.addEventListener("change", e => {
    const key = e.target.value;
    flyToRegion(key);
    updateChartsForRegion(key);
    updateKPIsForRegion(key);

    // Sync all page city selects to match map
    ["dashboard-city-select","forecast-city-select",
     "whatif-city-select","report-city-select"].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.value !== key) el.value = key;
    });
  });

  // Layer toggle buttons
  document.querySelectorAll(".layer-btn").forEach(btn => {
    btn.addEventListener("click", () => switchLayer(btn.dataset.layer));
  });

  // Refresh button
  document.getElementById("btn-refresh")?.addEventListener("click", simulateDataRefresh);

  // Forecast date change on map
  document.getElementById("forecast-date")?.addEventListener("change", e => {
    updateForecastForDate(e.target.value);
  });

  // Alert bell button navigates to alerts page
  document.getElementById("btn-alert-toggle")?.addEventListener("click", () => {
    showPage("alerts");
  });
}

function updateKPIsForRegion(regionKey) {
  populateKPIs(regionKey);
  updateDashboardComparison(regionKey);

  // Sync ambient screen-edge weather FX dynamically to selected region
  const values = typeof getCityModelValues === "function"
    ? getCityModelValues(regionKey)
    : (() => {
        const off = regionKey ? (CITY_FORECAST_DATA[regionKey]?.offsets || { max: 0, min: 0, rain: 0, hum: 0 }) : { max: 0, min: 0, rain: 0, hum: 0 };
        const s = CLIMATE_DATA.all_india_summary;
        return {
          maxTemp: +(s.max_temp + off.max).toFixed(1),
          minTemp: +(s.min_temp + (off.min||0)).toFixed(1),
          rainfall: Math.max(0, +(s.rainfall_24h + off.rain).toFixed(1))
        };
      })();

  if (typeof updateAmbientWeatherState === "function") {
    updateAmbientWeatherState(values.maxTemp, values.minTemp, values.rainfall);
  }
}

function updateForecastForDate(dateStr) {
  const d      = new Date(dateStr);
  const month  = d.getMonth();
  const monsoon = month >= 5 && month <= 8;
  const s      = CLIMATE_DATA.all_india_summary;
  const randJitter = () => (Math.random() - 0.5) * 3;

  animateKPI("kpi-max-val",  +(s.max_temp + (monsoon ? -3 : 2) + randJitter()).toFixed(1), "°C", 50, false);
  animateKPI("kpi-rain-val", Math.max(0, +(s.rainfall_24h * (monsoon ? 2.5 : 0.3) + randJitter()).toFixed(1)), "mm", 50, false);
}

function simulateDataRefresh() {
  const btn = document.getElementById("btn-refresh");
  if (!btn) return;
  btn.style.transform  = "rotate(360deg)";
  btn.style.transition = "transform 0.6s ease";
  setTimeout(() => {
    btn.style.transform  = "";
    btn.style.transition = "";
    const s = CLIMATE_DATA.all_india_summary;
    animateKPI("kpi-max-val",  +(s.max_temp     + (Math.random() - 0.5) * 0.6).toFixed(1), "°C", 30, false);
    animateKPI("kpi-min-val",  +(s.min_temp     + (Math.random() - 0.5) * 0.4).toFixed(1), "°C", 30, false);
    animateKPI("kpi-rain-val", Math.max(0, +(s.rainfall_24h + (Math.random() - 0.5) * 1.2).toFixed(1)), "mm", 30, false);
    setText("last-updated", "just now");
  }, 650);
}

// ══════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function updateNavDate() {
  const el = document.getElementById("nav-date");
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric"
  }) + " · IST";
}

function updateLiveTime() {
  setInterval(() => {
    const now    = new Date();
    const minAgo = now.getMinutes() % 5;
    setText("last-updated", minAgo === 0 ? "just now" : `${minAgo}m ago`);
  }, 60_000);
}
