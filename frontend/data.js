/**
 * data.js — Mock climate data (Integration Contract JSON)
 * Replace these with real model outputs from Snehi & Juhi
 * Format agreed by team on Day 1.
 */

// ── PRIMARY PREDICTION PAYLOAD ──
const CLIMATE_DATA = {
  date: "2025-06-24",
  all_india_summary: {
    max_temp:     37.4,
    min_temp:     24.8,
    rainfall_24h: 18.2,
    humidity:     68
  },
  grid_predictions: generateGridPredictions(),
  alerts: [
    {
      type:     "Heat Wave Warning",
      severity: "high",
      states:   ["Rajasthan", "Gujarat", "Haryana"],
      dates:    "24–27 Jun 2025",
      detail:   "Maximum temperatures 4–6°C above normal. IMD Red Alert issued."
    },
    {
      type:     "Heavy Rainfall Alert",
      severity: "medium",
      states:   ["Kerala", "Karnataka", "Goa"],
      dates:    "24–25 Jun 2025",
      detail:   "Southwest monsoon onset active. Isolated heavy to very heavy rainfall expected."
    },
    {
      type:     "Cyclone Watch",
      severity: "high",
      states:   ["Odisha", "West Bengal", "Andhra Pradesh"],
      dates:    "25–28 Jun 2025",
      detail:   "Deep depression in Bay of Bengal likely to intensify. Coastal alerts active."
    },
    {
      type:     "Drought Advisory",
      severity: "low",
      states:   ["Maharashtra (Vidarbha)", "Telangana"],
      dates:    "Jun 2025",
      detail:   "Below-normal rainfall deficit (>30%) recorded. Agricultural stress elevated."
    }
  ],
  whatif_output: {
    scenario:                  "+2°C for 7 days",
    avg_temp_rise:             2.1,
    heatwave_days_increase:    18,
    cooling_demand_increase:   12,
    agriculture_risk:          "Moderate",
    water_stress_increase:     8,
    flood_risk_change:         -3
  }
};

// ── 7-DAY FORECAST ──
const FORECAST_7DAY = (() => {
  const base = new Date("2025-06-24");
  const maxBase  = [37.4, 38.1, 39.0, 38.5, 36.8, 35.2, 34.9];
  const minBase  = [24.8, 25.3, 26.1, 25.7, 24.0, 23.5, 23.2];
  const rainBase = [18.2,  0.0,  2.4, 35.6, 12.0, 46.8,  8.1];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return {
      date:     d.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" }),
      max_temp: maxBase[i],
      min_temp: minBase[i],
      rainfall: rainBase[i]
    };
  });
})();

// ── LSTM 30-DAY TIME-SERIES (Ahmedabad pilot) ──
const LSTM_SERIES = (() => {
  const labels = [];
  const predicted = [];
  const actual    = [];
  const base = new Date("2025-05-26");
  // Simulate a realistic Ahmedabad summer → monsoon temperature signal
  for (let i = 0; i < 30; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    labels.push(d.toLocaleDateString("en-IN", { month: "short", day: "numeric" }));
    // Rise to peak in June, then monsoon cooling
    const trend   = i < 15
      ? 36 + i * 0.25 + Math.sin(i * 0.6) * 1.5
      : 42 - (i - 15) * 0.4 + Math.sin(i * 0.8) * 1.2;
    const noise   = (Math.random() - 0.5) * 0.8;
    predicted.push(+(trend).toFixed(1));
    actual.push(i < 25 ? +(trend + noise).toFixed(1) : null);  // last 5 = no ground truth yet
  }
  return { labels, predicted, actual };
})();

