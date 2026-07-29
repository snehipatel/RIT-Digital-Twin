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
let currentPage       = "dashboard";
let forecastSelDay    = 0;          // index into FORECAST_7DAY_EXTENDED
let forecastCityKey   = "all";
let alertFilterStatus = "all";
let alertFilterSev    = "all";
let reportCityKey     = "all";

// Chart instances for non-dashboard pages (destroy/recreate on page switch)
let forecastTempChartInst = null;
let forecastRainChartInst = null;
let reportTempChartInst = null;
let reportRainChartInst = null;
let whatifChartInst   = null;

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
  wireCitySelect("forecast-city-select",  onForecastCityChange);
  wireCitySelect("whatif-city-select",    onWhatIfCityChange);
  wireCitySelect("report-city-select",    onReportCityChange);

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
    forecast:  "Forecast Mode",
    whatif:    "Simulation Mode",
    alerts:    "Alert Coverage",
    reports:   "Report Mode",
    about:     "Info Mode"
  };
  setText("map-mode-tag", modeLabels[name] || "Dashboard Mode");

  // Page-specific init (only on first load or data-change triggers)
  if (name === "forecast")  initForecastPage();
  if (name === "alerts")    initAlertsPage();
  if (name === "reports")   initReportsPage();
  if (name === "about")     lucide.createIcons();

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
    ["dashboard-city-select","forecast-city-select",
     "whatif-city-select","report-city-select"].forEach(id => {
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
  renderForecastCalendar();
  if (forecastSelDay >= 0) renderForecastDayStats(forecastSelDay);
}

function onWhatIfCityChange(city) {
  const master = document.getElementById("region-select");
  if (master) { master.value = city; master.dispatchEvent(new Event("change")); }
  // Reset sliders to city baseline
  const off = CITY_FORECAST_DATA[city]?.offsets || { max: 0, min: 0, rain: 0, hum: 0 };
  const s = CLIMATE_DATA.all_india_summary;
  setSliderVal("wi-maxtemp-slider", "wi-maxtemp-val", +(s.max_temp + off.max).toFixed(1), "°C");
  setSliderVal("wi-mintemp-slider", "wi-mintemp-val", +(s.min_temp + (off.min||0)).toFixed(1), "°C");
  setSliderVal("wi-rain-slider",    "wi-rain-val",    Math.max(0, +(s.rainfall_24h + off.rain).toFixed(1)), " mm");
  setSliderVal("wi-hum-slider",     "wi-hum-val",     Math.max(0, +(s.humidity + (off.hum||0))), "%");
  resetWhatIfResults();
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
          minTemp: +(s.min_temp + (off.min||0)).toFixed(1),
          rainfall: Math.max(0, +(s.rainfall_24h + off.rain).toFixed(1)),
          humidity: Math.max(0, Math.min(100, s.humidity + (off.hum||0)))
        };
      })();

  const todayMax  = values.maxTemp;
  const todayMin  = values.minTemp;
  const todayRain = values.rainfall;
  const todayHum  = values.humidity;

  // Yesterday deltas
  const deltas = { max: +1.2, min: +0.6, rain: -4.3, hum: -2 };

  setText("comp-max",  `${todayMax}°C`);
  setText("comp-min",  `${todayMin}°C`);
  setText("comp-rain", `${Math.max(0, todayRain)} mm`);
  setText("comp-hum",  `${todayHum}%`);

  setCompDelta("comp-max-delta",  deltas.max,  "°C");
  setCompDelta("comp-min-delta",  deltas.min,  "°C");
  setCompDelta("comp-rain-delta", deltas.rain, " mm");
  setCompDelta("comp-hum-delta",  deltas.hum,  "%");
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
function initForecastPage() {
  renderForecastCalendar();
  // Select today (day 0) by default
  if (forecastSelDay === 0) {
    setTimeout(() => selectForecastDay(0), 50);
  } else {
    renderForecastDayStats(forecastSelDay);
  }
  renderForecastTempChart();
  renderForecastRainChart();
  lucide.createIcons();
}

