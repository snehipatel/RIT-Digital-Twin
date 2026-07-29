"""
================================================================================
AUTOREGRESSIVE ROLLFORWARD ENGINE
================================================================================
Generates synthetic weather predictions for Jan 1 – Jun 29, 2026 by rolling
forward from real Dec 2025 observations, day by day.  Each day's prediction
becomes the "observation" for computing the next day's lag features.

This gives the inference engine self-consistent lag/rolling features for 2026
dates, instead of using last year's proxy (which can be wildly different).

Output: rollforward_2026.csv
  - Contains 362 grid cells x 181 days = ~65,522 synthetic observations
  - Used by run_inference.py for future-date predictions

Usage:
  py rollforward_2026.py
================================================================================
"""

import pandas as pd
import numpy as np
import pickle
import json
import os
import warnings
import ephem
import math
from collections import defaultdict
from datetime import date, timedelta
from scipy.signal import lfilter

warnings.filterwarnings("ignore")

# ── File paths ────────────────────────────────────────────────────────────
MERGED_CSV       = "merged_climate_data.csv"
CLIM_MONTHLY_CSV = "climatology_monthly.csv"
CLIM_WEEKLY_CSV  = "climatology_weekly.csv"
PEAK_WEEK_CSV    = "peak_rain_week.csv"
DRY_PROB_CSV     = "dry_season_prob.csv"
OUTPUT_CSV       = "rollforward_2026.csv"

# ── Constants ─────────────────────────────────────────────────────────────
ROLLFORWARD_START = date(2026, 1, 1)
ROLLFORWARD_END   = date(2026, 6, 29)
HISTORY_KEEP      = 60   # keep last 60 days in per-cell buffers

NAKSHATRAS = [
    'Ashwini','Bharani','Krittika','Rohini','Mrigashira',
    'Ardra','Punarvasu','Pushya','Ashlesha','Magha',
    'Purva_Phalguni','Uttara_Phalguni','Hasta','Chitra','Swati',
    'Vishakha','Anuradha','Jyeshtha','Mula','Purva_Ashadha',
    'Uttara_Ashadha','Shravana','Dhanishtha','Shatabhisha',
    'Purva_Bhadrapada','Uttara_Bhadrapada','Revati'
]

SEASON_MAP = {"Winter": 0, "Pre-Monsoon": 1, "Monsoon": 2, "Post-Monsoon": 3}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_season(month):
    if month in [12, 1, 2]:   return "Winter"
    if month in [3, 4, 5]:    return "Pre-Monsoon"
    if month in [6, 7, 8, 9]: return "Monsoon"
    return "Post-Monsoon"