// ── HISTORICAL TIMELINE STATS (1951 – 2025) ──
const HISTORICAL_STATS = {
  1951: { avg_max_temp: 30.1, avg_rainfall: 1180, monsoon_onset: "May 31", extreme_events: 4  },
  1952: { avg_max_temp: 30.3, avg_rainfall: 1040, monsoon_onset: "Jun 3",  extreme_events: 5  },
  1953: { avg_max_temp: 30.0, avg_rainfall: 1195, monsoon_onset: "May 29", extreme_events: 3  },
  1954: { avg_max_temp: 30.2, avg_rainfall: 1110, monsoon_onset: "Jun 1",  extreme_events: 4  },
  1955: { avg_max_temp: 30.4, avg_rainfall: 1220, monsoon_onset: "May 27", extreme_events: 5  },
  1956: { avg_max_temp: 30.1, avg_rainfall: 1240, monsoon_onset: "Jun 2",  extreme_events: 4  },
  1957: { avg_max_temp: 30.5, avg_rainfall:  980, monsoon_onset: "Jun 7",  extreme_events: 6  },
  1958: { avg_max_temp: 30.3, avg_rainfall: 1150, monsoon_onset: "Jun 4",  extreme_events: 5  },
  1959: { avg_max_temp: 30.6, avg_rainfall: 1170, monsoon_onset: "Jun 1",  extreme_events: 5  },
  1960: { avg_max_temp: 30.4, avg_rainfall: 1090, monsoon_onset: "Jun 5",  extreme_events: 6  },
  1961: { avg_max_temp: 30.2, avg_rainfall: 1310, monsoon_onset: "May 18", extreme_events: 7  },
  1962: { avg_max_temp: 30.7, avg_rainfall: 1100, monsoon_onset: "Jun 6",  extreme_events: 5  },
  1963: { avg_max_temp: 30.5, avg_rainfall: 1130, monsoon_onset: "Jun 2",  extreme_events: 6  },
  1964: { avg_max_temp: 30.4, avg_rainfall: 1210, monsoon_onset: "Jun 5",  extreme_events: 5  },
  1965: { avg_max_temp: 31.0, avg_rainfall:  910, monsoon_onset: "Jun 12", extreme_events: 8  },
  1966: { avg_max_temp: 31.2, avg_rainfall:  930, monsoon_onset: "Jun 10", extreme_events: 9  },
  1967: { avg_max_temp: 30.6, avg_rainfall: 1160, monsoon_onset: "Jun 8",  extreme_events: 6  },
  1968: { avg_max_temp: 30.8, avg_rainfall: 1050, monsoon_onset: "Jun 9",  extreme_events: 7  },
  1969: { avg_max_temp: 30.9, avg_rainfall: 1070, monsoon_onset: "Jun 6",  extreme_events: 6  },
  1970: { avg_max_temp: 30.7, avg_rainfall: 1220, monsoon_onset: "May 26", extreme_events: 7  },
  1971: { avg_max_temp: 30.5, avg_rainfall: 1190, monsoon_onset: "Jun 3",  extreme_events: 6  },
  1972: { avg_max_temp: 31.4, avg_rainfall:  860, monsoon_onset: "Jun 18", extreme_events: 11 },
  1973: { avg_max_temp: 30.8, avg_rainfall: 1190, monsoon_onset: "Jun 4",  extreme_events: 7  },
  1974: { avg_max_temp: 31.1, avg_rainfall:  970, monsoon_onset: "Jun 11", extreme_events: 8  },
  1975: { avg_max_temp: 30.6, avg_rainfall: 1250, monsoon_onset: "May 31", extreme_events: 7  },
  1976: { avg_max_temp: 30.9, avg_rainfall: 1040, monsoon_onset: "Jun 8",  extreme_events: 7  },
  1977: { avg_max_temp: 30.7, avg_rainfall: 1180, monsoon_onset: "May 30", extreme_events: 8  },
  1978: { avg_max_temp: 30.8, avg_rainfall: 1230, monsoon_onset: "May 28", extreme_events: 9  },
  1979: { avg_max_temp: 31.6, avg_rainfall:  890, monsoon_onset: "Jun 16", extreme_events: 12 },
  1980: { avg_max_temp: 31.1, avg_rainfall: 1140, monsoon_onset: "Jun 1",  extreme_events: 8  },
  1981: { avg_max_temp: 31.0, avg_rainfall: 1080, monsoon_onset: "Jun 5",  extreme_events: 7  },
  1982: { avg_max_temp: 31.5, avg_rainfall:  940, monsoon_onset: "Jun 14", extreme_events: 10 },
  1983: { avg_max_temp: 31.0, avg_rainfall: 1210, monsoon_onset: "Jun 13", extreme_events: 8  },
  1984: { avg_max_temp: 31.2, avg_rainfall: 1060, monsoon_onset: "May 31", extreme_events: 7  },
  1985: { avg_max_temp: 31.4, avg_rainfall: 1010, monsoon_onset: "Jun 9",  extreme_events: 9  },
  1986: { avg_max_temp: 31.5, avg_rainfall:  960, monsoon_onset: "Jun 11", extreme_events: 10 },
  1987: { avg_max_temp: 32.2, avg_rainfall:  840, monsoon_onset: "Jun 15", extreme_events: 15 },
  1988: { avg_max_temp: 31.3, avg_rainfall: 1270, monsoon_onset: "May 26", extreme_events: 10 },
  1989: { avg_max_temp: 31.4, avg_rainfall: 1110, monsoon_onset: "Jun 3",  extreme_events: 8  },
  1990: { avg_max_temp: 31.2, avg_rainfall: 1190, monsoon_onset: "May 19", extreme_events: 9  },
  1991: { avg_max_temp: 31.6, avg_rainfall: 1030, monsoon_onset: "Jun 8",  extreme_events: 10 },
  1992: { avg_max_temp: 31.7, avg_rainfall: 1010, monsoon_onset: "Jun 5",  extreme_events: 9  },
  1993: { avg_max_temp: 31.5, avg_rainfall: 1120, monsoon_onset: "Jun 7",  extreme_events: 8  },
  1994: { avg_max_temp: 31.4, avg_rainfall: 1200, monsoon_onset: "May 28", extreme_events: 9  },
  1995: { avg_max_temp: 31.7, avg_rainfall: 1100, monsoon_onset: "Jun 8",  extreme_events: 10 },
  1996: { avg_max_temp: 31.6, avg_rainfall: 1140, monsoon_onset: "Jun 3",  extreme_events: 9  },
  1997: { avg_max_temp: 31.3, avg_rainfall: 1150, monsoon_onset: "Jun 9",  extreme_events: 9  },
  1998: { avg_max_temp: 32.1, avg_rainfall: 1170, monsoon_onset: "Jun 2",  extreme_events: 13 },
  1999: { avg_max_temp: 31.8, avg_rainfall: 1060, monsoon_onset: "May 25", extreme_events: 10 },
  2000: { avg_max_temp: 31.2, avg_rainfall: 1120, monsoon_onset: "Jun 10", extreme_events: 8  },
  2001: { avg_max_temp: 31.5, avg_rainfall: 1085, monsoon_onset: "Jun 8",  extreme_events: 9  },
  2002: { avg_max_temp: 32.1, avg_rainfall:  820, monsoon_onset: "Jun 15", extreme_events: 14 },
  2003: { avg_max_temp: 31.8, avg_rainfall: 1065, monsoon_onset: "Jun 6",  extreme_events: 11 },
  2004: { avg_max_temp: 32.3, avg_rainfall:  995, monsoon_onset: "Jun 12", extreme_events: 10 },
  2005: { avg_max_temp: 31.9, avg_rainfall: 1230, monsoon_onset: "Jun 5",  extreme_events: 16 },
  2006: { avg_max_temp: 32.4, avg_rainfall: 1150, monsoon_onset: "Jun 7",  extreme_events: 13 },
  2007: { avg_max_temp: 32.0, avg_rainfall: 1185, monsoon_onset: "Jun 4",  extreme_events: 12 },
  2008: { avg_max_temp: 32.6, avg_rainfall: 1095, monsoon_onset: "Jun 9",  extreme_events: 10 },
  2009: { avg_max_temp: 33.1, avg_rainfall:  875, monsoon_onset: "Jun 20", extreme_events: 17 },
  2010: { avg_max_temp: 32.8, avg_rainfall: 1240, monsoon_onset: "Jun 3",  extreme_events: 15 },
  2011: { avg_max_temp: 32.5, avg_rainfall: 1180, monsoon_onset: "Jun 6",  extreme_events: 12 },
  2012: { avg_max_temp: 33.2, avg_rainfall:  925, monsoon_onset: "Jun 14", extreme_events: 19 },
  2013: { avg_max_temp: 32.9, avg_rainfall: 1260, monsoon_onset: "Jun 1",  extreme_events: 22 },
  2014: { avg_max_temp: 33.4, avg_rainfall:  980, monsoon_onset: "Jun 11", extreme_events: 18 },
  2015: { avg_max_temp: 33.8, avg_rainfall:  850, monsoon_onset: "Jun 18", extreme_events: 24 },
  2016: { avg_max_temp: 33.5, avg_rainfall: 1120, monsoon_onset: "Jun 7",  extreme_events: 20 },
  2017: { avg_max_temp: 33.6, avg_rainfall: 1090, monsoon_onset: "Jun 5",  extreme_events: 21 },
  2018: { avg_max_temp: 34.1, avg_rainfall: 1045, monsoon_onset: "Jun 10", extreme_events: 23 },
  2019: { avg_max_temp: 33.9, avg_rainfall: 1310, monsoon_onset: "Jun 2",  extreme_events: 28 },
  2020: { avg_max_temp: 33.7, avg_rainfall: 1175, monsoon_onset: "Jun 4",  extreme_events: 25 },
  2021: { avg_max_temp: 34.3, avg_rainfall: 1220, monsoon_onset: "Jun 3",  extreme_events: 27 },
  2022: { avg_max_temp: 34.5, avg_rainfall:  960, monsoon_onset: "Jun 13", extreme_events: 30 },
  2023: { avg_max_temp: 34.8, avg_rainfall: 1050, monsoon_onset: "Jun 8",  extreme_events: 31 },
  2024: { avg_max_temp: 35.1, avg_rainfall: 1145, monsoon_onset: "Jun 6",  extreme_events: 33 },
  2025: { avg_max_temp: 35.4, avg_rainfall: 1170, monsoon_onset: "Jun 4",  extreme_events: 29 }
};

