"""
================================================================================
BUILD CLIMATOLOGY LOOKUP TABLE  —  Critical Bug Fix
================================================================================
PROBLEM FOUND:
  run_inference.py reads columns like "Clim_Rainfall", "Clim_MaxTemp",
  "Peak_Rain_Week" directly from merged_climate_data.csv — but these columns
  were NEVER SAVED to that file. They only existed temporarily inside the
  training scripts (rainfall_bhadali.py, temperature_model.py)
  during training and were discarded afterward.

  At inference time, run_inference.py's fallback logic silently defaults
  these to WRONG placeholder values:
    Clim_Rainfall   -> 0.0   (should be ~8-15mm for Ahmedabad in June)
    Clim_MaxTemp    -> 35.0  (placeholder, not the real local average)
    Clim_MinTemp    -> 22.0  (placeholder)
    Peak_Rain_Week  -> 28    (placeholder, not location-specific)

  This causes a TRAIN/INFERENCE MISMATCH: the model was trained on real
  climatology signals but receives fake ones at prediction time — directly
  causing the 7°C temperature error and 244mm rainfall over-prediction
  you observed.

THE FIX:
  Compute ALL climatology features ONCE from the full 75-year history,
  save them to climatology_lookup.csv (one row per Lat/Lon/Month, and a
  second table per Lat/Lon/Week), then have run_inference.py load and
  JOIN this table instead of reading non-existent CSV columns.

HOW TO RUN:
  py build_climatology_table.py
  (Run this ONCE after merged_climate_data.csv is finalized. Re-run only
  if you regenerate merged_climate_data.csv.)

OUTPUT:
  climatology_monthly.csv  — Lat, Lon, Month -> Clim_MaxTemp, Clim_MinTemp,
                              Clim_Rainfall, Clim_Rain_Prob, Clim_Humidity_Proxy
  climatology_weekly.csv   — Lat, Lon, Week  -> Clim_Rainfall_Week,
                              Clim_Rain_Prob_Week
  peak_rain_week.csv       — Lat, Lon -> Peak_Rain_Week (location-specific!)
  dry_season_prob.csv      — Lat, Lon, Month -> Dry_Season_Prob
================================================================================
"""

import pandas as pd
# pyrefly: ignore [missing-import]
import numpy as np
import warnings

warnings.filterwarnings("ignore")

MERGED_CSV = "merged_climate_data.csv"

print("=" * 65)
print("BUILDING CLIMATOLOGY LOOKUP TABLES (one-time, ~75 years of data)")
print("=" * 65)

print("\nStep 1: Loading merged_climate_data.csv...")
df = pd.read_csv(MERGED_CSV)
df["Date"] = pd.to_datetime(df["Date"], format="mixed", dayfirst=True)
df["Rainfall"] = df["Rainfall"].fillna(0)
print(f"  Loaded {len(df):,} rows")

df["Week"] = df["Date"].dt.isocalendar().week.astype(int)
df["Humidity_Proxy"] = (100.0 - 5.0 * df["Diurnal_Range"]).clip(10.0, 100.0)

# =============================================================================
# MONTHLY CLIMATOLOGY (per Lat, Lon, Month)
# =============================================================================
print("\nStep 2: Computing monthly climatology per grid cell...")

monthly = df.groupby(["Latitude", "Longitude", "Month"]).agg(
    Clim_MaxTemp        = ("Max_Temp",      "mean"),
    Clim_MinTemp         = ("Min_Temp",      "mean"),
    Clim_Max_Temp        = ("Max_Temp",      "mean"),   # alias used by inference script
    Clim_Min_Temp         = ("Min_Temp",      "mean"),   # alias used by inference script
    Clim_Rainfall        = ("Rainfall",      "mean"),
    Clim_Humidity_Proxy  = ("Humidity_Proxy","mean"),
).reset_index()

# Rain probability (separate agg because it needs a transform)
rain_prob = df.groupby(["Latitude","Longitude","Month"]).apply(
    lambda x: (x["Rainfall"] > 0.1).mean(), include_groups=False
).reset_index()
rain_prob.columns = ["Latitude","Longitude","Month","Clim_Rain_Prob"]

monthly = monthly.merge(rain_prob, on=["Latitude","Longitude","Month"], how="left")

for col in ["Clim_MaxTemp","Clim_MinTemp","Clim_Max_Temp","Clim_Min_Temp",
            "Clim_Rainfall","Clim_Humidity_Proxy","Clim_Rain_Prob"]:
    monthly[col] = monthly[col].round(3)

