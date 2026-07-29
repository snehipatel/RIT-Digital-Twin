"""
================================================================================
DIGITAL TWIN METEOROLOGICAL INFERENCE ENGINE  —  FIXED VERSION
================================================================================
BUG FIXED: Climatology features (Clim_Rainfall, Clim_MaxTemp, Peak_Rain_Week,
etc.) were being read from non-existent columns in merged_climate_data.csv,
silently defaulting to placeholder values (0.0, 35.0, 22.0...). This caused
a train/inference mismatch responsible for the 7°C temp error and 244mm
rainfall over-prediction.

FIX: Load the pre-computed climatology_monthly.csv, climatology_weekly.csv,
peak_rain_week.csv, dry_season_prob.csv (built by build_climatology_table.py)
and JOIN them onto the target row by [Latitude, Longitude, Month/Week] —
this restores the REAL climatology values the model was trained on.

ALSO FIXED: The fallback date logic for future dates now uses ONLY the
calendar-day proxy for LAG/ROLLING features (recent weather memory), while
climatology comes from the FULL 75-year average (not tied to one proxy year).
This matches what the model actually learned during training.

PREREQUISITE: run build_climatology_table.py once before using this script.

Usage:
  py run_inference_fixed.py --lat 21.0 --lon 79.0 --date 2024-07-15
  py run_inference_fixed.py --lat 23.5 --lon 72.5 --date 2026-06-30
================================================================================
"""

import pandas as pd
# pyrefly: ignore [missing-import]
import numpy as np
import pickle
import argparse
import warnings
import os
import json
# pyrefly: ignore [missing-import]
from scipy.signal import lfilter

warnings.filterwarnings("ignore")

MERGED_CSV       = "merged_climate_data_v2.csv" if os.path.exists("merged_climate_data_v2.csv") else "merged_climate_data.csv"
BHADALI_CSV      = "bhadali_features.csv"
CLIM_MONTHLY_CSV = "climatology_monthly.csv"
CLIM_WEEKLY_CSV  = "climatology_weekly.csv"
PEAK_WEEK_CSV    = "peak_rain_week.csv"
DRY_PROB_CSV     = "dry_season_prob.csv"
ROLLFORWARD_CSV  = "rollforward_2026.csv"


def parse_args():
    parser = argparse.ArgumentParser(description="Digital Twin Meteorological Inference Engine (Fixed)")
    parser.add_argument("--lat", type=float, default=21.0)
    parser.add_argument("--lon", type=float, default=79.0)
    parser.add_argument("--date", type=str, default="2024-07-15")
    parser.add_argument("--dry-sim", action="store_true")
    parser.add_argument("--no-api", action="store_true", help="Disable fetching real weather observations from Open-Meteo API")
    return parser.parse_args()


def fetch_open_meteo_data(lat, lon, start_date, end_date):
    import urllib.request
    import json
    
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")
    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}&start_date={start_str}&end_date={end_str}"
        f"&daily=rain_sum,temperature_2m_max,temperature_2m_min&timezone=auto"
    )
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
        
        daily = data.get("daily", {})
        times = daily.get("time", [])
        rain = daily.get("rain_sum", [])
        tmax = daily.get("temperature_2m_max", [])
        tmin = daily.get("temperature_2m_min", [])
        
        if not times:
            return None
            
        df_api = pd.DataFrame({
            "Date": pd.to_datetime(times),
            "Rainfall": rain,
            "Max_Temp": tmax,
            "Min_Temp": tmin
        })
        df_api["Rainfall"] = df_api["Rainfall"].fillna(0.0)
        df_api["Max_Temp"] = df_api["Max_Temp"].ffill().bfill()
        df_api["Min_Temp"] = df_api["Min_Temp"].ffill().bfill()
        df_api["Diurnal_Range"] = df_api["Max_Temp"] - df_api["Min_Temp"]
        return df_api
    except Exception as e:
        print(f"  [API Warning] Failed to fetch data from Open-Meteo: {e}")
        return None