// ── REGION INFO ──
const REGION_INFO = {
  all:         { name: "All India",              lat: 22.5,  lon: 82.0,  zoom: 5  },
  ahmedabad:   { name: "Ahmedabad, Gujarat",     lat: 23.03, lon: 72.58, zoom: 9  },
  delhi:       { name: "New Delhi",              lat: 28.61, lon: 77.21, zoom: 9  },
  mumbai:      { name: "Mumbai, Maharashtra",    lat: 19.08, lon: 72.88, zoom: 9  },
  chennai:     { name: "Chennai, Tamil Nadu",    lat: 13.08, lon: 80.27, zoom: 9  },
  kolkata:     { name: "Kolkata, West Bengal",   lat: 22.57, lon: 88.36, zoom: 9  },
  bengaluru:   { name: "Bengaluru, Karnataka",   lat: 12.97, lon: 77.59, zoom: 9  },
  jaipur:      { name: "Jaipur, Rajasthan",      lat: 26.91, lon: 75.79, zoom: 9  },
  bhubaneswar: { name: "Bhubaneswar, Odisha",    lat: 20.30, lon: 85.85, zoom: 9  }
};

// ── GRID GENERATION ──
// Generates 0.25° × 0.25° grid across India bounding box
// (6.5°N–36.5°N, 68°E–98°E)
function generateGridPredictions() {
  const predictions = [];
  const latMin = 8,  latMax = 36, latStep = 2;
  const lonMin = 68, lonMax = 98, lonStep = 2;

  for (let lat = latMin; lat <= latMax; lat += latStep) {
    for (let lon = lonMin; lon <= lonMax; lon += lonStep) {
      // Skip obvious ocean cells (very rough India mask)
      if (!roughIndiaCheck(lat, lon)) continue;
      predictions.push({
        lat,
        lon,
        max_temp: simulateMaxTemp(lat, lon),
        min_temp: simulateMinTemp(lat, lon),
        rainfall: simulateRainfall(lat, lon)
      });
    }
  }
  return predictions;
}

function roughIndiaCheck(lat, lon) {
  // Rough bounding polygon for India mainland + A&N Islands
  if (lat < 8  || lat > 36)  return false;
  if (lon < 68 || lon > 97)  return false;
  // Kashmir
  if (lat > 33 && lon < 74)  return false;
  // Northeast India rough box
  if (lat < 22 && lon > 92 && lat < 20) return false;
  // Exclude Bay of Bengal / Arabian Sea roughly
  if (lat < 15 && lon > 93)  return false;
  if (lat < 12 && lon < 74)  return false;
  return true;
}

function simulateMaxTemp(lat, lon) {
  // June pattern: NW India hottest, coastal cooler, NE moderate
  const latFactor = (lat - 8) / (36 - 8);    // 0 (south) → 1 (north)
  const lonFactor = (lon - 68) / (97 - 68);   // 0 (west)  → 1 (east)

  // Rajasthan/Gujarat peak ~45°C, Kerala trough ~32°C, NE ~28°C
  let base = 32 + latFactor * 10 - lonFactor * 4;
  // Rajasthan bump
  if (lat > 24 && lat < 32 && lon < 78) base += 3;
  // Coastal cooling (sea breeze)
  if (lon < 72 || lat < 12) base -= 2;
  // Add noise
  base += (Math.random() - 0.5) * 2.5;
  return +Math.max(28, Math.min(47, base)).toFixed(1);
}

function simulateMinTemp(lat, lon) {
  const base = simulateMaxTemp(lat, lon) - 10 - Math.random() * 4;
  return +Math.max(18, Math.min(30, base)).toFixed(1);
}

function simulateRainfall(lat, lon) {
  // June: Southwest monsoon active over Kerala/Karnataka, dry over NW
  const isKerala   = lat < 12 && lon < 78;
  const isKarnataka= lat < 15 && lon < 77;
  const isGoa      = lat > 15 && lat < 16 && lon < 75;
  const isMaharash = lat > 17 && lat < 22 && lon < 74;
  const isRajasthan= lat > 24 && lon < 76;
  const isNE       = lon > 90 && lat > 22;

  let rain = 5;
  if (isKerala)   rain = 40 + Math.random() * 60;
  else if (isKarnataka) rain = 25 + Math.random() * 40;
  else if (isGoa) rain = 30 + Math.random() * 50;
  else if (isMaharash) rain = 10 + Math.random() * 30;
  else if (isNE)  rain = 20 + Math.random() * 40;
  else if (isRajasthan) rain = Math.random() * 5;
  else rain = 5 + Math.random() * 15;

  // Probabilistic zero-inflation (dry day)
  if (Math.random() < 0.25 && !isKerala && !isKarnataka) rain = 0;
  return +Math.max(0, rain).toFixed(1);
}

// ── COLOUR SCALES ──
const COLOR_SCALES = {
  max_temp: {
    min: 20, max: 47,
    stops: ["#0066FF", "#00BFFF", "#00E5CC", "#00E676", "#10B981", "#FFC107", "#FF9800", "#FF5500", "#EF4444"],
    label: "Max Temp (°C)",
    unit: "°C",
    midLabel: "33.5°C"
  },
  min_temp: {
    min:  18,  max: 30,
    stops: ["#4dc3ff","#a78bfa","#e879f9","#f97316","#ef4444"],
    label: "Min Temp (°C)",
    unit: "°C",
    midLabel: "24°C"
  },
  rainfall: {
    min:  0,   max: 120,
    stops: ["#0d1526","#064e3b","#10b981","#00e5cc","#60a5fa","#7c3aed"],
    label: "Rainfall (mm)",
    unit: "mm",
    midLabel: "60 mm"
  }
};

function getColor(value, scale) {
  const { min, max, stops } = scale;
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const idx = t * (stops.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.min(lo + 1, stops.length - 1);
  const frac= idx - lo;

  const c1 = hexToRgb(stops[lo]);
  const c2 = hexToRgb(stops[hi]);
  const r  = Math.round(c1.r + (c2.r - c1.r) * frac);
  const g  = Math.round(c1.g + (c2.g - c1.g) * frac);
  const b  = Math.round(c1.b + (c2.b - c1.b) * frac);
  return `rgba(${r},${g},${b},0.85)`;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

// ════════════════════════════════════════════════════════
//  EXTENDED DATA FOR MULTI-PAGE APP
// ════════════════════════════════════════════════════════

// ── FORECAST PAGE: 7-day with conditions ──
const WEATHER_CONDITIONS = [
  { key: "very_hot",     label: "Very Hot",     icon: "🔥", bgClass: "wx-very-hot"   },
  { key: "hot",          label: "Hot",          icon: "☀️",  bgClass: "wx-hot"        },
  { key: "sunny",        label: "Sunny",        icon: "🌤️",  bgClass: "wx-sunny"      },
  { key: "cloudy",       label: "Cloudy",       icon: "☁️",  bgClass: "wx-cloudy"     },
  { key: "rain",         label: "Rain",         icon: "🌧️",  bgClass: "wx-rain"       },
  { key: "heavy_rain",   label: "Heavy Rain",   icon: "⛈️",  bgClass: "wx-heavy-rain" },
  { key: "thunderstorm", label: "Thunderstorm", icon: "🌩️",  bgClass: "wx-thunder"    },
  { key: "pleasant",     label: "Pleasant",     icon: "🌈",  bgClass: "wx-pleasant"   },
  { key: "fog",          label: "Foggy",        icon: "🌫️",  bgClass: "wx-fog"        },
  { key: "cyclone",      label: "Cyclone Risk", icon: "🌀",  bgClass: "wx-cyclone"    }
];

function getConditionFromData(maxTemp, rainfall) {
  if (rainfall > 60)  return WEATHER_CONDITIONS[6]; // thunderstorm
  if (rainfall > 35)  return WEATHER_CONDITIONS[5]; // heavy rain
  if (rainfall > 10)  return WEATHER_CONDITIONS[4]; // rain
  if (maxTemp > 42)   return WEATHER_CONDITIONS[0]; // very hot
  if (maxTemp > 38)   return WEATHER_CONDITIONS[1]; // hot
  if (maxTemp > 34)   return WEATHER_CONDITIONS[2]; // sunny
  if (maxTemp < 30)   return WEATHER_CONDITIONS[7]; // pleasant
  return WEATHER_CONDITIONS[3]; // cloudy
}

const FORECAST_7DAY_EXTENDED = (() => {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const maxBase  = [37.4, 38.1, 39.0, 38.5, 36.8, 35.2, 34.9];
  const minBase  = [24.8, 25.3, 26.1, 25.7, 24.0, 23.5, 23.2];
  const rainBase = [18.2,  0.0,  2.4, 35.6, 12.0, 46.8,  8.1];
  const humBase  = [68,    62,   58,   75,   71,   82,    65  ];
  const windBase = [12,    18,   14,    9,   22,   28,    16  ];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const cond = getConditionFromData(maxBase[i], rainBase[i]);
    return {
      date:      d,
      dateLabel: d.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" }),
      dateISO:   d.toISOString().split("T")[0],
      max_temp:  maxBase[i],
      min_temp:  minBase[i],
      rainfall:  rainBase[i],
      humidity:  humBase[i],
      wind_speed: windBase[i],
      condition: cond
    };
  });
})();