function renderForecastCalendar() {
  const container = document.getElementById("forecast-calendar");
  if (!container) return;

  const off = CITY_FORECAST_DATA[forecastCityKey]?.offsets || { max: 0, min: 0, rain: 0 };

  container.innerHTML = FORECAST_7DAY_EXTENDED.map((day, i) => {
    const adjMax  = +(day.max_temp + off.max).toFixed(1);
    const adjRain = Math.max(0, +(day.rainfall + off.rain).toFixed(1));
    const cond    = getConditionFromData(adjMax, adjRain);
    const isToday = i === 0;

    return `
      <div class="forecast-day-cell ${cond.bgClass} ${i === forecastSelDay ? "selected" : ""}"
           data-day="${i}" id="fdc-${i}" onclick="selectForecastDay(${i})">
        <div class="fdc-weekday">${isToday ? "TODAY" : day.date.toLocaleDateString("en-IN", { weekday: "short" }).toUpperCase()}</div>
        <div class="fdc-day">${day.date.getDate()}</div>
        <div class="fdc-icon">${cond.icon}</div>
        <div class="fdc-month">${day.date.toLocaleDateString("en-IN", { month: "short" })}</div>
        <div class="fdc-temp">${adjMax}° / ${+(day.min_temp + (off.min||0)).toFixed(1)}°</div>
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
  const dayISO = FORECAST_7DAY_EXTENDED[idx].dateISO;
  const fdInput = document.getElementById("forecast-date");
  if (fdInput) {
    fdInput.value = dayISO;
    fdInput.dispatchEvent(new Event("change"));
  }
}

function renderForecastDayStats(idx) {
  const day = FORECAST_7DAY_EXTENDED[idx];
  if (!day) return;

  const off = CITY_FORECAST_DATA[forecastCityKey]?.offsets || { max: 0, min: 0, rain: 0, hum: 0 };
  const adjMax  = +(day.max_temp  + off.max).toFixed(1);
  const adjMin  = +(day.min_temp  + (off.min||0)).toFixed(1);
  const adjRain = Math.max(0, +(day.rainfall + off.rain).toFixed(1));
  const adjHum  = Math.max(0, Math.min(100, day.humidity + (off.hum||0)));
  const cond    = getConditionFromData(adjMax, adjRain);

  // Selected header
  setText("fc-sel-icon",  cond.icon);
  setText("fc-sel-label", day.dateLabel);
  setText("fc-sel-cond",  cond.label + " — " + day.date.toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" }));
  setText("fc-city-desc", CITY_FORECAST_DATA[forecastCityKey]?.desc || "");

  // KPIs
  setText("fc-max-val",  `${adjMax}°C`);
  setText("fc-min-val",  `${adjMin}°C`);
  setText("fc-rain-val", `${adjRain} mm`);
  setText("fc-hum-val",  `${adjHum}%`);
}

function renderForecastTempChart() {
  const ctx = document.getElementById("forecastTempChart");
  if (!ctx) return;
  if (forecastTempChartInst) { forecastTempChartInst.destroy(); forecastTempChartInst = null; }

  const off = CITY_FORECAST_DATA[forecastCityKey]?.offsets || { max: 0, min: 0, rain: 0 };
  const labels  = FORECAST_7DAY_EXTENDED.map(d => d.dateLabel);
  const maxData = FORECAST_7DAY_EXTENDED.map(d => +(d.max_temp + off.max).toFixed(1));
  const minData = FORECAST_7DAY_EXTENDED.map(d => +(d.min_temp + (off.min||0)).toFixed(1));

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

  const off = CITY_FORECAST_DATA[forecastCityKey]?.offsets || { max: 0, min: 0, rain: 0 };
  const labels   = FORECAST_7DAY_EXTENDED.map(d => d.dateLabel);
  const rainData = FORECAST_7DAY_EXTENDED.map(d => Math.max(0, +(d.rainfall + off.rain).toFixed(1)));

  const barColors = rainData.map(v =>
    v === 0          ? "rgba(74,96,128,0.4)" :
    v < 10           ? "rgba(0,229,204,0.5)" :
    v < 40           ? "rgba(0,212,255,0.65)" :
    v < 80           ? "rgba(59,130,246,0.75)" :
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
// ALERTS PAGE
// ══════════════════════════════════════════
function initAlertsPage() {
  updateAlertStats();
  renderAlertCards();
  bindAlertFilters();
  lucide.createIcons();
}

function updateAlertStats() {
  const counts = { critical: 0, high: 0, moderate: 0, low: 0 };
  ALERTS_FULL.forEach(a => { if (counts[a.severity] !== undefined) counts[a.severity]++; });
  setText("stat-critical", counts.critical);
  setText("stat-high",     counts.high);
  setText("stat-moderate", counts.moderate);
  setText("stat-low",      counts.low);
  setText("nav-alerts-badge", ALERTS_FULL.filter(a => a.status === "active").length);
  setText("alert-count",      ALERTS_FULL.filter(a => a.status === "active").length);
}

function renderAlertCards() {
  const container = document.getElementById("alert-cards-list");
  if (!container) return;

  let alerts = ALERTS_FULL;

  if (alertFilterStatus !== "all") alerts = alerts.filter(a => a.status === alertFilterStatus);
  if (alertFilterSev    !== "all") alerts = alerts.filter(a => a.severity === alertFilterSev);

  if (alerts.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--text-muted);font-size:14px">
        <div style="font-size:40px;margin-bottom:12px">🔍</div>
        No alerts match the selected filters.
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
            <div class="alert-card-city">${a.city}</div>
            <div class="alert-card-states">${a.states.join(" · ")}</div>
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
  const active = ALERTS_FULL.filter(a => a.status === "active").length;
  setText("nav-alerts-badge", active);
  setText("alert-count",      active);
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

  const off  = CITY_FORECAST_DATA[cityKey]?.offsets || { max: 0, min: 0, rain: 0, hum: 0 };
  const s    = CLIMATE_DATA.all_india_summary;
  const day0 = FORECAST_7DAY_EXTENDED[0];

  const adjMax  = +(s.max_temp     + off.max).toFixed(1);
  const adjMin  = +(s.min_temp     + (off.min||0)).toFixed(1);
  const adjRain = Math.max(0, +(s.rainfall_24h + off.rain).toFixed(1));
  const adjHum  = Math.max(0, Math.min(100, s.humidity + (off.hum||0)));
  const adjWind = Math.max(0, day0.wind_speed + Math.round(off.max * 0.4));
  const cond    = getConditionFromData(adjMax, adjRain);

  // Header date tag
  const dateObj = dateISO ? new Date(dateISO + "T00:00:00") : new Date();
  const dateLabel = dateObj.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  setText("report-date-tag", dateLabel);

  // KPIs
  setText("rep-max-val",  `${adjMax}°C`);
  setText("rep-min-val",  `${adjMin}°C`);
  setText("rep-rain-val", `${adjRain} mm`);
  setText("rep-hum-val",  `${adjHum}%`);
  setText("rep-wind-val", `${adjWind} km/h`);
  setText("rep-cond-val", cond.icon + " " + cond.label);

  // AI Summary
  const summary = REPORT_SUMMARIES[cityKey] || REPORT_SUMMARIES["all"];
  const aiEl = document.getElementById("ai-summary-text");
  if (aiEl) {
    aiEl.innerHTML = "";
    typewriterEffect(aiEl, summary, 12);
  }

  // Charts
  renderReportCharts(cityKey);
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
    const dateEl  = document.getElementById("report-date-input");
    const dateStr = dateEl?.value || new Date().toISOString().split("T")[0];
    const cityEl  = document.getElementById("report-city-select");
    const cityLbl = cityEl?.options[cityEl.selectedIndex]?.text || "All India";

    const off = CITY_FORECAST_DATA[reportCityKey]?.offsets || { max: 0, min: 0, rain: 0, hum: 0 };
    const s   = CLIMATE_DATA.all_india_summary;
    const adjMax  = +(s.max_temp + off.max).toFixed(1);
    const adjMin  = +(s.min_temp + (off.min||0)).toFixed(1);
    const adjRain = Math.max(0, +(s.rainfall_24h + off.rain).toFixed(1));
    const adjHum  = Math.max(0, Math.min(100, s.humidity + (off.hum||0)));
    const summary = REPORT_SUMMARIES[reportCityKey] || REPORT_SUMMARIES["all"];

    const printWin = window.open("", "_blank", "width=900,height=700");
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>ClimaTwin India — Climate Report</title>
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
        <h1>🛰️ ClimaTwin India — Climate Report <span class="badge">ISRO Hackathon 2025</span></h1>
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
          ClimaTwin India v1.0 · ISRO Hackathon 2025
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
function initWhatIfPageSliders() {
  const sliders = [
    { slider: "wi-maxtemp-slider", val: "wi-maxtemp-val", suffix: "°C" },
    { slider: "wi-mintemp-slider", val: "wi-mintemp-val", suffix: "°C" },
    { slider: "wi-rain-slider",    val: "wi-rain-val",    suffix: " mm" },
    { slider: "wi-hum-slider",     val: "wi-hum-val",     suffix: "%" },
    { slider: "co2-slider",        val: "co2-slider-val", suffix: " ppm" }
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

// Override runSimulation to also show the chart on this page
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

function computeWhatIfAbsolute(maxTemp, minTemp, rainfall, humidity, co2) {
  const baseMax  = CLIMATE_DATA.all_india_summary.max_temp;
  const baseMin  = CLIMATE_DATA.all_india_summary.min_temp;
  const baseRain = CLIMATE_DATA.all_india_summary.rainfall_24h;

  const dT = +(maxTemp - baseMax).toFixed(1);
  const dR = rainfall > 0 ? Math.round(((rainfall - baseRain) / baseRain) * 100) : -100;

  const heatwaveDays = maxTemp > 40 ? Math.round((maxTemp - 40) * 1.8) : 0;
  const floodRisk    = rainfall > 80 ? "High" : rainfall > 40 ? "Moderate" : "Low";
  const droughtRisk  = rainfall < 5  ? "High" : rainfall < 15 ? "Moderate" : "Low";
  const agriRisk     = maxTemp > 42 || rainfall > 80 || rainfall < 5 ? "High" : maxTemp > 38 ? "Moderate" : "Low";
  const waterStress  = maxTemp > 38 && rainfall < 20 ? Math.round((maxTemp - 38) * 4 + (20 - rainfall) * 0.5) : 0;
  const co2Effect    = co2 > 450 ? `+${((co2 - 420) * 0.012).toFixed(2)}°C radiative forcing` : "Baseline (420 ppm)";
  const heatIndex    = +(maxTemp + (humidity - 40) * 0.05).toFixed(1);

  return {
    scenario: `Max ${maxTemp}°C · Min ${minTemp}°C · Rain ${rainfall}mm · Hum ${humidity}%`,
    proj_max_temp: maxTemp,
    proj_min_temp: minTemp,
    proj_rainfall: rainfall,
    proj_humidity: humidity,
    heatwave_days_added: heatwaveDays,
    flood_risk: floodRisk,
    drought_risk: droughtRisk,
    agriculture_risk: agriRisk,
    water_stress: waterStress,
    co2_forcing: co2Effect,
    heat_index: heatIndex,
    dT, dR, co2
  };
}

function displayWhatIfResults(result, maxTemp, minTemp, rainfall, humidity, co2) {
  const placeholder = document.getElementById("results-placeholder");
  const grid = document.getElementById("results-grid");
  if (!placeholder || !grid) return;

  placeholder.style.display = "none";
  grid.style.display = "grid";

  const riskClass = r =>
    r === "Severe" || r === "High" ? "high" : r === "Moderate" ? "moderate" : "low";

  const trendArrow = (orig, proj) => {
    const diff = +(proj - orig).toFixed(1);
    const cls  = diff > 0 ? "positive" : diff < 0 ? "negative" : "neutral";
    const sym  = diff > 0 ? "▲" : diff < 0 ? "▼" : "─";
    return `<span class="${cls}">${sym} ${diff >= 0 ? "+" : ""}${diff}</span>`;
  };

  const s = CLIMATE_DATA.all_india_summary;

  grid.innerHTML = `
    <div class="scenario-tag">
      💡 Scenario: <strong>${result.scenario}</strong>
    </div>

    <div class="result-item animate-in" style="animation-delay:0s">
      <div class="result-label">PROJECTED MAX TEMP</div>
      <div class="result-value" style="color:#ff6b6b">${result.proj_max_temp}°C</div>
      <div class="result-change">${trendArrow(s.max_temp, result.proj_max_temp)}°C vs baseline</div>
    </div>

    <div class="result-item animate-in" style="animation-delay:0.07s">
      <div class="result-label">PROJECTED MIN TEMP</div>
      <div class="result-value" style="color:#4dc3ff">${result.proj_min_temp}°C</div>
      <div class="result-change">${trendArrow(s.min_temp, result.proj_min_temp)}°C vs baseline</div>
    </div>

    <div class="result-item animate-in" style="animation-delay:0.14s">
      <div class="result-label">PROJECTED RAINFALL</div>
      <div class="result-value" style="color:#00e5cc">${result.proj_rainfall} mm</div>
      <div class="result-change">${trendArrow(s.rainfall_24h, result.proj_rainfall)} mm vs baseline</div>
    </div>

    <div class="result-item animate-in" style="animation-delay:0.21s">
      <div class="result-label">HEAT INDEX</div>
      <div class="result-value" style="color:${result.heat_index > 42 ? '#ff4d4d' : '#f59e0b'}">${result.heat_index}°C</div>
      <div class="result-change" style="color:#8ba3c7">Feels-like temperature</div>
    </div>

    <div class="result-item animate-in" style="animation-delay:0.28s">
      <div class="result-label">HEATWAVE DAYS</div>
      <div class="result-value" style="color:${result.heatwave_days_added > 0 ? '#ff6b6b' : '#10b981'}">
        ${result.heatwave_days_added > 0 ? "+" : ""}${result.heatwave_days_added}
      </div>
      <div class="result-change" style="color:#8ba3c7">Additional extreme days</div>
    </div>

    <div class="result-item animate-in" style="animation-delay:0.35s">
      <div class="result-label">AGRICULTURE RISK</div>
      <div class="result-value" style="font-size:14px;padding-top:6px">
        <span class="risk-badge ${riskClass(result.agriculture_risk)}">${result.agriculture_risk}</span>
      </div>
      <div class="result-change" style="color:#8ba3c7;font-size:10px;margin-top:6px">Kharif season impact</div>
    </div>

    <div class="result-item animate-in" style="animation-delay:0.42s">
      <div class="result-label">FLOOD RISK</div>
      <div class="result-value" style="font-size:14px;padding-top:6px">
        <span class="risk-badge ${riskClass(result.flood_risk)}">${result.flood_risk}</span>
      </div>
      <div class="result-change" style="color:#8ba3c7;font-size:10px;margin-top:6px">River basin analysis</div>
    </div>

    <div class="result-item animate-in" style="animation-delay:0.49s">
      <div class="result-label">WATER STRESS</div>
      <div class="result-value" style="color:${result.water_stress > 15 ? '#f59e0b' : '#10b981'}">${result.water_stress}%</div>
      <div class="result-change" style="color:#8ba3c7">Groundwater demand</div>
    </div>

    ${co2 !== 420 ? `
    <div class="result-item animate-in" style="animation-delay:0.56s;grid-column:1/-1">
      <div class="result-label">CO₂ RADIATIVE FORCING</div>
      <div class="result-value" style="font-size:14px;color:#a78bfa">${result.co2_forcing}</div>
      <div class="result-change" style="color:#8ba3c7">vs pre-industrial 280 ppm baseline</div>
    </div>` : ""}
  `;

  // Also update map with simulated values
  updateMapForWhatIf(maxTemp, rainfall);
}

function updateMapForWhatIf(maxTemp, rainfall) {
  // Trigger the existing map layer update via forecast date change jitter
  // The map will re-render with the closest data approximation
  try {
    if (typeof updateMapLayer === "function") updateMapLayer();
  } catch (e) { /* silent */ }
}

function renderWhatIfChart(maxTemp, minTemp, rainfall) {
  const cc = document.getElementById("whatif-chart-card");
  if (cc) cc.style.display = "";

  const ctx = document.getElementById("whatifChart");
  if (!ctx) return;
  if (whatifChartInst) { whatifChartInst.destroy(); whatifChartInst = null; }

  // Show comparison: baseline 7-day vs simulated 7-day
  const labels   = FORECAST_7DAY_EXTENDED.map(d => d.dateLabel);
  const baseMax  = FORECAST_7DAY_EXTENDED.map(d => d.max_temp);
  const simMax   = FORECAST_7DAY_EXTENDED.map(d => {
    const delta = maxTemp - CLIMATE_DATA.all_india_summary.max_temp;
    return +(d.max_temp + delta).toFixed(1);
  });
  const simRain  = FORECAST_7DAY_EXTENDED.map(d => Math.max(0, +(d.rainfall * (rainfall / Math.max(1, CLIMATE_DATA.all_india_summary.rainfall_24h))).toFixed(1)));

  whatifChartInst = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        { type: "line", label: "Baseline Max (°C)", data: baseMax, borderColor: "#4a6080", backgroundColor: "transparent", borderDash: [4,3], pointRadius: 2, borderWidth: 1.5, tension: 0.4, yAxisID: "yT" },
        { type: "line", label: "Simulated Max (°C)", data: simMax, borderColor: "#ff6b6b", backgroundColor: "rgba(255,107,107,0.08)", pointBackgroundColor: "#ff6b6b", pointRadius: 3, borderWidth: 2, tension: 0.4, fill: true, yAxisID: "yT" },
        { type: "bar",  label: "Simulated Rain (mm)", data: simRain, backgroundColor: "rgba(0,212,255,0.4)", borderRadius: 4, yAxisID: "yR" }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 700 },
      plugins: {
        legend: { labels: { color: "#8ba3c7", font: { family: "Inter", size: 11 }, boxWidth: 10 } },
        tooltip: { backgroundColor: "#111c35", borderColor: "rgba(0,212,255,0.25)", borderWidth: 1, titleColor: "#00d4ff", bodyColor: "#e8f4ff", padding: 10, cornerRadius: 8 }
      },
      scales: {
        x:  { ticks: { color: "#8ba3c7", font: { size: 10 } }, grid: { color: "rgba(0,212,255,0.05)" } },
        yT: { position: "left",  ticks: { color: "#8ba3c7", font: { size: 10 } }, grid: { color: "rgba(0,212,255,0.05)" }, title: { display: true, text: "Temp (°C)", color: "#4a6080", font: { size: 9 } } },
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
