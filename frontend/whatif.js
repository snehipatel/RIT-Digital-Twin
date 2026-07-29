/**
 * whatif.js — What-If Scenario Simulator (legacy helpers)
 * The new absolute-value slider init lives in pages.js → initWhatIfPageSliders()
 * This file retains computeWhatIf helpers called by pages.js.
 */

// initSliders is a no-op now; pages.js handles the new absolute-value sliders
function initSliders() {
  // Slider wiring handled by initWhatIfPageSliders() in pages.js
}


// ── RUN SIMULATION (legacy — overridden by pages.js) ──
// pages.js redefines runSimulation() for the new absolute-value slider UI
function runSimulationLegacy() { /* superseded */ }

/**
 * computeWhatIf — Simplified deterministic model
 * In production this calls Flask → whatif_simulator.py → real XGBoost/LightGBM inference
 */
function computeWhatIf(dT, dR, days, co2, region) {
  const baseMax  = CLIMATE_DATA.all_india_summary.max_temp;
  const baseMin  = CLIMATE_DATA.all_india_summary.min_temp;
  const baseRain = CLIMATE_DATA.all_india_summary.rainfall_24h;

  if (typeof REAL_WHATIF_DATA !== "undefined" && REAL_WHATIF_DATA && REAL_WHATIF_DATA.scenarios) {
    const oniProxy = Math.min(2.0, Math.max(-2.0, (dT / 2.0)));
    const dmiProxy = Math.min(1.0, Math.max(-1.0, (dR / 50.0)));

    const oniSteps = REAL_WHATIF_DATA.oni_steps || [-2.0,-1.5,-1.0,-0.5,0.0,0.5,1.0,1.5,2.0];
    const dmiSteps = REAL_WHATIF_DATA.dmi_steps || [-1.0,-0.75,-0.5,-0.25,0.0,0.25,0.5,0.75,1.0];

    const nearestOni = oniSteps.reduce((prev, curr) => Math.abs(curr - oniProxy) < Math.abs(prev - oniProxy) ? curr : prev);
    const nearestDmi = dmiSteps.reduce((prev, curr) => Math.abs(curr - dmiProxy) < Math.abs(prev - dmiProxy) ? curr : prev);

    const oniKey = nearestOni.toFixed(1);
    const dmiKey = nearestDmi.toFixed(2);

    const gridScenario = REAL_WHATIF_DATA.scenarios?.[oniKey]?.[dmiKey];
    if (gridScenario && gridScenario.length > 0) {
      const avgFloodRisk = gridScenario.reduce((s, c) => s + c.flood_risk, 0) / gridScenario.length;
      const avgDroughtRisk = gridScenario.reduce((s, c) => s + c.drought_risk, 0) / gridScenario.length;
      const avgHeatwaveRisk = gridScenario.reduce((s, c) => s + c.heatwave_risk, 0) / gridScenario.length;

      const floodRiskStr = avgFloodRisk > 50 ? "High" : avgFloodRisk > 25 ? "Moderate" : "Low";
      const droughtRiskStr = avgDroughtRisk > 40 ? "High" : avgDroughtRisk > 15 ? "Moderate" : "Low";
      const agriRiskStr = avgHeatwaveRisk > 20 || avgDroughtRisk > 30 ? "Severe" : avgHeatwaveRisk > 10 ? "Moderate" : "Low";

      return {
        scenario:             formatScenario(dT, dR, days, co2),
        proj_max_temp:        +(baseMax + dT * 1.05).toFixed(1),
        proj_min_temp:        +(baseMin + dT * 0.85).toFixed(1),
        proj_rainfall:        +(baseRain * (1 + dR / 100)).toFixed(1),
        heatwave_days_added:  Math.round(avgHeatwaveRisk * 0.8),
        cooling_demand:       Math.round(dT * 5.8),
        heating_demand:       dT < 0 ? Math.round(Math.abs(dT) * 4.1) : 0,
        flood_risk:           floodRiskStr,
        drought_risk:         droughtRiskStr,
        agriculture_risk:     agriRiskStr,
        water_stress:         Math.round(avgDroughtRisk + Math.abs(dR) * 0.2),
        co2_forcing:          co2 > 450 ? `+${((co2 - 420) * 0.012).toFixed(2)}°C forcing` : "Baseline",
        days, dT, dR
      };
    }
  }

  // Temperature effects
  const projMax        = +(baseMax + dT * 1.05).toFixed(1);
  const projMin        = +(baseMin + dT * 0.85).toFixed(1);
  const heatwaveDays   = dT > 0 ? Math.round(dT * 2.4 * (days / 7)) : 0;
  const coolingDemand  = dT > 0 ? Math.round(dT * 5.8) : Math.round(dT * 3.2);
  const heatingDemand  = dT < 0 ? Math.round(Math.abs(dT) * 4.1) : 0;

  // Rainfall effects
  const projRain       = +(baseRain * (1 + dR / 100)).toFixed(1);
  const floodRisk      = dR > 50  ? "High"   : dR > 20 ? "Moderate" : dR < -30 ? "Very Low" : "Low";
  const droughtRisk    = dR < -30 ? "High"   : dR < -10 ? "Moderate" : "Low";
  const agriRisk       = computeAgriRisk(dT, dR, days);

  // CO2 effect
  const co2Effect      = co2 > 450 ? `+${((co2 - 420) * 0.012).toFixed(2)}°C forcing` : "Baseline";

  // Water stress
  const waterStress    = dT > 0 && dR < 0 ? Math.round(dT * 4 + Math.abs(dR) * 0.2) :
                         dT > 0           ? Math.round(dT * 2) : 0;

  return {
    scenario:             formatScenario(dT, dR, days, co2),
    proj_max_temp:        projMax,
    proj_min_temp:        projMin,
    proj_rainfall:        projRain,
    heatwave_days_added:  heatwaveDays,
    cooling_demand:       coolingDemand,
    heating_demand:       heatingDemand,
    flood_risk:           floodRisk,
    drought_risk:         droughtRisk,
    agriculture_risk:     agriRisk,
    water_stress:         waterStress,
    co2_forcing:          co2Effect,
    days,
    dT,
    dR
  };
}