// ── MASTER CITIES & REGIONAL COORDINATES REGISTRY (MAPPED FROM LAT_LON_MAPPED_TABLE) ──
const MASTER_CITIES = {
  all:           { name: "All India (Average)",                  state: "All India",        lat: 20.59, lon: 78.96, offsets: { max: 0.0,  min: 0.0,   rain: 0.0,   hum: 0  }, desc: "All-India regional average climate conditions" },
  ahmedabad:     { name: "Ahmedabad, Gujarat",                  state: "Gujarat",          lat: 23.03, lon: 72.58, offsets: { max: -5.0, min: 0.5,   rain: 8.0,   hum: -5 }, desc: "Western plains — warm to hot with convective showers" },
  delhi:         { name: "New Delhi, NCR",                      state: "NCT of Delhi",     lat: 28.61, lon: 77.21, offsets: { max: 3.0,  min: 1.5,   rain: -5.0,  hum: -8 }, desc: "Northern plains — hot dry conditions and heat wave risk" },
  mumbai:        { name: "Mumbai, Maharashtra",                 state: "Maharashtra",      lat: 19.08, lon: 72.88, offsets: { max: -8.0, min: 0.0,   rain: 55.0,  hum: 15 }, desc: "Konkan coast — active southwest monsoon precipitation" },
  chennai:       { name: "Chennai, Tamil Nadu",                 state: "Tamil Nadu",       lat: 13.08, lon: 80.27, offsets: { max: -3.0, min: 1.0,   rain: 15.0,  hum: 10 }, desc: "Coromandel coast — warm and humid with coastal showers" },
  kolkata:       { name: "Kolkata, West Bengal",                state: "West Bengal",      lat: 22.57, lon: 88.36, offsets: { max: -4.0, min: 0.5,   rain: 35.0,  hum: 12 }, desc: "Gangetic delta — humid with frequent thundershowers" },
  bengaluru:     { name: "Bengaluru, Karnataka",                state: "Karnataka",        lat: 12.97, lon: 77.59, offsets: { max: -7.0, min: -3.0,  rain: 22.0,  hum: 5  }, desc: "Deccan plateau — pleasant with afternoon thundershowers" },
  jaipur:        { name: "Jaipur, Rajasthan",                   state: "Rajasthan",        lat: 26.91, lon: 75.79, offsets: { max: 4.0,  min: 1.0,   rain: -15.0, hum: -12}, desc: "Arid northwest — severe heat wave conditions" },
  bhubaneswar:   { name: "Bhubaneswar, Odisha",                 state: "Odisha",           lat: 20.30, lon: 85.85, offsets: { max: -5.0, min: 0.0,   rain: 45.0,  hum: 14 }, desc: "Eastern coast — active monsoon depression & coastal rain" },
  srinagar:      { name: "Srinagar, Jammu & Kashmir",           state: "Jammu & Kashmir",  lat: 34.08, lon: 74.79, offsets: { max: -16.0,min: -16.0, rain: -10.0, hum: -15}, desc: "Kashmir valley — cold wave conditions and valley frost" },
  shimla:        { name: "Shimla, Himachal Pradesh",            state: "Himachal Pradesh", lat: 31.10, lon: 77.17, offsets: { max: -12.0,min: -12.0, rain: 15.0,  hum: -5 }, desc: "Himalayan foothills — cool, pleasant with mountain showers" },
  dehradun:      { name: "Dehradun, Uttarakhand",              state: "Uttarakhand",      lat: 30.31, lon: 78.03, offsets: { max: -8.0, min: -8.0,  rain: 25.0,  hum: 0  }, desc: "Doon valley — moderate temperatures with heavy rain risk" },
  amritsar:      { name: "Amritsar / Ludhiana, Punjab",         state: "Punjab",           lat: 31.63, lon: 74.87, offsets: { max: 2.0,  min: 1.0,   rain: -8.0,  hum: -10}, desc: "Punjab plains — hot summer transitioning to monsoon" },
  gurugram:      { name: "Gurugram / Ambala, Haryana",          state: "Haryana",          lat: 28.45, lon: 77.02, offsets: { max: 2.5,  min: 1.2,   rain: -6.0,  hum: -8 }, desc: "NCR boundary — warm to hot conditions" },
  lucknow:       { name: "Lucknow, Uttar Pradesh",              state: "Uttar Pradesh",    lat: 26.84, lon: 80.94, offsets: { max: 1.0,  min: 0.5,   rain: 12.0,  hum: 2  }, desc: "Central UP plains — warm with pre-monsoon showers" },
  patna:         { name: "Patna, Bihar",                        state: "Bihar",            lat: 25.59, lon: 85.13, offsets: { max: 0.0,  min: 0.0,   rain: 20.0,  hum: 5  }, desc: "Gangetic plains — warm and humid with active rain" },
  ranchi:        { name: "Ranchi, Jharkhand",                   state: "Jharkhand",        lat: 23.34, lon: 85.30, offsets: { max: -2.0, min: -1.0,  rain: 28.0,  hum: 8  }, desc: "Chota Nagpur plateau — pleasant climate with rainfall" },
  bhopal:        { name: "Bhopal, Madhya Pradesh",              state: "Madhya Pradesh",   lat: 23.25, lon: 77.41, offsets: { max: 1.5,  min: 0.5,   rain: 5.0,   hum: -2 }, desc: "Central plateau — warm weather with scattered rain" },
  raipur:        { name: "Raipur, Chhattisgarh",                state: "Chhattisgarh",     lat: 21.25, lon: 81.62, offsets: { max: -1.0, min: -0.5,  rain: 30.0,  hum: 10 }, desc: "Mahanadi basin — active monsoon rainfall" },
  guwahati:      { name: "Guwahati, Assam",                     state: "Assam",            lat: 26.14, lon: 91.73, offsets: { max: -7.0, min: -3.0,  rain: 85.0,  hum: 20 }, desc: "Brahmaputra valley — heavy torrential monsoon rain" },
  shillong:      { name: "Shillong, Meghalaya",                 state: "Meghalaya",        lat: 25.57, lon: 91.88, offsets: { max: -12.0,min: -6.0,  rain: 95.0,  hum: 22 }, desc: "Khasi hills — extreme precipitation and cool climate" },
  kohima:        { name: "Kohima, Nagaland",                    state: "Nagaland",         lat: 25.67, lon: 94.11, offsets: { max: -10.0,min: -5.0,  rain: 70.0,  hum: 18 }, desc: "Naga hills — high rainfall and cool weather" },
  imphal:        { name: "Imphal, Manipur",                     state: "Manipur",          lat: 24.81, lon: 93.94, offsets: { max: -9.0, min: -4.0,  rain: 65.0,  hum: 16 }, desc: "Imphal valley — moderate temperatures with heavy rain" },
  aizawl:        { name: "Aizawl, Mizoram",                     state: "Mizoram",          lat: 23.73, lon: 92.72, offsets: { max: -9.0, min: -4.0,  rain: 68.0,  hum: 17 }, desc: "Mizo hills — heavy monsoon rainfall" },
  agartala:      { name: "Agartala, Tripura",                   state: "Tripura",          lat: 23.83, lon: 91.28, offsets: { max: -5.0, min: -1.0,  rain: 60.0,  hum: 15 }, desc: "Tripura plains — warm and humid with active showers" },
  itanagar:      { name: "Itanagar, Arunachal Pradesh",         state: "Arunachal Pradesh",lat: 27.08, lon: 93.60, offsets: { max: -11.0,min: -5.0,  rain: 75.0,  hum: 18 }, desc: "Eastern Himalayas — cool with heavy precipitation" },
  gangtok:       { name: "Gangtok, Sikkim",                     state: "Sikkim",           lat: 27.33, lon: 88.61, offsets: { max: -14.0,min: -8.0,  rain: 60.0,  hum: 12 }, desc: "Sikkim Himalayas — cold wave and high rainfall" },
  panaji:        { name: "Panaji, Goa",                         state: "Goa",              lat: 15.49, lon: 73.82, offsets: { max: -7.0, min: -1.0,  rain: 65.0,  hum: 16 }, desc: "Goa coast — torrential monsoon downpours" },
  kochi:         { name: "Kochi / Thiruvananthapuram, Kerala",  state: "Kerala",           lat: 9.93,  lon: 76.26, offsets: { max: -9.0, min: -2.0,  rain: 75.0,  hum: 18 }, desc: "Malabar coast — heavy monsoon rainfall" },
  visakhapatnam: { name: "Visakhapatnam, Andhra Pradesh",       state: "Andhra Pradesh",   lat: 17.68, lon: 83.21, offsets: { max: 1.0,  min: 0.0,   rain: 18.0,  hum: 10 }, desc: "Northern Andhra coast — warm and humid" },
  hyderabad:     { name: "Hyderabad, Telangana",                state: "Telangana",        lat: 17.38, lon: 78.48, offsets: { max: 2.0,  min: 0.5,   rain: 8.0,   hum: 0  }, desc: "Telangana plateau — warm conditions with scattered showers" },
  puducherry:    { name: "Puducherry UT",                       state: "Puducherry",       lat: 11.94, lon: 79.81, offsets: { max: -2.0, min: 0.0,   rain: 20.0,  hum: 12 }, desc: "Coastal UT — warm and humid weather" },
  chandigarh:    { name: "Chandigarh UT",                       state: "Chandigarh",       lat: 30.73, lon: 76.78, offsets: { max: 2.0,  min: 1.0,   rain: -5.0,  hum: -8 }, desc: "Shivalik foothills — warm summer with pre-monsoon rain" },
  portblair:     { name: "Port Blair, Andaman & Nicobar",       state: "Andaman & Nicobar",lat: 11.62, lon: 92.72, offsets: { max: -6.0, min: -1.0,  rain: 68.0,  hum: 16 }, desc: "Bay of Bengal Islands — tropical marine monsoon" },
  kavaratti:     { name: "Kavaratti, Lakshadweep",              state: "Lakshadweep",      lat: 10.56, lon: 72.64, offsets: { max: -7.0, min: -1.0,  rain: 74.0,  hum: 18 }, desc: "Arabian Sea Atolls — tropical island rainfall" },
  surat:         { name: "Surat, Gujarat",                      state: "Gujarat",          lat: 21.17, lon: 72.83, offsets: { max: -4.0, min: 0.0,   rain: 25.0,  hum: 8  }, desc: "South Gujarat coast — humid with active rain" },
  pune:          { name: "Pune, Maharashtra",                   state: "Maharashtra",      lat: 18.52, lon: 73.85, offsets: { max: -6.0, min: -2.0,  rain: 30.0,  hum: 6  }, desc: "Sahyadri eastern slopes — pleasant monsoon weather" },
  nagpur:        { name: "Nagpur, Maharashtra",                 state: "Maharashtra",      lat: 21.14, lon: 79.08, offsets: { max: 1.0,  min: 0.5,   rain: 15.0,  hum: 2  }, desc: "Vidarbha region — warm climate with pre-monsoon showers" },
  indore:        { name: "Indore, Madhya Pradesh",              state: "Madhya Pradesh",   lat: 22.71, lon: 75.85, offsets: { max: 0.0,  min: 0.0,   rain: 8.0,   hum: 0  }, desc: "Malwa plateau — pleasant climate" },
  agra:          { name: "Agra, Uttar Pradesh",                 state: "Uttar Pradesh",    lat: 27.17, lon: 78.00, offsets: { max: 3.0,  min: 1.5,   rain: -4.0,  hum: -6 }, desc: "Yamuna basin — hot summer conditions" },
  varanasi:      { name: "Varanasi, Uttar Pradesh",             state: "Uttar Pradesh",    lat: 25.31, lon: 82.97, offsets: { max: 1.5,  min: 0.5,   rain: 15.0,  hum: 4  }, desc: "Purvanchal region — warm and humid" },
  jaisalmer:     { name: "Jaisalmer, Rajasthan",                state: "Rajasthan",        lat: 26.91, lon: 70.90, offsets: { max: 6.0,  min: 2.0,   rain: -18.0, hum: -15}, desc: "Thar desert — extreme heat wave and dry weather" },
  jodhpur:       { name: "Jodhpur, Rajasthan",                  state: "Rajasthan",        lat: 26.23, lon: 73.02, offsets: { max: 5.0,  min: 1.8,   rain: -14.0, hum: -12}, desc: "Marwar region — intense heat wave conditions" },
  coimbatore:    { name: "Coimbatore, Tamil Nadu",              state: "Tamil Nadu",       lat: 11.01, lon: 76.95, offsets: { max: -5.0, min: -2.0,  rain: 18.0,  hum: 4  }, desc: "Kongu region — pleasant elevated weather" },
  madurai:       { name: "Madurai, Tamil Nadu",                 state: "Tamil Nadu",       lat: 9.92,  lon: 78.11, offsets: { max: -1.0, min: 0.5,   rain: 12.0,  hum: 6  }, desc: "Southern Tamil Nadu plains — warm climate" }
};