def compute_bhadali(dt):
    """Compute all Bhadali/lunar features for a single Python date."""
    obs = ephem.Observer()
    obs.lat, obs.long = '21.0', '79.0'
    obs.date = dt.strftime('%Y/%m/%d 06:00:00')

    moon = ephem.Moon(obs)
    sun  = ephem.Sun(obs)

    moon_lon = float(ephem.Ecliptic(moon).lon) * 180 / math.pi
    sun_lon  = float(ephem.Ecliptic(sun).lon)  * 180 / math.pi
    pa       = (moon_lon - sun_lon) % 360

    tithi  = min(int(pa / 12) + 1, 30)
    paksha = 0 if pa <= 180 else 1
    nak_i  = int(moon_lon / (360 / 27)) % 27
    nak_n  = NAKSHATRAS[nak_i]
    illum  = moon.phase / 100.0
    vara   = dt.weekday()
    lm_map = {4:1,5:2,6:3,7:4,8:5,9:6,10:7,11:8,12:9,1:10,2:11,3:12}
    lm     = lm_map.get(dt.month, 1)

    ism = int(dt.month in [6,7,8,9])
    pre = int(dt.month in [3,4,5])
    pst = int(dt.month in [10,11])

    flags = {n: int(nak_n == n) for n in
             ['Swati','Rohini','Anuradha','Hasta','Shravana','Ardra']}
    is_purn  = int(tithi == 15 and paksha == 0)
    is_amav  = int(tithi == 30 or (tithi == 15 and paksha == 1))
    is_sapt  = int(tithi == 7)
    bscore   = (flags['Swati']*3 + flags['Rohini']*2 + flags['Anuradha']*2 +
                flags['Ardra']*2 + flags['Hasta'] + flags['Shravana'] +
                is_purn + is_amav) * ism

    return {
        'Moon_Phase_Angle': pa,
        'Moon_Phase_Sin': math.sin(math.radians(pa)),
        'Moon_Phase_Cos': math.cos(math.radians(pa)),
        'Moon_Illumination': illum,
        'Tithi': tithi, 'Tithi_Sin': math.sin(2*math.pi*tithi/30),
        'Tithi_Cos': math.cos(2*math.pi*tithi/30),
        'Paksha': paksha,
        'Nakshatra': nak_i,
        'Nakshatra_Sin': math.sin(2*math.pi*nak_i/27),
        'Nakshatra_Cos': math.cos(2*math.pi*nak_i/27),
        'Lunar_Month': lm, 'Vara': vara,
        'Is_Swati': flags['Swati'], 'Is_Rohini': flags['Rohini'],
        'Is_Anuradha': flags['Anuradha'], 'Is_Hasta': flags['Hasta'],
        'Is_Shravana': flags['Shravana'], 'Is_Ardra': flags['Ardra'],
        'Is_Purnima': is_purn, 'Is_Amavas': is_amav, 'Is_Saptami': is_sapt,
        'Monsoon_Season': ism, 'Pre_Monsoon': pre, 'Post_Monsoon': pst,
        'Bhadali_Score': bscore,
        'Swati_x_Monsoon': flags['Swati']*ism,
        'Rohini_x_Paksha': flags['Rohini']*paksha,
        'Purnima_x_Monsoon': is_purn*ism,
    }


def build_neighbor_map(coords_list):
    """Map each (lat,lon) → list of (lat,lon) within 1°."""
    nm = {}
    for lat, lon in coords_list:
        nm[(lat, lon)] = [(la, lo) for la, lo in coords_list
                          if (la, lo) != (lat, lon)
                          and abs(la - lat) <= 1.0 and abs(lo - lon) <= 1.0]
    return nm


def safe_idx(arr, neg_idx, default=0.0):
    """Safely index from end of list."""
    if len(arr) >= abs(neg_idx):
        return float(arr[neg_idx])
    return default


# =============================================================================
# MAIN
# =============================================================================