function computeAgriRisk(dT, dR, days) {
  let score = 0;
  if (dT > 3)  score += 3;
  if (dT > 1)  score += 1;
  if (dT < -2) score += 1;
  if (dR < -30) score += 3;
  if (dR < -10) score += 1;
  if (dR > 80)  score += 2;
  if (days > 14) score += 1;

  return score >= 5 ? "Severe" : score >= 3 ? "High" : score >= 2 ? "Moderate" : "Low";
}

function formatScenario(dT, dR, days, co2) {
  const parts = [];
  if (dT !== 0) parts.push(`${dT >= 0 ? "+" : ""}${dT}°C`);
  if (dR !== 0) parts.push(`${dR >= 0 ? "+" : ""}${dR}% rainfall`);
  if (co2 !== 420) parts.push(`CO₂ ${co2}ppm`);
  return (parts.join(", ") || "Baseline") + ` over ${days} day${days !== 1 ? "s" : ""}`;
}

// ── DISPLAY RESULTS ──
function displayResults(result, dT, dR, days, co2) {
  const placeholder = document.getElementById("results-placeholder");
  const grid        = document.getElementById("results-grid");
  if (!placeholder || !grid) return;

  placeholder.style.display = "none";
  grid.style.display = "grid";

  const riskClass = r =>
    r === "Severe"   ? "severe"   :
    r === "High"     ? "high"     :
    r === "Moderate" ? "moderate" : "low";

  const trendArrow = (orig, proj) => {
    const diff = +(proj - orig).toFixed(1);
    const cls  = diff > 0 ? "positive" : diff < 0 ? "negative" : "neutral";
    const sym  = diff > 0 ? "▲" : diff < 0 ? "▼" : "─";
    return `<span class="${cls}">${sym} ${diff >= 0 ? "+" : ""}${diff}</span>`;
  };

  grid.innerHTML = `
    <div class="scenario-tag">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
      Scenario: <strong>${result.scenario}</strong>
    </div>

    <div class="result-item animate-in" style="animation-delay:0.0s">
      <div class="result-label">PROJECTED MAX TEMP</div>
      <div class="result-value" style="color:#ff6b6b">${result.proj_max_temp}°C</div>
      <div class="result-change">${trendArrow(CLIMATE_DATA.all_india_summary.max_temp, result.proj_max_temp)}</div>
    </div>

    <div class="result-item animate-in" style="animation-delay:0.08s">
      <div class="result-label">PROJECTED MIN TEMP</div>
      <div class="result-value" style="color:#4dc3ff">${result.proj_min_temp}°C</div>
      <div class="result-change">${trendArrow(CLIMATE_DATA.all_india_summary.min_temp, result.proj_min_temp)}</div>
    </div>

    <div class="result-item animate-in" style="animation-delay:0.16s">
      <div class="result-label">PROJECTED RAINFALL</div>
      <div class="result-value" style="color:#00e5cc">${result.proj_rainfall} mm</div>
      <div class="result-change">${trendArrow(CLIMATE_DATA.all_india_summary.rainfall_24h, result.proj_rainfall)}</div>
    </div>

    <div class="result-item animate-in" style="animation-delay:0.24s">
      <div class="result-label">HEATWAVE DAYS ADDED</div>
      <div class="result-value" style="color:${result.heatwave_days_added > 0 ? "#ff6b6b" : "#10b981"}">
        ${result.heatwave_days_added > 0 ? "+" : ""}${result.heatwave_days_added}
      </div>
      <div class="result-change" style="color:#8ba3c7">Over ${days} days</div>
    </div>

    <div class="result-item animate-in" style="animation-delay:0.32s">
      <div class="result-label">AGRICULTURE RISK</div>
      <div class="result-value" style="font-size:14px;padding-top:6px">
        <span class="risk-badge ${riskClass(result.agriculture_risk)}">${result.agriculture_risk}</span>
      </div>
      <div class="result-change" style="color:#8ba3c7;font-size:10px;margin-top:6px">Kharif season impact</div>
    </div>

    <div class="result-item animate-in" style="animation-delay:0.40s">
      <div class="result-label">WATER STRESS INDEX</div>
      <div class="result-value" style="color:${result.water_stress > 15 ? "#f59e0b" : "#10b981"}">
        ${result.water_stress}%
      </div>
      <div class="result-change" style="color:#8ba3c7">Groundwater demand</div>
    </div>

    <div class="result-item animate-in" style="animation-delay:0.48s">
      <div class="result-label">FLOOD RISK</div>
      <div class="result-value" style="font-size:14px;padding-top:6px">
        <span class="risk-badge ${riskClass(result.flood_risk)}">${result.flood_risk}</span>
      </div>
      <div class="result-change" style="color:#8ba3c7;font-size:10px;margin-top:6px">River basin analysis</div>
    </div>

    <div class="result-item animate-in" style="animation-delay:0.56s">
      <div class="result-label">DROUGHT RISK</div>
      <div class="result-value" style="font-size:14px;padding-top:6px">
        <span class="risk-badge ${riskClass(result.drought_risk)}">${result.drought_risk}</span>
      </div>
      <div class="result-change" style="color:#8ba3c7;font-size:10px;margin-top:6px">Rabi crop outlook</div>
    </div>

    ${co2 !== 420 ? `
    <div class="result-item animate-in" style="animation-delay:0.64s;grid-column:1/-1">
      <div class="result-label">CO₂ RADIATIVE FORCING</div>
      <div class="result-value" style="font-size:16px;color:#a78bfa">${result.co2_forcing}</div>
      <div class="result-change" style="color:#8ba3c7">vs pre-industrial 280 ppm baseline</div>
    </div>` : ""}
  `;

  // Scroll results into view
  grid.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