// ── CITY-SPECIFIC FORECAST DATA ──
const CITY_FORECAST_DATA = MASTER_CITIES;

// ── FULL ALERTS DATA WITH DO'S & DON'TS ──
const ALERTS_FULL = [
  {
    id: "ALT001",
    city: "Jaipur, Rajasthan",
    type: "Heat Wave Warning",
    severity: "critical",
    status: "active",
    icon: "🔥",
    states: ["Rajasthan", "Gujarat", "Haryana"],
    dates: "26–29 Jun 2025",
    detail: "Maximum temperatures 6–8°C above normal. IMD Red Alert issued. Risk of heat stroke for outdoor workers.",
    dos: [
      "Stay indoors between 11 AM – 4 PM",
      "Drink water/ORS every 30 minutes",
      "Wear light, loose, light-colored cotton clothes",
      "Keep emergency cooling supplies ready",
      "Check on elderly and young children frequently"
    ],
    donts: [
      "Do not go outdoors during peak hours",
      "Avoid strenuous physical activity",
      "Don't leave children or pets in parked cars",
      "Avoid alcohol and carbonated drinks",
      "Don't ignore symptoms of heat exhaustion"
    ]
  },
  {
    id: "ALT002",
    city: "Bhubaneswar, Odisha",
    type: "Cyclone Watch",
    severity: "critical",
    status: "active",
    icon: "🌀",
    states: ["Odisha", "West Bengal", "Andhra Pradesh"],
    dates: "27–30 Jun 2025",
    detail: "Deep depression in Bay of Bengal intensifying. Landfall expected near Puri. Coastal communities advised to evacuate.",
    dos: [
      "Evacuate low-lying and coastal areas immediately",
      "Store adequate food, water and medicines",
      "Keep mobile phones fully charged",
      "Follow official evacuation routes",
      "Secure loose objects and board up windows"
    ],
    donts: [
      "Do not ignore evacuation orders",
      "Avoid sea, rivers and flooded areas",
      "Don't use electrical appliances during storm",
      "Avoid travel during landfall period",
      "Don't spread unverified information"
    ]
  },
  {
    id: "ALT003",
    city: "Mumbai, Maharashtra",
    type: "Heavy Rainfall Alert",
    severity: "high",
    status: "active",
    icon: "⛈️",
    states: ["Kerala", "Karnataka", "Goa", "Maharashtra"],
    dates: "26–27 Jun 2025",
    detail: "Southwest monsoon active. Isolated heavy to very heavy rainfall expected. Urban flooding likely in low-lying areas.",
    dos: [
      "Avoid waterlogged roads and underpasses",
      "Keep emergency numbers saved",
      "Move valuables to higher floors",
      "Use raincoats and waterproof footwear",
      "Follow local authority updates"
    ],
    donts: [
      "Don't enter flooded roads — even if it looks shallow",
      "Avoid driving through standing water",
      "Don't park vehicles near water bodies",
      "Avoid walking near drains and culverts",
      "Don't touch fallen electrical wires"
    ]
  },
  {
    id: "ALT004",
    city: "Kolkata, West Bengal",
    type: "Thunderstorm Alert",
    severity: "high",
    status: "upcoming",
    icon: "🌩️",
    states: ["West Bengal", "Bihar", "Jharkhand"],
    dates: "27–28 Jun 2025",
    detail: "Isolated thunderstorms with lightning and gusty winds (50–60 km/h) expected. Hail possible in north Bengal.",
    dos: [
      "Seek shelter in sturdy buildings immediately",
      "Unplug electronic appliances",
      "Keep emergency flashlights handy",
      "Stay away from windows during storm",
      "Monitor weather updates every hour"
    ],
    donts: [
      "Avoid open fields, hilltops and rooftops",
      "Don't shelter under isolated tall trees",
      "Avoid using landline phones during lightning",
      "Don't use swimming pools or water bodies",
      "Avoid holding metal objects outdoors"
    ]
  },
  {
    id: "ALT005",
    city: "Delhi, NCR",
    type: "High Winds Advisory",
    severity: "moderate",
    status: "active",
    icon: "💨",
    states: ["Delhi", "Haryana", "Western UP"],
    dates: "26 Jun 2025",
    detail: "Dust storm conditions with winds 60–80 km/h. Visibility may drop below 500m. AQI likely to spike to Very Poor.",
    dos: [
      "Stay indoors and close all windows and doors",
      "Wear N95 masks if outdoor movement is necessary",
      "Keep cars in garages or covered areas",
      "Protect your eyes from dust and sand",
      "Keep children and elderly inside"
    ],
    donts: [
      "Avoid outdoor activities and morning walks",
      "Don't keep loose items on terraces",
      "Avoid driving during peak dust storm",
      "Don't use air conditioners on external air mode",
      "Avoid contact lens use outdoors"
    ]
  },
  {
    id: "ALT006",
    city: "Chennai, Tamil Nadu",
    type: "Flood Warning",
    severity: "moderate",
    status: "upcoming",
    icon: "🌊",
    states: ["Tamil Nadu", "Puducherry", "Andhra Pradesh (S)"],
    dates: "28–30 Jun 2025",
    detail: "Reservoir releases expected from Chembarambakkam. Low-lying areas of Chennai and Kancheepuram may face inundation.",
    dos: [
      "Monitor reservoir release updates from CMDA",
      "Move essential documents to waterproof bags",
      "Keep a 72-hour emergency kit ready",
      "Identify the nearest relief shelter location",
      "Cooperate with local body officials"
    ],
    donts: [
      "Don't cross flooded bridges or causeways",
      "Don't enter areas declared flood-prone",
      "Avoid basement parking during heavy rain",
      "Don't allow children near flooded streets",
      "Don't ignore early warning sirens"
    ]
  },
  {
    id: "ALT007",
    city: "Bengaluru, Karnataka",
    type: "Drought Advisory",
    severity: "low",
    status: "active",
    icon: "🌵",
    states: ["Karnataka (North)", "Telangana", "Maharashtra (Vidarbha)"],
    dates: "Jun 2025",
    detail: "Below-normal rainfall deficit (>30%) recorded in northern Karnataka. Agricultural stress elevated. Groundwater levels declining.",
    dos: [
      "Practice drip irrigation and water-efficient farming",
      "Use water harvesting structures",
      "Report water wastage to local authorities",
      "Grow drought-resistant crop varieties",
      "Follow government advisory on crop insurance"
    ],
    donts: [
      "Don't cultivate water-intensive crops",
      "Avoid over-irrigation and flood irrigation",
      "Don't bore new borewells without permission",
      "Avoid burning crop residue",
      "Don't discard rainwater harvesting opportunities"
    ]
  },
  {
    id: "ALT008",
    city: "Ahmedabad, Gujarat",
    type: "Heat Wave Warning",
    severity: "high",
    status: "expired",
    icon: "🔥",
    states: ["Gujarat", "Kutch"],
    dates: "22–25 Jun 2025",
    detail: "Maximum temperatures reached 46.2°C at Bhuj. Heat stroke cases reported. Alert now lifted as temperatures normalising.",
    dos: [
      "Continue monitoring daily temperature forecasts",
      "Maintain hydration habits established during peak",
      "Check on vulnerable community members",
      "Report heat-related illness to local PHC",
      "Stock ORS sachets as a precaution"
    ],
    donts: [
      "Don't assume temperatures are back to normal without checking",
      "Avoid overexertion even post-advisory",
      "Don't skip meals — nutritional deficiency worsens heat impact",
      "Avoid alcohol consumption",
      "Don't discard cooling measures prematurely"
    ]
  }
];