def main():
    print("=" * 70)
    print("  AUTOREGRESSIVE ROLLFORWARD ENGINE")
    print("  Rolling forward: Jan 1 -> Jun 29, 2026")
    print("  362 grid cells  x  181 days  =  ~65,522 synthetic observations")
    print("=" * 70)

    # -- 1. Load all trained models --------------------------------------
    print("\n[1/6] Loading trained AI models ...")
    with open("rainfall_classifier.pkl", "rb") as f:         rain_cls    = pickle.load(f)
    with open("rainfall_regressor.pkl", "rb") as f:          rain_reg    = pickle.load(f)
    with open("rainfall_extreme_classifier.pkl", "rb") as f: rain_cls_ex = pickle.load(f)
    with open("rainfall_extreme_regressor.pkl", "rb") as f:  rain_reg_ex = pickle.load(f)
    with open("rainfall_quantile_10.pkl", "rb") as f:        rain_q10    = pickle.load(f)
    with open("rainfall_quantile_90.pkl", "rb") as f:        rain_q90    = pickle.load(f)
    with open("rainfall_extreme_thresholds.pkl", "rb") as f: rain_thresh = pickle.load(f)
    with open("rainfall_feature_cols.pkl", "rb") as f:       rain_fcols  = pickle.load(f)
    with open("max_temp_model.pkl", "rb") as f:              tmax_model  = pickle.load(f)
    with open("min_temp_model.pkl", "rb") as f:              tmin_model  = pickle.load(f)
    with open("feature_columns.pkl", "rb") as f:             temp_fcols  = pickle.load(f)
    with open("rainfall_metrics.json", "r") as f:            mcfg        = json.load(f)
    is_log = "Log1p" in mcfg["stage2a_objective"]
    print("  [OK] All models loaded")

    # -- 2. Load climatology tables --------------------------------------
    print("\n[2/6] Loading climatology lookup tables ...")
    clim_m  = pd.read_csv(CLIM_MONTHLY_CSV)
    clim_w  = pd.read_csv(CLIM_WEEKLY_CSV)
    peak_df = pd.read_csv(PEAK_WEEK_CSV)
    dry_df  = pd.read_csv(DRY_PROB_CSV)

    # Pre-index climatology as dicts for O(1) lookup
    def _key3(r): return (r["Latitude"], r["Longitude"], int(r["Month"]))
    def _key3w(r): return (r["Latitude"], r["Longitude"], int(r["Week"]))
    def _key2(r): return (r["Latitude"], r["Longitude"])

    clim_m_dict = {}
    for _, r in clim_m.iterrows():
        clim_m_dict[_key3(r)] = {c: r[c] for c in clim_m.columns}
    clim_w_dict = {}
    for _, r in clim_w.iterrows():
        clim_w_dict[_key3w(r)] = {c: r[c] for c in clim_w.columns}
    peak_dict = {}
    for _, r in peak_df.iterrows():
        peak_dict[_key2(r)] = float(r["Peak_Rain_Week"])
    dry_dict = {}
    for _, r in dry_df.iterrows():
        dry_dict[_key3(r)] = float(r["Dry_Season_Prob"])
    print("  [OK] Climatology indexed")

    # -- 3. Load historical tail (Nov-Dec 2025) for all grid cells -------
    print("\n[3/6] Loading real observations (Nov-Dec 2025) ...")
    dtypes = {
        "Year": "int16", "Month": "int8", "Day": "int8", "Season": "category",
        "Latitude": "float32", "Longitude": "float32",
        "Max_Temp": "float32", "Min_Temp": "float32",
        "Diurnal_Range": "float32", "Rainfall": "float32",
    }
    cutoff = pd.Timestamp("2025-11-01")
    chunks = []
    for ch in pd.read_csv(MERGED_CSV, dtype=dtypes, chunksize=200_000):
        ch["Date"] = pd.to_datetime(ch["Date"], format="mixed", dayfirst=True)
        sub = ch[ch["Date"] >= cutoff]
        if len(sub):
            chunks.append(sub)
    hist = pd.concat(chunks).reset_index(drop=True)
    hist["Rainfall"]  = hist["Rainfall"].fillna(0.0)
    hist["Max_Temp"]  = hist["Max_Temp"].fillna(hist["Max_Temp"].median())
    hist["Min_Temp"]  = hist["Min_Temp"].fillna(hist["Min_Temp"].median())
    hist["Diurnal_Range"] = hist["Max_Temp"] - hist["Min_Temp"]

    # Build per-cell history lists (fast O(1) access)
    cells_list = hist[["Latitude", "Longitude"]].drop_duplicates().values.tolist()
    cells_tuples = [(float(la), float(lo)) for la, lo in cells_list]
    n_cells = len(cells_tuples)

    rain_h   = defaultdict(list)   # (lat,lon) -> [rainfall values chronological]
    tmax_h   = defaultdict(list)
    tmin_h   = defaultdict(list)

    for (la, lo), grp in hist.groupby(["Latitude", "Longitude"]):
        key = (float(la), float(lo))
        g = grp.sort_values("Date")
        rain_h[key] = g["Rainfall"].tolist()
        tmax_h[key] = g["Max_Temp"].tolist()
        tmin_h[key] = g["Min_Temp"].tolist()

    print(f"  [OK] {len(hist):,} rows  |  {n_cells} grid cells  |  "
          f"{hist['Date'].min().date()} -> {hist['Date'].max().date()}")

    # -- 4. Build neighbor map -------------------------------------------
    print("\n[4/6] Building spatial neighbor map ...")
    neigh_map = build_neighbor_map(cells_tuples)
    avg_n = np.mean([len(v) for v in neigh_map.values()])
    print(f"  [OK] {n_cells} cells, avg {avg_n:.1f} neighbors each")

    # -- 5. Precompute Bhadali features for every 2026 date --------------
    print("\n[5/6] Computing Bhadali lunar features for 2026 dates ...")
    bhad_cache = {}
    d = ROLLFORWARD_START
    while d <= ROLLFORWARD_END:
        bhad_cache[d] = compute_bhadali(d)
        d += timedelta(days=1)
    print(f"  [OK] {len(bhad_cache)} dates computed")

    # -- 6. MAIN ROLLFORWARD LOOP ----------------------------------------
    total_days = (ROLLFORWARD_END - ROLLFORWARD_START).days + 1
    print(f"\n[6/6] Rolling forward {n_cells} cells x {total_days} days ...")
    print("-" * 70)

    all_out = []         # collect output rows
    cur = ROLLFORWARD_START
    day_num = 0

    while cur <= ROLLFORWARD_END:
        day_num += 1
        ts    = pd.Timestamp(cur)
        mo    = cur.month
        dy    = cur.day
        yr    = cur.year
        doy   = ts.dayofyear
        wk    = ts.isocalendar()[1]
        seas  = get_season(mo)
        sc    = SEASON_MAP[seas]
        ism   = int(mo in [6,7,8,9])
        mo_s  = np.sin(2*np.pi*mo/12)
        mo_c  = np.cos(2*np.pi*mo/12)
        dy_s  = np.sin(2*np.pi*doy/365)
        dy_c  = np.cos(2*np.pi*doy/365)
        mp    = max(0, doy - 152) if ism else 0
        bhad  = bhad_cache[cur]

        rows = []
        for la, lo in cells_tuples:
            key = (la, lo)
            rv = rain_h[key]
            tv = tmax_h[key]
            nv = tmin_h[key]

            # -- Lags --
            rl1 = safe_idx(rv, -1)
            rl2 = safe_idx(rv, -2, rl1)
            rl3 = safe_idx(rv, -3, rl1)
            rl7 = safe_idx(rv, -7, rl1)
            rl14= safe_idx(rv, -14, rl1)

            tl1 = safe_idx(tv, -1, 33.0)
            tl3 = safe_idx(tv, -3, tl1)
            tl7 = safe_idx(tv, -7, tl1)
            nl1 = safe_idx(nv, -1, 23.0)
            nl3 = safe_idx(nv, -3, nl1)
            nl7 = safe_idx(nv, -7, nl1)

            # -- Rolling windows --
            r7  = rv[-7:]  if len(rv) >= 7  else rv
            r3  = rv[-3:]  if len(rv) >= 3  else rv
            r14 = rv[-14:] if len(rv) >= 14 else rv
            r30 = rv[-30:] if len(rv) >= 30 else rv

            roll3  = float(np.sum(r3))
            roll7  = float(np.sum(r7))
            roll14 = float(np.sum(r14))
            roll30 = float(np.sum(r30))
            days7  = float(np.sum(np.array(r7) > 0.1))
            max7   = float(np.max(r7)) if r7 else 0.0
            mean7  = float(np.mean(r7)) if r7 else 0.0

            t7m  = tv[-7:]  if len(tv) >= 7  else tv
            t30m = tv[-30:] if len(tv) >= 30 else tv
            n7m  = nv[-7:]  if len(nv) >= 7  else nv
            n30m = nv[-30:] if len(nv) >= 30 else nv

            troll7  = float(np.mean(t7m))  if t7m  else 33.0
            troll30 = float(np.mean(t30m)) if t30m else 33.0
            nroll7  = float(np.mean(n7m))  if n7m  else 23.0
            nroll30 = float(np.mean(n30m)) if n30m else 23.0

            # -- API --
            api_src = np.array(r30 if r30 else [0.0], dtype=np.float64)
            api_val = float(lfilter([1.0], [1.0, -0.85], np.nan_to_num(api_src))[-1])

            # -- Dry / Wet spells --
            ds = 0
            for v in reversed(rv):
                if v <= 0.1: ds += 1
                else: break
            ws = 0
            for v in reversed(rv):
                if v > 0.1: ws += 1
                else: break

            # -- Neighbor features (from yesterday's predicted values) --
            nb = neigh_map.get(key, [])
            if nb:
                nrains = [safe_idx(rain_h[nk], -1) for nk in nb if rain_h[nk]]
                if nrains:
                    nb_mean = float(np.mean(nrains))
                    nb_max  = float(np.max(nrains))
                else:
                    nb_mean = nb_max = rl1
            else:
                nb_mean = nb_max = rl1
            nb_any   = 1.0 if nb_mean > 0.1 else 0.0
            nb_roll7 = nb_mean   # simplified approximation

            # -- Climatology (O(1) dict lookup) --
            mk = (la, lo, mo)
            wk_k = (la, lo, wk)
            pk = (la, lo)

            cm  = clim_m_dict.get(mk, {})
            cw  = clim_w_dict.get(wk_k, {})
            prw = peak_dict.get(pk, 28.0)
            dsp = dry_dict.get(mk, 0.5)

            c_tmax = cm.get("Clim_MaxTemp", 33.0)
            c_tmin = cm.get("Clim_MinTemp", 23.0)
            c_rain = cm.get("Clim_Rainfall", 0.0)
            c_rp   = cm.get("Clim_Rain_Prob", 0.3)
            c_hum  = cm.get("Clim_Humidity_Proxy", 50.0)
            c_rw   = cw.get("Clim_Rainfall_Week", c_rain)
            c_rpw  = cw.get("Clim_Rain_Prob_Week", c_rp)

            # -- Derived features --
            dr   = tl1 - nl1
            lz   = 0 if la < 15 else (1 if la < 20 else (2 if la < 25 else 3))
            ta   = tl1 - c_tmax
            hp   = float(np.clip(100.0 - 5.0*dr, 10.0, 100.0))
            ha   = hp - c_hum
            pra  = float(np.clip(-0.5*ta - 0.2*roll3, -15, 15))
            ctt  = float(np.clip(295.0 - 15*(rl1>0.1) - 5*roll3 - 0.1*hp, 200, 310))
            mt   = float(np.clip((1.5*ism+0.5)*hp + 0.3*roll7, 0, 200))
            conv = float(np.clip(-0.8*pra + 0.3*nb_mean, -20, 20))

            row = {
                "Latitude": la, "Longitude": lo,
                "Year": yr, "Month": mo, "Day": dy,
                "Season": seas, "Season_Code": sc,
                "Month_sin": mo_s, "Month_cos": mo_c,
                "DayOfYear": doy, "Day_sin": dy_s, "Day_cos": dy_c,
                "Is_Monsoon": ism, "Lat_Zone": lz, "Week": wk,
                "Max_Temp": tl1, "Min_Temp": nl1,
                "Diurnal_Range": dr, "Rainfall": 0.0,
                # Lags
                "Rain_lag1": rl1, "Rain_lag2": rl2, "Rain_lag3": rl3,
                "Rain_lag7": rl7, "Rain_lag14": rl14,
                "Rain_lag1_binary": float(rl1 > 0.1), "Rainfall_lag1": rl1,
                "MaxTemp_lag1": tl1, "MaxTemp_lag3": tl3, "MaxTemp_lag7": tl7,
                "MinTemp_lag1": nl1, "MinTemp_lag3": nl3, "MinTemp_lag7": nl7,
                # Rolling
                "Rain_roll3": roll3, "Rain_roll7": roll7,
                "Rain_roll14": roll14, "Rain_roll30": roll30,
                "Rain_days7": days7, "Rain_max7": max7, "Rain_roll7_mean": mean7,
                "MaxTemp_roll7": troll7, "MaxTemp_roll30": troll30,
                "MinTemp_roll7": nroll7, "MinTemp_roll30": nroll30,
                # Spells & API
                "API": api_val, "Dry_Spell": ds, "Wet_Spell": ws,
                "Dry_Spell_x_Monsoon": ds*ism,
                "Dry_Spell_x_NotMonsoon": ds*(1-ism),
                # Neighbors
                "Neighbor_Rain_Mean": nb_mean, "Neighbor_Rain_Max": nb_max,
                "Neighbor_Any_Rain": nb_any, "Neighbor_Rain_Mean_roll7": nb_roll7,
                # Climatology
                "Clim_Rainfall": c_rain, "Clim_Rain_Prob": c_rp,
                "Clim_Rainfall_Week": c_rw, "Clim_Rain_Prob_Week": c_rpw,
                "Dry_Season_Prob": dsp,
                "Clim_Max_Temp": c_tmax, "Clim_Min_Temp": c_tmin,
                "Clim_MaxTemp": c_tmax, "Clim_MinTemp": c_tmin,
                "Clim_Humidity_Proxy": c_hum, "Peak_Rain_Week": prw,
                # Derived
                "Monsoon_Progress_Days": mp,
                "Lat_x_DayOfYear": la*doy, "Lon_x_DayOfYear": lo*doy,
                "Weeks_Since_Peak_Rain": wk - prw,
                "Rainfall_Anom_roll7": roll7 - c_rw*7,
                "Temp_Anomaly": ta, "Humidity_Proxy": hp,
                "Humidity_Anomaly": ha, "Pressure_Anomaly": pra,
                "Cloud_Top_Temp": ctt, "Moisture_Transport": mt,
                "Convergence_850hPa": conv,
                "MaxTemp_Anomaly": tl1 - c_tmax,
                "MinTemp_Anomaly": nl1 - c_tmin,
            }
            row.update(bhad)
            rows.append(row)

        # -- Convert to DataFrame & batch predict ------------------------
        day_df = pd.DataFrame(rows)

        # Fill any missing model features with 0
        for c in rain_fcols:
            if c not in day_df.columns:
                day_df[c] = 0.0
        for c in temp_fcols:
            if c not in day_df.columns:
                day_df[c] = 0.0

        X_rain = day_df[rain_fcols].astype(np.float32)

        # Stage 1: rain / no-rain
        p_rain = rain_cls.predict_proba(X_rain)[:, 1]

        # Stage 2a: general regressor
        pg = rain_reg.predict(X_rain)
        if is_log:
            pg = np.expm1(pg)
        pg = np.maximum(0.0, pg)

        # Stage 2b: extreme probability
        p_ex = rain_cls_ex.predict_proba(X_rain)[:, 1]

        # Stage 3: extreme regressor
        pe = np.maximum(0.0, rain_reg_ex.predict(X_rain))

        # ============================================================
        # CLIMATE-AWARE DAMPENING (prevents autoregressive divergence)
        # ============================================================
        # Problem: Without dampening, a small false-positive rain prediction
        # feeds back as Rain_lag1, making the next day predict even MORE rain,
        # creating an exponential snowball effect.
        #
        # Fix: Use climatological rain probability to set dynamic thresholds
        # and cap daily predictions at reasonable bounds.
        # ============================================================

        pred_r = np.zeros(len(day_df))
        for i in range(len(day_df)):
            crp = day_df.iloc[i]["Clim_Rain_Prob"]   # climatological rain prob
            cr  = day_df.iloc[i]["Clim_Rainfall"]     # monthly climatological rain

            # --- Dynamic threshold ---
            # Dry months (CRP~0.02): threshold ~0.89 (needs very high confidence)
            # Wet months (CRP~0.70): threshold ~0.50 (standard)
            # Peak monsoon (CRP~0.90): threshold ~0.46 (slightly easier)
            dyn_threshold = max(0.45, 0.5 + 0.40 * max(0, 1.0 - 2.5 * crp))

            if p_rain[i] >= dyn_threshold:
                th = rain_thresh.get(
                    (day_df.iloc[i]["Latitude"], day_df.iloc[i]["Longitude"]), 30.0)
                if p_ex[i] >= 0.5 or pg[i] >= 0.7 * th:
                    pred_r[i] = pe[i]
                else:
                    pred_r[i] = pg[i]

                # --- Climatological cap ---
                # Cap = 30% of monthly clim (so 1 day can't exceed ~1/3 of month)
                # Floor of 15mm so even dry months can have a light shower.
                # June Ahmedabad (~150mm/mo): cap = 45mm
                # July Mumbai   (~700mm/mo): cap = 210mm (allows heavy events)
                # January Gujarat (~1mm/mo): cap = 15mm
                daily_cap = max(cr * 0.30, 15.0)
                pred_r[i] = min(pred_r[i], daily_cap)

        # Temperature prediction with climatological anchoring
        X_temp = day_df[temp_fcols].astype(np.float32).copy()
        X_temp["Rainfall"] = pred_r
        raw_tmax = tmax_model.predict(X_temp)
        raw_tmin = tmin_model.predict(X_temp)

        # Blend with climatology to prevent autoregressive temperature drift
        # 70% model prediction + 30% climatological average
        c_tmax_arr = day_df["Clim_MaxTemp"].values.astype(np.float32)
        c_tmin_arr = day_df["Clim_MinTemp"].values.astype(np.float32)
        pred_tmax = 0.70 * raw_tmax + 0.30 * c_tmax_arr
        pred_tmin = 0.70 * raw_tmin + 0.30 * c_tmin_arr

        # -- Update per-cell history buffers -----------------------------
        for i, (la, lo) in enumerate(cells_tuples):
            key = (la, lo)
            rain_h[key].append(float(pred_r[i]))
            tmax_h[key].append(float(pred_tmax[i]))
            tmin_h[key].append(float(pred_tmin[i]))
            # Trim to keep memory bounded
            if len(rain_h[key]) > HISTORY_KEEP:
                rain_h[key] = rain_h[key][-HISTORY_KEEP:]
                tmax_h[key] = tmax_h[key][-HISTORY_KEEP:]
                tmin_h[key] = tmin_h[key][-HISTORY_KEEP:]

        # -- Collect output ----------------------------------------------
        out_df = pd.DataFrame({
            "Date": ts,
            "Latitude": [la for la, lo in cells_tuples],
            "Longitude": [lo for la, lo in cells_tuples],
            "Rainfall": pred_r,
            "Max_Temp": pred_tmax,
            "Min_Temp": pred_tmin,
            "Diurnal_Range": pred_tmax - pred_tmin,
            "Season": seas,
            "Year": yr, "Month": mo, "Day": dy,
        })
        all_out.append(out_df)

        # -- Progress ----------------------------------------------------
        if day_num == 1 or day_num % 7 == 0 or cur == ROLLFORWARD_END:
            wet  = int((pred_r > 0.1).sum())
            tr   = float(pred_r.sum())
            # Ahmedabad sample
            ai = None
            for idx_c, (la, lo) in enumerate(cells_tuples):
                if la == 23.5 and lo == 72.5:
                    ai = idx_c; break
            if ai is not None:
                a_r = f"{pred_r[ai]:.1f}mm"
                a_t = f"{pred_tmax[ai]:.1f}C"
            else:
                a_r = a_t = "N/A"
            print(f"  Day {day_num:3d}/{total_days} | {cur} | "
                  f"Wet: {wet:3d}/{n_cells} | TotalRain: {tr:8.1f}mm | "
                  f"Ahmedabad: rain={a_r}  tmax={a_t}")

        cur += timedelta(days=1)

    # -- 7. Save ---------------------------------------------------------
    print("\n" + "-" * 70)
    print("Saving rollforward predictions ...")
    result = pd.concat(all_out, ignore_index=True)
    result.to_csv(OUTPUT_CSV, index=False)
    print(f"  [OK] Saved {len(result):,} rows -> {OUTPUT_CSV}")
    print(f"  [OK] Range: {result['Date'].min()} -> {result['Date'].max()}")

    # -- Monthly summary for Ahmedabad -----------------------------------
    ahm = result[(result["Latitude"] == 23.5) & (result["Longitude"] == 72.5)].copy()
    if len(ahm):
        ahm["Date"] = pd.to_datetime(ahm["Date"])
        ahm["Mo"] = ahm["Date"].dt.month
        print("\n  Ahmedabad (23.5N, 72.5E) -- Monthly Rollforward Summary:")
        monthly = ahm.groupby("Mo").agg(
            AvgMaxTemp=("Max_Temp", "mean"),
            AvgMinTemp=("Min_Temp", "mean"),
            TotalRain=("Rainfall", "sum"),
            RainyDays=("Rainfall", lambda x: (x > 0.1).sum()),
        ).round(1)
        print(monthly.to_string())

    print("\n" + "=" * 70)
    print("  [OK] ROLLFORWARD COMPLETE!")
    print("  Next: run_inference.py will auto-load rollforward_2026.csv")
    print("        for self-consistent lag features on future dates.")
    print("=" * 70)


if __name__ == "__main__":
    main()
