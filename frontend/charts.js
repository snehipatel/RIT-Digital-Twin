/**
 * charts.js — Chart.js powered visualizations
 * Temperature trend, Rainfall bar, LSTM time-series
 */

let tempChart    = null;
let rainfallChart= null;
let lstmChart    = null;

// ── CHART DEFAULTS ──
const CHART_DEFAULTS = {
  animation: { duration: 800, easing: "easeInOutQuart" },
  plugins: {
    legend: {
      labels: {
        color:    "#8ba3c7",
        font:     { family: "Inter", size: 11 },
        boxWidth: 10,
        padding:  16
      }
    },
    tooltip: {
      backgroundColor: "#111c35",
      borderColor:     "rgba(0,212,255,0.25)",
      borderWidth:     1,
      titleColor:      "#00d4ff",
      bodyColor:       "#e8f4ff",
      padding:         10,
      cornerRadius:    8,
      displayColors:   true
    }
  },
  scales: {
    x: {
      ticks: { color: "#8ba3c7", font: { size: 10 } },
      grid:  { color: "rgba(0,212,255,0.05)", drawBorder: false }
    },
    y: {
      ticks: { color: "#8ba3c7", font: { size: 10 } },
      grid:  { color: "rgba(0,212,255,0.05)", drawBorder: false }
    }
  }
};

// ── TEMPERATURE TREND CHART ──
function initTempChart() {
  const ctx = document.getElementById("tempChart");
  if (!ctx) return;

  const labels  = FORECAST_7DAY.map(d => d.date);
  const maxData = FORECAST_7DAY.map(d => d.max_temp);
  const minData = FORECAST_7DAY.map(d => d.min_temp);

  tempChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label:           "Max Temp (°C)",
          data:            maxData,
          borderColor:     "#ff6b6b",
          backgroundColor: "rgba(255,107,107,0.12)",
          pointBackgroundColor: "#ff6b6b",
          pointRadius:     4,
          pointHoverRadius:7,
          borderWidth:     2.5,
          tension:         0.4,
          fill:            true
        },
        {
          label:           "Min Temp (°C)",
          data:            minData,
          borderColor:     "#4dc3ff",
          backgroundColor: "rgba(77,195,255,0.08)",
          pointBackgroundColor: "#4dc3ff",
          pointRadius:     4,
          pointHoverRadius:7,
          borderWidth:     2,
          tension:         0.4,
          fill:            true
        }
      ]
    },
    options: {
      responsive:         true,
      maintainAspectRatio:false,
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        y: {
          ...CHART_DEFAULTS.scales.y,
          min:   15,
          title: { display: true, text: "Temperature (°C)", color: "#4a6080", font: { size: 10 } }
        }
      }
    }
  });
}

// ── RAINFALL BAR CHART ──
function initRainfallChart() {
  const ctx = document.getElementById("rainfallChart");
  if (!ctx) return;

  const labels   = FORECAST_7DAY.map(d => d.date);
  const rainData = FORECAST_7DAY.map(d => d.rainfall);

  // Color bars by intensity
  const barColors = rainData.map(v =>
    v === 0          ? "rgba(74,96,128,0.4)" :
    v < 10           ? "rgba(0,229,204,0.5)" :
    v < 40           ? "rgba(0,212,255,0.65)":
    v < 80           ? "rgba(59,130,246,0.75)":
                       "rgba(124,58,237,0.85)"
  );

  rainfallChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label:           "Rainfall (mm)",
        data:            rainData,
        backgroundColor: barColors,
        borderColor:     rainData.map(v => v > 0 ? "#00d4ff" : "transparent"),
        borderWidth:     1,
        borderRadius:    4,
        borderSkipped:   false
      }]
    },
    options: {
      responsive:         true,
      maintainAspectRatio:false,
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: ctx => ` ${ctx.parsed.y} mm${ctx.parsed.y === 0 ? " — Dry day" : ""}`
          }
        }
      },
      scales: {
        ...CHART_DEFAULTS.scales,
        y: {
          ...CHART_DEFAULTS.scales.y,
          min:   0,
          title: { display: true, text: "Rainfall (mm)", color: "#4a6080", font: { size: 10 } }
        }
      }
    }
  });
}

// ── LSTM TIME-SERIES CHART ──
function initLSTMChart() {
  const ctx = document.getElementById("lstmChart");
  if (!ctx) return;

  const { labels, predicted, actual } = LSTM_SERIES;

  lstmChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label:            "LSTM Predicted",
          data:             predicted,
          borderColor:      "#a78bfa",
          backgroundColor:  "rgba(167,139,250,0.07)",
          pointBackgroundColor: "#a78bfa",
          pointRadius:      2,
          pointHoverRadius: 5,
          borderWidth:      2,
          borderDash:       [4, 2],
          tension:          0.4,
          fill:             true
        },
        {
          label:            "Observed",
          data:             actual,
          borderColor:      "#00d4ff",
          backgroundColor:  "transparent",
          pointBackgroundColor: "#00d4ff",
          pointRadius:      2,
          pointHoverRadius: 5,
          borderWidth:      2,
          tension:          0.4,
          fill:             false,
          spanGaps:         false
        }
      ]
    },
    options: {
      responsive:         true,
      maintainAspectRatio:false,
      animation:          { duration: 1200, easing: "easeInOutCubic" },
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: {
          ...CHART_DEFAULTS.plugins.legend,
          position: "top"
        },
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}°C`
          }
        }
      },
      scales: {
        x: {
          ...CHART_DEFAULTS.scales.x,
          ticks: {
            ...CHART_DEFAULTS.scales.x.ticks,
            maxTicksLimit: 8
          }
        },
        y: {
          ...CHART_DEFAULTS.scales.y,
          title: { display: true, text: "Temp (°C)", color: "#4a6080", font: { size: 9 } }
        }
      }
    }
  });
}

// ── UPDATE CHARTS ON REGION CHANGE ──
function updateChartsForRegion(regionKey) {
  if (typeof getCityModelValues === "function") {
    const vals = getCityModelValues(regionKey);
    const baseMax = vals.maxTemp;
    const baseMin = vals.minTemp;
    
    const maxData = FORECAST_7DAY.map((d, i) => +(baseMax + (i === 2 ? 1.6 : i === 5 ? -2.1 : (i - 3) * 0.4)).toFixed(1));
    const minData = FORECAST_7DAY.map((d, i) => +(baseMin + (i === 2 ? 0.8 : i === 5 ? -1.0 : (i - 3) * 0.2)).toFixed(1));
    
    updateTempChartData(maxData, minData);
    return;
  }

  if (regionKey === "all") {
    updateTempChartData(FORECAST_7DAY.map(d => d.max_temp), FORECAST_7DAY.map(d => d.min_temp));
  } else {
    const offset = { ahmedabad: 3, delhi: 4, mumbai: -1, chennai: -2, kolkata: 1, bengaluru: -3, jaipur: 5, bhubaneswar: 0 };
    const o = offset[regionKey] || 0;
    updateTempChartData(
      FORECAST_7DAY.map(d => +(d.max_temp + o + (Math.random() - 0.5)).toFixed(1)),
      FORECAST_7DAY.map(d => +(d.min_temp + o * 0.6 + (Math.random() - 0.5)).toFixed(1))
    );
  }
}

function updateTempChartData(maxData, minData) {
  if (!tempChart) return;
  tempChart.data.datasets[0].data = maxData;
  tempChart.data.datasets[1].data = minData;
  tempChart.update("active");
}

function initAllCharts() {
  initTempChart();
  initRainfallChart();
  initLSTMChart();
}