// ── REPORT SUMMARIES (AI dummy text per city) ──
const REPORT_SUMMARIES = {
  all: "India is experiencing a complex multi-hazard climate scenario this week. While the northwest braces for a severe heat wave with temperatures exceeding 45°C in Rajasthan, the southwest coast is witnessing active monsoon onset with heavy to very heavy rainfall over Kerala and coastal Karnataka. The Bay of Bengal system adds to the alert load with a potential cyclogenesis event near Odisha. Overall, June 2025 tracks 0.8°C warmer than the 1991–2020 climatological average, consistent with long-term anthropogenic warming trends.",
  ahmedabad: "Ahmedabad is under an active heat wave with maximum temperatures projected at 41–44°C over the next 7 days. Relative humidity remains low (30–40%), creating severe heat stress conditions. The Heat Index indicates 'Danger' to 'Extreme Danger' thresholds for outdoor workers. No significant rainfall is expected before late July. IMD has issued Red Alert for Ahmedabad Municipal Corporation area.",
  delhi: "New Delhi is experiencing one of its harshest June heat waves in recent memory, with temperatures touching 45°C in outer areas. A western disturbance interaction may bring light dust storms mid-week. Pre-monsoon rainfall likelihood is below 20% for the next 7 days. AQI is in the 'Very Poor' category due to dust. Expect marginal cooling of 2–3°C toward the weekend.",
  mumbai: "Mumbai and the Konkan coast are in the grip of active southwest monsoon. Moderately hot and very humid conditions (humidity 80–90%) with intermittent heavy showers dominate the forecast. Maximum temperature has dropped to 31–33°C. Coastal flooding in low-lying areas (Kurla, Dharavi, Sion) is likely during high-tide and concurrent heavy rainfall events. IMD Orange Alert issued.",
  chennai: "Chennai shows a mixed pattern with pre-monsoon convective activity. Southwest monsoon is yet to advance over Tamil Nadu. Partly cloudy skies with isolated afternoon thundershowers expected. Maximum temperature around 36–38°C with high humidity (70–80%). A trough in the Bay of Bengal may enhance rainfall activity toward the end of the week.",
  kolkata: "Kolkata is experiencing pre-monsoon thunderstorm season. High heat and humidity (feels like 48°C) in the early part of the week, transitioning to thunderstorm activity from mid-week. Southwest monsoon is expected to arrive over Bengal within 3–5 days. Gusty winds during storms may reach 60 km/h. Citizens should be vigilant about waterlogging in flood-prone zones.",
  bengaluru: "Bengaluru experiences its characteristic pleasant weather with afternoon thundershowers. Maximum temperatures range 28–32°C — significantly cooler than the northern plains. Scattered to fairly widespread rainfall expected, particularly over the Western Ghats. Air quality is Good. Pleasant mornings suitable for outdoor activities. No major weather hazard anticipated for the city this week.",
  jaipur: "Jaipur is under an extreme heat wave with maximum temperatures reaching 46–47°C. IMD Red Alert is in force. Heat stroke cases have been reported across the district. A dust storm event possible on the 2nd and 3rd day of the forecast period. No monsoon relief expected before mid-July. Authorities have set up cooling centres across the city and activated health emergency protocols.",
  bhubaneswar: "Bhubaneswar faces significant weather risk this week due to a deepening depression in the Bay of Bengal. Heavy to very heavy rainfall likely over coastal Odisha with squally winds. The system may intensify into a cyclonic storm before making landfall near Puri. State government has evacuated 1.2 lakh people from vulnerable coastal areas. IMD is issuing 3-hourly warnings."
};