def main():
    args = parse_args()
    lat, lon = args.lat, args.lon
    date_str = args.date
    target_date = pd.Timestamp(date_str)

    print("=" * 60)
    print("DIGITAL TWIN INFERENCE ENGINE (FIXED)")
    print(f"Target: Lat={lat}°N | Lon={lon}°E | Date={date_str}")
    print("=" * 60)

    # ── 1. Check required files ───────────────────────────────────────────────
    model_files = [
        "max_temp_model.pkl", "min_temp_model.pkl", "feature_columns.pkl",
        "rainfall_classifier.pkl", "rainfall_regressor.pkl",
        "rainfall_extreme_classifier.pkl", "rainfall_extreme_regressor.pkl",
        "rainfall_quantile_10.pkl", "rainfall_quantile_90.pkl",
        "rainfall_extreme_thresholds.pkl", "rainfall_feature_cols.pkl",
    ]
    clim_files = [CLIM_MONTHLY_CSV, CLIM_WEEKLY_CSV, PEAK_WEEK_CSV, DRY_PROB_CSV]

    missing = [f for f in model_files if not os.path.exists(f)]
    if missing:
        print(f"Error: Missing model files: {missing}")
        return

    missing_clim = [f for f in clim_files if not os.path.exists(f)]
    if missing_clim:
        print(f"Error: Missing climatology lookup files: {missing_clim}")
        print("FIX: Run 'py build_climatology_table.py' first — it generates")
        print("     these 4 files from merged_climate_data.csv (one-time setup).")
        return

    # ── 2. Load models ────────────────────────────────────────────────────────
    print("  Loading AI models...")
    with open("max_temp_model.pkl", "rb") as f:           temp_max_model = pickle.load(f)
    with open("min_temp_model.pkl", "rb") as f:           temp_min_model = pickle.load(f)
    temp_max_model.pandas_categorical = None
    temp_min_model.pandas_categorical = None
    with open("feature_columns.pkl", "rb") as f:          temp_features = pickle.load(f)
    with open("rainfall_classifier.pkl", "rb") as f:      rain_cls = pickle.load(f)
    with open("rainfall_regressor.pkl", "rb") as f:       rain_reg_gen = pickle.load(f)
    with open("rainfall_extreme_classifier.pkl", "rb") as f: rain_cls_ex = pickle.load(f)
    with open("rainfall_extreme_regressor.pkl", "rb") as f:  rain_reg_ex = pickle.load(f)
    with open("rainfall_quantile_10.pkl", "rb") as f:     rain_q10 = pickle.load(f)
    with open("rainfall_quantile_90.pkl", "rb") as f:     rain_q90 = pickle.load(f)
    with open("rainfall_extreme_thresholds.pkl", "rb") as f: rain_thresholds = pickle.load(f)
    with open("rainfall_feature_cols.pkl", "rb") as f:    rain_features = pickle.load(f)
    with open("rainfall_metrics.json", "r") as f:
        metrics_cfg = json.load(f)
    is_log_2a = "Log1p" in metrics_cfg["stage2a_objective"]

    # ── 3. Load climatology lookup tables (THE FIX) ──────────────────────────
    print("  Loading climatology lookup tables...")
    clim_monthly = pd.read_csv(CLIM_MONTHLY_CSV)
    clim_weekly  = pd.read_csv(CLIM_WEEKLY_CSV)
    peak_week_df = pd.read_csv(PEAK_WEEK_CSV)
    dry_prob_df  = pd.read_csv(DRY_PROB_CSV)

    # ── 4. Find nearest grid point ────────────────────────────────────────────
    print("  Finding the nearest grid point in dataset...")
    unique_coords = pd.read_csv(MERGED_CSV, usecols=["Latitude", "Longitude"]).drop_duplicates()
    dist = (unique_coords["Latitude"] - lat) ** 2 + (unique_coords["Longitude"] - lon) ** 2
    nearest_idx = dist.idxmin()
    nearest_lat = unique_coords.loc[nearest_idx, "Latitude"]
    nearest_lon = unique_coords.loc[nearest_idx, "Longitude"]
    dist_val = np.sqrt(dist.min())

    if dist_val > 2.0:
        print(f"Error: Location too far ({dist_val:.1f}°) from IMD grid coverage.")
        return

    print(f"  Mapped to nearest IMD Grid Point: {nearest_lat:.2f}°N, {nearest_lon:.2f}°E "
          f"(Distance: {dist_val:.2f}°)")

    # ── 5. Load historical slice for this grid cell ──────────────────────────
    print("  Loading historical dataset slice...")
    dtypes_climate = {
        "Year": "int16", "Month": "int8", "Day": "int8", "Season": "category",
        "Latitude": "float32", "Longitude": "float32",
        "Max_Temp": "float32", "Min_Temp": "float32",
        "Diurnal_Range": "float32", "Rainfall": "float32",
    }
    iter_csv = pd.read_csv(MERGED_CSV, dtype=dtypes_climate, chunksize=100000)
    cell_dfs = []
    for chunk in iter_csv:
        subset = chunk[(chunk["Latitude"] == nearest_lat) & (chunk["Longitude"] == nearest_lon)]
        if len(subset) > 0:
            cell_dfs.append(subset)
    df_cell = pd.concat(cell_dfs).reset_index(drop=True)
    df_cell["Date"] = pd.to_datetime(df_cell["Date"], format="mixed", dayfirst=True)
    df_cell = df_cell.sort_values("Date").reset_index(drop=True)
    df_cell["Rainfall"] = df_cell["Rainfall"].fillna(0.0)

    # ── 5a. Fetch real weather from Open-Meteo API if needed ─────────────────
    api_used = False
    if target_date.year >= 2026 and not args.no_api:
        start_api = target_date - pd.Timedelta(days=35)
        # Fetch actual recorded daily data for target grid coordinates
        print(f"  [API] Fetching real-world antecedent weather from Open-Meteo for {lat:.2f}N, {lon:.2f}E...")
        df_api = fetch_open_meteo_data(nearest_lat, nearest_lon, start_api, target_date)
        if df_api is not None and len(df_api) > 0:
            df_api["Latitude"] = nearest_lat
            df_api["Longitude"] = nearest_lon
            df_api["Year"] = df_api["Date"].dt.year
            df_api["Month"] = df_api["Date"].dt.month
            df_api["Day"] = df_api["Date"].dt.day
            
            def get_season(m):
                if m in [12, 1, 2]: return "Winter"
                if m in [3, 4, 5]: return "Pre-Monsoon"
                if m in [6, 7, 8, 9]: return "Monsoon"
                return "Post-Monsoon"
            df_api["Season"] = df_api["Month"].apply(get_season)
            
            # Match columns of df_cell
            for col in df_cell.columns:
                if col not in df_api.columns:
                    df_api[col] = np.nan
            
            # Fill spatial/neighbor columns for model compatibility
            df_api["Neighbor_Rain_Mean"] = df_api["Rainfall"].shift(1).fillna(0.0)
            df_api["Neighbor_Rain_Max"]  = df_api["Rainfall"].shift(1).fillna(0.0)
            
            df_api = df_api[df_cell.columns]
            
            # Concat with history slice
            df_cell = pd.concat([df_cell, df_api], ignore_index=True)
            df_cell = df_cell.drop_duplicates(subset=["Date"]).sort_values("Date").reset_index(drop=True)
            api_used = True
            print(f"  [API] Appended {len(df_api)} actual weather days from API ({df_api['Date'].min().date()} -> {df_api['Date'].max().date()})")
            print(f"  [API] Lags will use real-world observed precipitation and temperatures!")

    # ── 5b. Append rollforward synthetic data if available (fallback) ────────
    rollforward_used = False
    if not api_used:
        if os.path.exists(ROLLFORWARD_CSV):
            print("  [Rollforward] Found rollforward_2026.csv — loading synthetic predictions...")
            rf = pd.read_csv(ROLLFORWARD_CSV)
            rf["Date"] = pd.to_datetime(rf["Date"])
            rf_cell = rf[(rf["Latitude"] == nearest_lat) & (rf["Longitude"] == nearest_lon)].copy()
            if len(rf_cell) > 0:
                # Ensure columns match
                for col in df_cell.columns:
                    if col not in rf_cell.columns:
                        rf_cell[col] = np.nan
                rf_cell = rf_cell[df_cell.columns]
                df_cell = pd.concat([df_cell, rf_cell], ignore_index=True)
                df_cell = df_cell.sort_values("Date").reset_index(drop=True)
                rollforward_used = True
                print(f"  [Rollforward] Appended {len(rf_cell)} synthetic days "
                      f"({rf_cell['Date'].min().date()} -> {rf_cell['Date'].max().date()})")
                print(f"  [Rollforward] Lag features will use self-consistent predictions, NOT last year's proxy!")
            else:
                print(f"  [Rollforward] No data for grid cell ({nearest_lat}, {nearest_lon}) in rollforward CSV.")

    # Merge Bhadali features
    df_bhadali = pd.read_csv(BHADALI_CSV)
    df_bhadali["Date"] = pd.to_datetime(df_bhadali["Date"], dayfirst=True)
    df_cell["Date"] = pd.to_datetime(df_cell["Date"], dayfirst=True)
    df_cell = df_cell.merge(df_bhadali, on="Date", how="left")
    df_cell = df_cell.sort_values("Date").reset_index(drop=True)

    # For rollforward/API rows that have no Bhadali match (2026 dates not in bhadali_features.csv),
    # compute Bhadali features on the fly if ephem is available
    if rollforward_used or api_used:
        missing_bhad = df_cell[df_cell["Moon_Phase_Angle"].isna() & (df_cell["Date"].dt.year >= 2026)]
        if len(missing_bhad) > 0:
            try:
                import ephem, math
                from bhadali_features import get_lunar_features
                print(f"  [Rollforward/API] Computing Bhadali features for {len(missing_bhad)} dates...")
                for idx_b in missing_bhad.index:
                    dt_b = df_cell.loc[idx_b, "Date"].to_pydatetime().date()
                    feats = get_lunar_features(dt_b)
                    for k, v in feats.items():
                        if k in df_cell.columns:
                            df_cell.loc[idx_b, k] = v
            except Exception as e:
                print(f"  [Rollforward/API] Could not compute Bhadali for 2026 (filling defaults): {e}")
                for col in [c for c in df_cell.columns if c.startswith(('Moon_','Tithi','Paksha','Nakshatra','Lunar_','Vara','Is_','Monsoon_S','Pre_M','Post_M','Bhadali','Swati','Rohini','Purnima'))]:
                    df_cell[col] = df_cell[col].fillna(0.0)

    # ── 6. Determine target row index (with proper future-date handling) ────
    target_idx = df_cell[df_cell["Date"] == target_date].index
    is_future = False
    proxy_date = target_date

    if len(target_idx) == 0:
        is_future = True
        max_date = df_cell["Date"].max()
        print(f"  [Info] Target date {date_str} is beyond dataset (ends {max_date.date()}).")

        # Try to use the day BEFORE as proxy (for rollforward, this is yesterday's synthetic prediction)
        fallback_year = max_date.year
        try:
            proxy_date = pd.Timestamp(year=fallback_year, month=target_date.month, day=target_date.day)
        except ValueError:
            proxy_date = pd.Timestamp(year=fallback_year, month=target_date.month, day=target_date.day - 1)

        # If rollforward data extended our history, the proxy might be in 2026 now
        target_idx = df_cell[df_cell["Date"] == proxy_date].index
        if len(target_idx) == 0:
            # Fall back to the last available date in the dataset
            proxy_date = max_date
            target_idx = df_cell[df_cell["Date"] == proxy_date].index

        if len(target_idx) == 0:
            print(f"Error: Could not find any proxy date in history.")
            return

        if rollforward_used:
            print(f"  Using {proxy_date.date()} from rollforward predictions as recent-weather proxy.")
        elif api_used:
            print(f"  Using {proxy_date.date()} from Open-Meteo observations as recent-weather proxy.")
        else:
            print(f"  Using {proxy_date.date()} as recent-weather-memory proxy "
                  f"(lag/rolling features only -- climatology comes from full 75-yr average).")
    else:
        if rollforward_used and target_date.year >= 2026:
            print(f"  [Rollforward] Using self-consistent synthetic lag chain for {date_str}")

    idx = target_idx[0]
    if idx < 30:
        print("Error: Target date too early -- need 30 days of history for lag features.")
        return

    # ── 7. Ground truth (only if NOT a future date) ──────────────────────────
    ground_truth = None
    if not is_future:
        ground_truth = {
            "max_temp": df_cell.loc[idx, "Max_Temp"],
            "min_temp": df_cell.loc[idx, "Min_Temp"],
            "rainfall": df_cell.loc[idx, "Rainfall"],
        }

    # ── 8. Feature engineering (lag/rolling — same as before, this part was OK) ─
    df_temp = df_cell.iloc[:idx + 1].copy()

    season_map = {"Winter": 0, "Pre-Monsoon": 1, "Monsoon": 2, "Post-Monsoon": 3}
    df_temp["Season_Code"] = df_temp["Season"].map(season_map).astype(np.int8)
    df_temp["Month_sin"]   = np.sin(2 * np.pi * df_temp["Month"] / 12).astype(np.float32)
    df_temp["Month_cos"]   = np.cos(2 * np.pi * df_temp["Month"] / 12).astype(np.float32)
    df_temp["DayOfYear"]   = df_temp["Date"].dt.dayofyear.astype(np.int16)
    df_temp["Day_sin"]     = np.sin(2 * np.pi * df_temp["DayOfYear"] / 365).astype(np.float32)
    df_temp["Day_cos"]     = np.cos(2 * np.pi * df_temp["DayOfYear"] / 365).astype(np.float32)
    df_temp["Is_Monsoon"]  = df_temp["Month"].isin([6, 7, 8, 9]).astype(np.int8)
    df_temp["Lat_Zone"]    = pd.cut(df_temp["Latitude"], bins=[0, 15, 20, 25, 40],
                                     labels=[0, 1, 2, 3]).astype(np.float32)
    df_temp["Week"]        = df_temp["Date"].dt.isocalendar().week.astype(np.int8)

    for lag in [1, 2, 3, 7, 14]:
        df_temp[f"Rain_lag{lag}"] = df_temp["Rainfall"].shift(lag).astype(np.float32)
    df_temp["MaxTemp_lag1"] = df_temp["Max_Temp"].shift(1).astype(np.float32)
    df_temp["MaxTemp_lag3"] = df_temp["Max_Temp"].shift(3).astype(np.float32)
    df_temp["MaxTemp_lag7"] = df_temp["Max_Temp"].shift(7).astype(np.float32)
    df_temp["MinTemp_lag1"] = df_temp["Min_Temp"].shift(1).astype(np.float32)
    df_temp["MinTemp_lag3"] = df_temp["Min_Temp"].shift(3).astype(np.float32)
    df_temp["MinTemp_lag7"] = df_temp["Min_Temp"].shift(7).astype(np.float32)
    df_temp["Rain_lag1_binary"] = (df_temp["Rain_lag1"] > 0.1).astype(np.float32)
    df_temp["Rainfall_lag1"]    = df_temp["Rain_lag1"]

    df_temp["Rain_roll3"]   = df_temp["Rainfall"].shift(1).rolling(3,  min_periods=1).sum().astype(np.float32)
    df_temp["Rain_roll7"]   = df_temp["Rainfall"].shift(1).rolling(7,  min_periods=1).sum().astype(np.float32)
    df_temp["Rain_roll14"]  = df_temp["Rainfall"].shift(1).rolling(14, min_periods=1).sum().astype(np.float32)
    df_temp["Rain_roll30"]  = df_temp["Rainfall"].shift(1).rolling(30, min_periods=1).sum().astype(np.float32)
    df_temp["Rain_days7"]   = (df_temp["Rainfall"].shift(1) > 0.1).rolling(7, min_periods=1).sum().astype(np.float32)
    df_temp["Rain_max7"]    = df_temp["Rainfall"].shift(1).rolling(7, min_periods=1).max().astype(np.float32)
    df_temp["Rain_roll7_mean"] = df_temp["Rainfall"].shift(1).rolling(7, min_periods=1).mean().astype(np.float32)
    df_temp["MaxTemp_roll7"]  = df_temp["Max_Temp"].shift(1).rolling(7,  min_periods=1).mean().astype(np.float32)
    df_temp["MaxTemp_roll30"] = df_temp["Max_Temp"].shift(1).rolling(30, min_periods=1).mean().astype(np.float32)
    df_temp["MinTemp_roll7"]  = df_temp["Min_Temp"].shift(1).rolling(7,  min_periods=1).mean().astype(np.float32)
    df_temp["MinTemp_roll30"] = df_temp["Min_Temp"].shift(1).rolling(30, min_periods=1).mean().astype(np.float32)

    df_temp["API"] = lfilter([1.0], [1.0, -0.85], df_temp["Rain_lag1"].fillna(0.0).values).astype(np.float32)

    def dry_spell_vec(series):
        shifted = series.shift(1)
        is_dry  = (shifted <= 0.1).astype(int)
        not_dry = (is_dry == 0).cumsum()
        return is_dry.groupby(not_dry).cumsum().astype(np.float32)

    def wet_spell_vec(series):
        shifted = series.shift(1)
        is_wet  = (shifted > 0.1).astype(int)
        not_wet = (is_wet == 0).cumsum()
        return is_wet.groupby(not_wet).cumsum().astype(np.float32)

    df_temp["Dry_Spell"] = dry_spell_vec(df_temp["Rainfall"])
    df_temp["Wet_Spell"] = wet_spell_vec(df_temp["Rainfall"])
    df_temp["Dry_Spell_x_Monsoon"]    = (df_temp["Dry_Spell"] * df_temp["Is_Monsoon"]).astype(np.float32)
    df_temp["Dry_Spell_x_NotMonsoon"] = (df_temp["Dry_Spell"] * (1 - df_temp["Is_Monsoon"])).astype(np.float32)

    df_temp["Neighbor_Rain_Mean"] = (df_cell.loc[:idx, "Neighbor_Rain_Mean"].values
                                      if "Neighbor_Rain_Mean" in df_cell.columns else df_temp["Rain_lag1"])
    df_temp["Neighbor_Rain_Max"]  = (df_cell.loc[:idx, "Neighbor_Rain_Max"].values
                                      if "Neighbor_Rain_Max" in df_cell.columns else df_temp["Rain_lag1"])
    df_temp["Neighbor_Any_Rain"]  = (df_temp["Neighbor_Rain_Mean"] > 0.1).astype(np.float32)
    df_temp["Neighbor_Rain_Mean_roll7"] = df_temp["Neighbor_Rain_Mean"].rolling(7, min_periods=1).mean().astype(np.float32)

    # ── 9. CLIMATOLOGY — THE FIX: join from precomputed tables ───────────────
    print("  Joining climatology features (FIXED — using real 75-year averages)...")

    target_month = target_date.month  # use REAL target month/week, not proxy's
    target_week  = target_date.isocalendar()[1]

    m_row = clim_monthly[(clim_monthly["Latitude"] == nearest_lat) &
                          (clim_monthly["Longitude"] == nearest_lon) &
                          (clim_monthly["Month"] == target_month)]
    w_row = clim_weekly[(clim_weekly["Latitude"] == nearest_lat) &
                         (clim_weekly["Longitude"] == nearest_lon) &
                         (clim_weekly["Week"] == target_week)]
    p_row = peak_week_df[(peak_week_df["Latitude"] == nearest_lat) &
                          (peak_week_df["Longitude"] == nearest_lon)]
    d_row = dry_prob_df[(dry_prob_df["Latitude"] == nearest_lat) &
                         (dry_prob_df["Longitude"] == nearest_lon) &
                         (dry_prob_df["Month"] == target_month)]

    def safe_val(row, col, default):
        return float(row[col].values[0]) if len(row) > 0 else default

    clim_max_temp   = safe_val(m_row, "Clim_MaxTemp", 33.0)
    clim_min_temp   = safe_val(m_row, "Clim_MinTemp", 23.0)
    clim_rainfall   = safe_val(m_row, "Clim_Rainfall", 0.0)
    clim_rain_prob  = safe_val(m_row, "Clim_Rain_Prob", 0.3)
    clim_humidity   = safe_val(m_row, "Clim_Humidity_Proxy", 50.0)
    clim_rain_week  = safe_val(w_row, "Clim_Rainfall_Week", clim_rainfall)
    clim_prob_week  = safe_val(w_row, "Clim_Rain_Prob_Week", clim_rain_prob)
    peak_rain_week  = safe_val(p_row, "Peak_Rain_Week", 28)
    dry_season_prob = safe_val(d_row, "Dry_Season_Prob", 0.5)

    df_temp["Clim_Rainfall"]       = clim_rainfall
    df_temp["Clim_Rain_Prob"]      = clim_rain_prob
    df_temp["Clim_Rainfall_Week"]  = clim_rain_week
    df_temp["Clim_Rain_Prob_Week"] = clim_prob_week
    df_temp["Dry_Season_Prob"]     = dry_season_prob
    df_temp["Clim_Max_Temp"]       = clim_max_temp
    df_temp["Clim_Min_Temp"]       = clim_min_temp
    df_temp["Clim_MaxTemp"]        = clim_max_temp
    df_temp["Clim_MinTemp"]        = clim_min_temp
    df_temp["Clim_Humidity_Proxy"] = clim_humidity
    df_temp["Peak_Rain_Week"]      = peak_rain_week

    df_temp["Monsoon_Progress_Days"] = np.where(
        df_temp["Month"].isin([6, 7, 8, 9]),
        (df_temp["DayOfYear"] - 152).astype(np.float32), 0.0
    ).astype(np.float32)
    df_temp["Lat_x_DayOfYear"] = (df_temp["Latitude"] * df_temp["DayOfYear"]).astype(np.float32)
    df_temp["Lon_x_DayOfYear"] = (df_temp["Longitude"] * df_temp["DayOfYear"]).astype(np.float32)
    df_temp["Weeks_Since_Peak_Rain"] = (df_temp["Week"] - df_temp["Peak_Rain_Week"]).astype(np.float32)
    df_temp["Rainfall_Anom_roll7"] = (df_temp["Rain_roll7"] - (df_temp["Clim_Rainfall_Week"] * 7.0)).astype(np.float32)

    df_temp["Temp_Anomaly"] = (df_temp["Max_Temp"] - df_temp["Clim_Max_Temp"]).astype(np.float32)
    df_temp["Humidity_Proxy"] = (100.0 - 5.0 * df_temp["Diurnal_Range"]).clip(10.0, 100.0).astype(np.float32)
    df_temp["Humidity_Anomaly"] = (
        df_temp["Humidity_Proxy"] - df_temp["Clim_Humidity_Proxy"]
    ).astype(np.float32)
    df_temp["Pressure_Anomaly"] = (-0.5 * df_temp["Temp_Anomaly"] - 0.2 * df_temp["Rain_roll3"]).clip(-15.0, 15.0).astype(np.float32)
    df_temp["Cloud_Top_Temp"] = (
        295.0 - 15.0 * (df_temp["Rain_lag1"] > 0.1) - 5.0 * df_temp["Rain_roll3"]
        - 0.1 * df_temp["Humidity_Proxy"]
    ).clip(200.0, 310.0).astype(np.float32)
    df_temp["Moisture_Transport"] = (
        ((1.5 * df_temp["Is_Monsoon"] + 0.5) * df_temp["Humidity_Proxy"])
        + 0.3 * df_temp["Rain_roll7"]
    ).clip(0.0, 200.0).astype(np.float32)
    df_temp["Convergence_850hPa"] = (
        -0.8 * df_temp["Pressure_Anomaly"] + 0.3 * df_temp["Neighbor_Rain_Mean"]
    ).clip(-20.0, 20.0).astype(np.float32)

    df_temp["MaxTemp_Anomaly"] = df_temp["Max_Temp"] - df_temp["Clim_MaxTemp"]
    df_temp["MinTemp_Anomaly"] = df_temp["Min_Temp"] - df_temp["Clim_MinTemp"]

    # ── 10. Build target row ──────────────────────────────────────────────────
    target_row = df_temp.iloc[idx:idx + 1].copy()

    # If this is a future date, override the calendar fields (Month/Day/DayOfYear/
    # seasonal cycles) to reflect the REAL target date, not the proxy date —
    # only lag/rolling memory comes from the proxy.
    if is_future:
        target_row["Year"]       = target_date.year
        target_row["Month"]      = target_date.month
        target_row["Day"]        = target_date.day
        target_row["DayOfYear"]  = target_date.dayofyear
        target_row["Month_sin"]  = np.sin(2*np.pi*target_date.month/12)
        target_row["Month_cos"]  = np.cos(2*np.pi*target_date.month/12)
        target_row["Day_sin"]    = np.sin(2*np.pi*target_date.dayofyear/365)
        target_row["Day_cos"]    = np.cos(2*np.pi*target_date.dayofyear/365)
        target_row["Is_Monsoon"] = int(target_date.month in [6,7,8,9])
        target_row["Week"]       = target_week

    if args.dry_sim:
        print("  [Simulation] Overriding lag features for dry antecedent conditions...")
        for lag in [1, 2, 3, 7, 14]:
            target_row[f"Rain_lag{lag}"] = 0.0
        target_row["Rain_lag1_binary"] = 0.0
        target_row["Rainfall_lag1"] = 0.0
        target_row["Rain_roll3"] = 0.0
        target_row["Rain_roll7"] = 0.0
        target_row["Rain_roll14"] = 0.0
        target_row["Rain_roll30"] = 0.0
        target_row["Rain_days7"] = 0.0
        target_row["Rain_max7"] = 0.0
        target_row["Rain_roll7_mean"] = 0.0
        target_row["API"] = 0.0
        target_row["Dry_Spell"] = 10.0
        target_row["Wet_Spell"] = 0.0
        target_row["Neighbor_Rain_Mean"] = 0.0
        target_row["Neighbor_Rain_Max"] = 0.0
        target_row["Neighbor_Any_Rain"] = 0.0

    # ── 11. Rainfall cascade inference ────────────────────────────────────────
    # ── DIAGNOSTIC: show key inputs driving this prediction ──────────────────
    print("\n  [Diagnostic] Key inputs feeding the rainfall model:")
    diag_cols = ["Rain_lag1", "Rain_lag2", "Rain_lag3", "Rain_lag7",
                 "Rain_roll7", "Rain_roll30", "Rain_days7", "Rain_max7",
                 "Dry_Spell", "Wet_Spell", "Neighbor_Rain_Mean",
                 "Clim_Rainfall", "Clim_Rain_Prob"]
    for c in diag_cols:
        if c in target_row.columns:
            print(f"    {c:25s}: {target_row[c].values[0]:.2f}")
    print(f"    Proxy date used for lags : {proxy_date.date() if is_future else 'N/A (exact date)'}")

    X_rain = target_row[rain_features]
    prob_rain = rain_cls.predict_proba(X_rain)[0, 1]

    pred_rain = 0.0
    q10_val = q90_val = 0.0
    routing = "Stage 1 (Dry) -> Output 0"

    if prob_rain >= 0.5:
        pred_gen = rain_reg_gen.predict(X_rain)[0]
        if is_log_2a:
            pred_gen = np.expm1(pred_gen)
        pred_gen = max(0.0, float(pred_gen))

        prob_extreme = rain_cls_ex.predict_proba(X_rain)[0, 1]
        pred_ext = max(0.0, float(rain_reg_ex.predict(X_rain)[0]))

        pred_q10 = rain_q10.predict(X_rain)[0]
        pred_q90 = rain_q90.predict(X_rain)[0]
        if is_log_2a:
            pred_q10 = np.expm1(pred_q10)
            pred_q90 = np.expm1(pred_q90)
        pred_q10 = max(0.0, float(pred_q10))
        pred_q90 = max(0.0, float(pred_q90))

        print(f"  [Diagnostic] General regressor prediction (pred_gen): {pred_gen:.2f}mm")
        print(f"  [Diagnostic] Extreme classifier probability         : {prob_extreme*100:.1f}%")
        thresh_val = rain_thresholds.get((nearest_lat, nearest_lon),
                     rain_thresholds.get((lat, lon), 30.0))
        print(f"  [Diagnostic] Extreme-rain threshold for this grid cell: {thresh_val:.2f}mm "
              f"(routing trigger = pred_gen >= {0.7*thresh_val:.2f}mm)")
        route_to_extreme = (prob_extreme >= 0.5) or (pred_gen >= 0.7 * thresh_val)
        pred_rain = pred_ext if route_to_extreme else pred_gen
        q10_val = min(pred_q10, pred_rain)
        q90_val = max(pred_q90, pred_rain)
        routing = ("Stage 1 (Rain) -> Stage 2b/3 (Extreme Regressor)" if route_to_extreme
                  else "Stage 1 (Rain) -> Stage 2a (General Regressor)")

    # ── 12. Temperature inference ─────────────────────────────────────────────
    X_temp = target_row[temp_features].copy()
    X_temp["Rainfall"] = pred_rain

    pred_max_temp = temp_max_model.predict(X_temp)[0]
    pred_min_temp = temp_min_model.predict(X_temp)[0]
    pred_diurnal  = pred_max_temp - pred_min_temp

    # ── 13. Report ─────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("METEOROLOGICAL PREDICTION REPORT")
    print("=" * 60)
    print(f"Latitude  : {lat:.4f}° N")
    print(f"Longitude : {lon:.4f}° E")
    season_label = target_row["Season"].values[0] if "Season" in target_row else "N/A"
    print(f"Date      : {date_str} ({season_label})")
    if is_future:
        print(f"  (recent-weather proxy: {proxy_date.date()} | climatology: 75-yr average for "
              f"Month={target_month}, Week={target_week})")
    print("-" * 60)
    print(f"Rain Occurrence Probability  : {prob_rain*100:.1f}%")
    print(f"Predicted Rainfall Amount    : {pred_rain:.2f} mm")
    print(f"90% Prediction Interval      : [{q10_val:.2f} mm, {q90_val:.2f} mm]")
    print(f"Cascade Routing Path         : {routing}")
    print("-" * 60)
    print(f"Predicted Max Temperature    : {pred_max_temp:.2f} °C")
    print(f"Predicted Min Temperature    : {pred_min_temp:.2f} °C")
    print(f"Predicted Diurnal Range      : {pred_diurnal:.2f} °C")
    print("-" * 60)

    if is_future:
        print("CLIMATOLOGY COMPARISON (Real 75-Year Historical Baseline):")
        print(f"  Climatological Max Temp    : {clim_max_temp:.2f} °C")
        print(f"  Climatological Min Temp    : {clim_min_temp:.2f} °C")
        print(f"  Climatological Rainfall    : {clim_rainfall:.2f} mm  (was 0.00mm before fix)")
        print(f"  Temp Anomaly (Predicted)   : {pred_max_temp - clim_max_temp:+.2f} °C")
        print(f"  Rain Anomaly (Predicted)   : {pred_rain - clim_rainfall:+.2f} mm")
        print("=" * 60)
    else:
        if 'api_used' in locals() and api_used:
            print("REAL-WORLD OBSERVATIONS (Open-Meteo API):")
            print(f"  Recorded/Forecast Rain     : {ground_truth['rainfall']:.2f} mm")
            print(f"  Recorded Max Temperature   : {ground_truth['max_temp']:.2f} °C")
            print(f"  Recorded Min Temperature   : {ground_truth['min_temp']:.2f} °C")
            print(f"  Rainfall Prediction Error  : {pred_rain - ground_truth['rainfall']:+.2f} mm")
            print(f"  Max Temp Prediction Error  : {pred_max_temp - ground_truth['max_temp']:+.2f} °C")
            print(f"  Min Temp Prediction Error  : {pred_min_temp - ground_truth['min_temp']:+.2f} °C")
        else:
            print("GROUND TRUTH COMPARISON (Historical Validation):")
            print(f"  Actual Rainfall            : {ground_truth['rainfall']:.2f} mm")
            print(f"  Actual Max Temperature     : {ground_truth['max_temp']:.2f} °C")
            print(f"  Actual Min Temperature     : {ground_truth['min_temp']:.2f} °C")
            print(f"  Rainfall Prediction Error  : {pred_rain - ground_truth['rainfall']:+.2f} mm")
            print(f"  Max Temp Prediction Error  : {pred_max_temp - ground_truth['max_temp']:+.2f} °C")
            print(f"  Min Temp Prediction Error  : {pred_min_temp - ground_truth['min_temp']:+.2f} °C")
        print("=" * 60)

    # ── 14. Export to JSON for Dashboard sync ────────────────────────────────
    city_name = "Ahmedabad"
    city_key = "ahmedabad"
    
    # Map lat/lon to city key if close
    city_coords = {
        "ahmedabad":   (23.03, 72.58, "Ahmedabad"),
        "delhi":       (28.61, 77.21, "New Delhi"),
        "mumbai":      (19.08, 72.88, "Mumbai"),
        "chennai":     (13.08, 80.27, "Chennai"),
        "kolkata":     (22.57, 88.36, "Kolkata"),
        "bengaluru":   (12.97, 77.59, "Bengaluru"),
        "jaipur":      (26.91, 75.79, "Jaipur"),
        "bhubaneswar": (20.30, 85.85, "Bhubaneswar")
    }
    
    for ck, (clat, clon, cname) in city_coords.items():
        if math.hypot(lat - clat, lon - clon) < 1.5:
            city_key = ck
            city_name = cname
            break

    main_json = "sample_prediction.json"
    existing_data = {}
    if os.path.exists(main_json):
        try:
            with open(main_json, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
        except Exception:
            existing_data = {}

    if "city_predictions" not in existing_data or not isinstance(existing_data["city_predictions"], dict):
        existing_data["city_predictions"] = {}
    if "grid_predictions" not in existing_data or not isinstance(existing_data["grid_predictions"], list):
        existing_data["grid_predictions"] = []

    pred_item = {
        "city": city_name,
        "lat": lat,
        "lon": lon,
        "nearest_lat": nearest_lat,
        "nearest_lon": nearest_lon,
        "max_temp": round(float(pred_max_temp), 1),
        "min_temp": round(float(pred_min_temp), 1),
        "rainfall": round(float(pred_rain), 1),
        "humidity": int(np.clip(100 - (pred_max_temp - pred_min_temp) * 3.5, 30, 95))
    }

    if ground_truth:
        pred_item["actual_max_temp"] = round(float(ground_truth["max_temp"]), 1)
        pred_item["actual_min_temp"] = round(float(ground_truth["min_temp"]), 1)
        pred_item["actual_rainfall"] = round(float(ground_truth["rainfall"]), 1)
        pred_item["error_max_temp"]  = round(abs(pred_max_temp - ground_truth["max_temp"]), 2)
        pred_item["error_min_temp"]  = round(abs(pred_min_temp - ground_truth["min_temp"]), 2)
        pred_item["error_rainfall"]  = round(abs(pred_rain - ground_truth["rainfall"]), 2)

    existing_data["date"] = date_str
    existing_data["location"] = city_name
    existing_data["latitude"] = lat
    existing_data["longitude"] = lon
    existing_data["predictions"] = pred_item
    existing_data["city_predictions"][city_key] = pred_item

    # Add/update grid point
    grid_exists = False
    for gp in existing_data["grid_predictions"]:
        if math.hypot(gp.get("lat", 0) - nearest_lat, gp.get("lon", 0) - nearest_lon) < 0.1:
            gp["max_temp"] = pred_item["max_temp"]
            gp["min_temp"] = pred_item["min_temp"]
            gp["rainfall"] = pred_item["rainfall"]
            grid_exists = True
            break
    if not grid_exists:
        existing_data["grid_predictions"].append({
            "lat": nearest_lat,
            "lon": nearest_lon,
            "max_temp": pred_item["max_temp"],
            "min_temp": pred_item["min_temp"],
            "rainfall": pred_item["rainfall"]
        })

    # Update summary average across cities
    if existing_data["city_predictions"]:
        all_maxs = [c["max_temp"] for c in existing_data["city_predictions"].values() if "max_temp" in c]
        all_mins = [c["min_temp"] for c in existing_data["city_predictions"].values() if "min_temp" in c]
        all_rains = [c["rainfall"] for c in existing_data["city_predictions"].values() if "rainfall" in c]
        existing_data["all_india_summary"] = {
            "max_temp": round(float(np.mean(all_maxs)), 1) if all_maxs else pred_item["max_temp"],
            "min_temp": round(float(np.mean(all_mins)), 1) if all_mins else pred_item["min_temp"],
            "rainfall_24h": round(float(np.mean(all_rains)), 1) if all_rains else pred_item["rainfall"],
            "humidity": 60
        }

    sync_paths = [
        "sample_prediction.json",
        "frontend/data/sample_prediction.json",
        "frontend/public/data/sample_prediction.json",
        r"C:\Users\Snehi\Downloads\digital_twin (2)\digital_twin\sample_prediction.json"
    ]

    for p in sync_paths:
        try:
            os.makedirs(os.path.dirname(p), exist_ok=True) if os.path.dirname(p) else None
            with open(p, "w", encoding="utf-8") as f:
                json.dump(existing_data, f, indent=2)
            print(f"  [OK] Auto-synced live inference results ({city_name}) -> {p}")
        except Exception as err:
            pass
        except Exception as err:
            pass




if __name__ == "__main__":
    main()