monthly.to_csv("climatology_monthly.csv", index=False)
print(f"  Saved climatology_monthly.csv ({len(monthly):,} rows)")
print(f"  Sample (Ahmedabad-ish 23.5N, 72.5E, June):")
sample = monthly[(monthly["Latitude"]==23.5)&(monthly["Longitude"]==72.5)&(monthly["Month"]==6)]
if len(sample) > 0:
    print(sample.to_string(index=False))
else:
    print("  (exact grid point not found - check nearest cell)")

# =============================================================================
# WEEKLY CLIMATOLOGY (per Lat, Lon, ISO Week) - finer resolution for monsoon onset
# =============================================================================
print("\nStep 3: Computing weekly climatology per grid cell...")

weekly = df.groupby(["Latitude", "Longitude", "Week"]).agg(
    Clim_Rainfall_Week = ("Rainfall", "mean"),
).reset_index()

rain_prob_week = df.groupby(["Latitude","Longitude","Week"]).apply(
    lambda x: (x["Rainfall"] > 0.1).mean(), include_groups=False
).reset_index()
rain_prob_week.columns = ["Latitude","Longitude","Week","Clim_Rain_Prob_Week"]

weekly = weekly.merge(rain_prob_week, on=["Latitude","Longitude","Week"], how="left")
weekly["Clim_Rainfall_Week"]   = weekly["Clim_Rainfall_Week"].round(3)
weekly["Clim_Rain_Prob_Week"]  = weekly["Clim_Rain_Prob_Week"].round(3)

weekly.to_csv("climatology_weekly.csv", index=False)
print(f"  Saved climatology_weekly.csv ({len(weekly):,} rows)")

# =============================================================================
# PEAK RAIN WEEK (per Lat, Lon) - location-specific monsoon peak timing
# =============================================================================
print("\nStep 4: Computing location-specific peak rain week...")

peak_week = weekly.loc[
    weekly.groupby(["Latitude","Longitude"])["Clim_Rainfall_Week"].idxmax(),
    ["Latitude","Longitude","Week"]
].copy()
peak_week.columns = ["Latitude","Longitude","Peak_Rain_Week"]
peak_week.to_csv("peak_rain_week.csv", index=False)
print(f"  Saved peak_rain_week.csv ({len(peak_week):,} rows)")
print(f"  Sample (Ahmedabad-ish): ", end="")
s = peak_week[(peak_week["Latitude"]==23.5)&(peak_week["Longitude"]==72.5)]
print(s.to_string(index=False) if len(s)>0 else "not found")

# =============================================================================
# DRY SEASON PROBABILITY (per Lat, Lon, Month)
# =============================================================================
print("\nStep 5: Computing dry season probability...")

dry_prob = df.groupby(["Latitude","Longitude","Month"]).apply(
    lambda x: (x["Rainfall"] == 0).mean(), include_groups=False
).reset_index()
dry_prob.columns = ["Latitude","Longitude","Month","Dry_Season_Prob"]
dry_prob["Dry_Season_Prob"] = dry_prob["Dry_Season_Prob"].round(3)
dry_prob.to_csv("dry_season_prob.csv", index=False)
print(f"  Saved dry_season_prob.csv ({len(dry_prob):,} rows)")

# =============================================================================
# VALIDATION — prove the fix works
# =============================================================================
print("\n" + "=" * 65)
print("VALIDATION — June 30 climatology for nearest grid to your test case")
print("=" * 65)

# Nearest grid point to lat=21.0, lon=79.0 (from your bug report)
test_lat, test_lon = 21.0, 79.0
coords = monthly[["Latitude","Longitude"]].drop_duplicates()
dist = (coords["Latitude"]-test_lat)**2 + (coords["Longitude"]-test_lon)**2
nearest = coords.loc[dist.idxmin()]
nlat, nlon = nearest["Latitude"], nearest["Longitude"]
print(f"  Nearest grid point to ({test_lat},{test_lon}): ({nlat},{nlon})")

june_clim = monthly[(monthly["Latitude"]==nlat)&(monthly["Longitude"]==nlon)&(monthly["Month"]==6)]
print(f"\n  June climatology at this grid point:")
print(june_clim.to_string(index=False))
print(f"\n  BEFORE FIX: Clim_Rainfall was defaulting to 0.00mm (WRONG)")
if len(june_clim) > 0:
    real_val = june_clim["Clim_Rainfall"].values[0]
    print(f"  AFTER FIX:  Clim_Rainfall = {real_val:.2f}mm (REAL 75-year average)")

print("\n" + "=" * 65)
print("DONE! Now update run_inference.py to load these 4 CSVs and JOIN")
print("instead of reading non-existent columns from merged_climate_data.csv")
print("=" * 65)