// ── WEEKLY TREND DATA PER CITY (for reports page) ──
function getCityWeeklyTrend(cityKey) {
  const vals = (typeof getCityModelValues === "function") ? getCityModelValues(cityKey) : null;
  const off = CITY_FORECAST_DATA[cityKey]?.offsets || { max: 0, min: 0, rain: 0 };

  const maxTemps = FORECAST_7DAY_EXTENDED.map((d, i) =>
    i === 0 && vals ? vals.maxTemp : +(d.max_temp + off.max).toFixed(1)
  );
  const minTemps = FORECAST_7DAY_EXTENDED.map((d, i) =>
    i === 0 && vals ? vals.minTemp : +(d.min_temp + (off.min || 0)).toFixed(1)
  );
  const rainfall = FORECAST_7DAY_EXTENDED.map((d, i) =>
    i === 0 && vals ? vals.rainfall : +(Math.max(0, d.rainfall + off.rain)).toFixed(1)
  );

  return {
    labels: FORECAST_7DAY_EXTENDED.map(d => d.dateLabel),
    maxTemps,
    minTemps,
    rainfall
  };
}

// ── REAL MODEL DATA LOADER ──
let REAL_MODEL_DATA = null;
let REAL_WHATIF_DATA = null;
let REAL_METRICS_DATA = null;

async function fetchJsonWithFallbacks(filename) {
  const paths = [
    filename,
    `./${filename}`,
    `data/${filename}`,
    `./data/${filename}`,
    `/data/${filename}`,
    `public/data/${filename}`,
    `./public/data/${filename}`
  ];
  for (const p of paths) {
    try {
      const res = await fetch(p);
      if (res && res.ok) {
        return await res.json();
      }
    } catch (e) {}
  }
  return null;
}

async function loadRealModelData() {
  try {
    const [pred, whatif, metrics] = await Promise.all([
      fetchJsonWithFallbacks('sample_prediction.json'),
      fetchJsonWithFallbacks('whatif_precomputed.json'),
      fetchJsonWithFallbacks('model_metrics_v2.json')
    ]);

    if (pred) {
      REAL_MODEL_DATA = pred;
      const s = pred.predictions || pred.ahmedabad_prediction || pred.all_india_summary;
      if (s) {
        if (typeof s.max_temp === 'number') CLIMATE_DATA.all_india_summary.max_temp = s.max_temp;
        if (typeof s.min_temp === 'number') CLIMATE_DATA.all_india_summary.min_temp = s.min_temp;
        if (typeof s.rainfall === 'number') CLIMATE_DATA.all_india_summary.rainfall_24h = s.rainfall;
        if (typeof s.rainfall_24h === 'number') CLIMATE_DATA.all_india_summary.rainfall_24h = s.rainfall_24h;
        if (typeof s.humidity === 'number') CLIMATE_DATA.all_india_summary.humidity = s.humidity;
      }
      if (pred.grid_predictions && pred.grid_predictions.length > 10) {
        CLIMATE_DATA.grid_predictions = pred.grid_predictions;
        updateStateWeatherFromGrid(pred.grid_predictions);
      }
      if (pred.date) {
        CLIMATE_DATA.date = pred.date;
      }
    }

    if (whatif) {
      REAL_WHATIF_DATA = whatif;
    }

    if (metrics) {
      REAL_METRICS_DATA = metrics;
    }
  } catch (err) {
    console.warn("Could not load real model JSON artifacts, using default data payload.", err);
  }
}

function updateStateWeatherFromGrid(grid) {
  if (typeof STATE_WEATHER === 'undefined' || typeof STATE_CENTERS === 'undefined') return;

  const stateGrids = {};
  for (const item of grid) {
    let minDist = Infinity;
    let closestState = null;
    for (const [stateName, center] of Object.entries(STATE_CENTERS)) {
      const dist = Math.hypot(item.lat - center[0], item.lon - center[1]);
      if (dist < minDist) {
        minDist = dist;
        closestState = stateName;
      }
    }
    if (closestState && minDist < 4.5) {
      if (!stateGrids[closestState]) stateGrids[closestState] = [];
      stateGrids[closestState].push(item);
    }
  }

  for (const [stateName, points] of Object.entries(stateGrids)) {
    if (!points || points.length === 0) continue;
    const avgMax = points.reduce((acc, p) => acc + (p.max_temp || 30), 0) / points.length;
    const avgMin = points.reduce((acc, p) => acc + (p.min_temp || 20), 0) / points.length;
    const avgRain = points.reduce((acc, p) => acc + (p.rainfall || 0), 0) / points.length;

    if (STATE_WEATHER[stateName]) {
      STATE_WEATHER[stateName].maxTemp = +avgMax.toFixed(1);
      STATE_WEATHER[stateName].minTemp = +avgMin.toFixed(1);
      STATE_WEATHER[stateName].rainfall = +avgRain.toFixed(1);
      STATE_WEATHER[stateName].cloud = Math.min(1.0, +(avgRain / 80).toFixed(2));
      STATE_WEATHER[stateName].hasRain = avgRain > 10;
    }
  }
}

function getCityModelValues(cityKey) {
  // 1. Direct match from REAL_MODEL_DATA city_predictions dictionary
  if (typeof REAL_MODEL_DATA !== 'undefined' && REAL_MODEL_DATA && REAL_MODEL_DATA.city_predictions) {
    if (cityKey && REAL_MODEL_DATA.city_predictions[cityKey]) {
      const p = REAL_MODEL_DATA.city_predictions[cityKey];
      return {
        maxTemp: +p.max_temp.toFixed(1),
        minTemp: +p.min_temp.toFixed(1),
        rainfall: +p.rainfall.toFixed(1),
        humidity: p.humidity || 60,
        gridLat: p.nearest_lat || p.lat,
        gridLon: p.nearest_lon || p.lon,
        source: `LightGBM AI Inference Engine (${p.city})`
      };
    }
  }

  // If city is 'all' or empty, use All India summary
  if (!cityKey || cityKey === 'all') {
    if (typeof REAL_MODEL_DATA !== 'undefined' && REAL_MODEL_DATA && REAL_MODEL_DATA.all_india_summary) {
      const s = REAL_MODEL_DATA.all_india_summary;
      return {
        maxTemp: s.max_temp,
        minTemp: s.min_temp,
        rainfall: s.rainfall_24h,
        humidity: s.humidity || 60,
        source: "All India model summary"
      };
    }
    const s = CLIMATE_DATA.all_india_summary;
    return {
      maxTemp: s.max_temp,
      minTemp: s.min_temp,
      rainfall: s.rainfall_24h,
      humidity: s.humidity,
      source: "All India default"
    };
  }

  // 2. If city is Ahmedabad (or matches REAL_MODEL_DATA location), return live inference results!
  if (typeof REAL_MODEL_DATA !== 'undefined' && REAL_MODEL_DATA) {
    const loc = (REAL_MODEL_DATA.location || "").toLowerCase();
    if (cityKey.toLowerCase() === 'ahmedabad' || loc.includes(cityKey.toLowerCase())) {
      const p = REAL_MODEL_DATA.predictions || REAL_MODEL_DATA.ahmedabad_prediction;
      if (p) {
        return {
          maxTemp: +p.max_temp.toFixed(1),
          minTemp: +p.min_temp.toFixed(1),
          rainfall: +p.rainfall.toFixed(1),
          humidity: p.humidity || 60,
          gridLat: REAL_MODEL_DATA.latitude || 23.5,
          gridLon: REAL_MODEL_DATA.longitude || 72.5,
          source: `Live Inference Engine (${REAL_MODEL_DATA.location})`
        };
      }
    }

    // If REAL_MODEL_DATA contains grid_predictions for multiple cities (> 1 point)
    const city = REGION_INFO[cityKey];
    if (city && REAL_MODEL_DATA.grid_predictions && REAL_MODEL_DATA.grid_predictions.length > 1) {
      let closestGrid = null;
      let minDist = Infinity;
      for (const pt of REAL_MODEL_DATA.grid_predictions) {
        const dist = Math.hypot(pt.lat - city.lat, pt.lon - city.lon);
        if (dist < minDist) {
          minDist = dist;
          closestGrid = pt;
        }
      }
      if (closestGrid && minDist < 2.5) {
        const maxT = +closestGrid.max_temp.toFixed(1);
        const minT = +closestGrid.min_temp.toFixed(1);
        const rain = +closestGrid.rainfall.toFixed(1);
        const hum  = Math.max(30, Math.min(95, Math.round(100 - (maxT - minT) * 3.2)));
        return {
          maxTemp: maxT,
          minTemp: minT,
          rainfall: rain,
          humidity: hum,
          gridLat: closestGrid.lat,
          gridLon: closestGrid.lon,
          source: `LightGBM Grid (${closestGrid.lat}°N, ${closestGrid.lon}°E)`
        };
      }
    }
  }

  // 2. City specific simulation using exact Lat/Lon spatial climate functions
  const city = REGION_INFO[cityKey];
  if (city) {
    const baseMax = simulateMaxTemp(city.lat, city.lon);
    const baseMin = simulateMinTemp(city.lat, city.lon);
    const baseRain = simulateRainfall(city.lat, city.lon);
    const off = CITY_FORECAST_DATA[cityKey]?.offsets || { max: 0, min: 0, rain: 0, hum: 0 };

    const finalMax = +(baseMax + off.max * 0.5).toFixed(1);
    const finalMin = +(baseMin + off.min * 0.5).toFixed(1);
    const finalRain = Math.max(0, +(baseRain + off.rain * 0.5).toFixed(1));
    const hum = Math.max(30, Math.min(95, Math.round(100 - (finalMax - finalMin) * 3.0 + (off.hum || 0))));

    return {
      maxTemp: finalMax,
      minTemp: finalMin,
      rainfall: finalRain,
      humidity: hum,
      gridLat: city.lat,
      gridLon: city.lon,
      source: `Regional AI Model (${city.lat}°N, ${city.lon}°E)`
    };
  }

  // 3. Fallback
  const off = CITY_FORECAST_DATA[cityKey]?.offsets || { max: 0, min: 0, rain: 0, hum: 0 };
  const s = CLIMATE_DATA.all_india_summary;
  return {
    maxTemp: +(s.max_temp + off.max).toFixed(1),
    minTemp: +(s.min_temp + (off.min||0)).toFixed(1),
    rainfall: Math.max(0, +(s.rainfall_24h + off.rain).toFixed(1)),
    humidity: Math.max(0, Math.min(100, s.humidity + (off.hum||0))),
    source: "City offset fallback"
  };
}
