"""
================================================================================
ETCCDI EXTREME CLIMATE INDICES COMPUTATION
================================================================================
Computes ETCCDI-standard extreme climate indices per grid cell across all
available years (1951–2025) from merged_climate_data.csv.

Indices computed:
  RAINFALL-BASED (from 1.0° aggregated rainfall):
    - R95p:  Annual total rainfall from days > 95th percentile (wet days)
    - CDD:   Maximum consecutive dry days (Rainfall < 1mm) per year
    - CWD:   Maximum consecutive wet days (Rainfall >= 1mm) per year
    - R10mm: Annual count of days with Rainfall >= 10mm
    - R20mm: Annual count of days with Rainfall >= 20mm
    - SDII:  Simple daily intensity index (mean rainfall on wet days)

  TEMPERATURE-BASED (from 1.0° temperature data):
    - WSDI:  Warm Spell Duration Index (>=6 consecutive days Tmax > 90th pctl)
    - CSDI:  Cold Spell Duration Index (>=6 consecutive days Tmin < 10th pctl)
    - TXx:   Annual maximum of daily maximum temperature
    - TNn:   Annual minimum of daily minimum temperature

All indices are at 1.0° resolution (matching IMD temperature grid).
Rainfall is pre-aggregated to 1.0° via snap_to_temp_grid in merge_climate_data.py.

Output: etccdi_indices.csv  (Year × Lat × Lon × all indices)

Usage:
  py compute_etccdi.py
================================================================================
"""

import pandas as pd
import numpy as np
import warnings
import time

warnings.filterwarnings("ignore")

MERGED_CSV = "merged_climate_data.csv"  # Use original for historical computation
OUTPUT_CSV = "etccdi_indices.csv"

print("=" * 65)
print("ETCCDI EXTREME CLIMATE INDICES COMPUTATION")
print("=" * 65)

# =============================================================================
# STEP 1: LOAD DATA
# =============================================================================
print("\nStep 1: Loading climate data...")
t0 = time.time()

dtypes = {
    "Year": "int16", "Month": "int8", "Day": "int8",
    "Latitude": "float32", "Longitude": "float32",
    "Max_Temp": "float32", "Min_Temp": "float32",
    "Rainfall": "float32"
}
df = pd.read_csv(MERGED_CSV, usecols=list(dtypes.keys()) + ["Date"], dtype=dtypes)
df["Date"] = pd.to_datetime(df["Date"], format="mixed", dayfirst=True)
df["Rainfall"] = df["Rainfall"].fillna(0.0)
df = df.sort_values(["Latitude", "Longitude", "Date"]).reset_index(drop=True)

print(f"  Loaded {len(df):,} rows in {time.time()-t0:.1f}s")
print(f"  Year range: {df['Year'].min()} – {df['Year'].max()}")
print(f"  Grid cells: {df[['Latitude','Longitude']].drop_duplicates().shape[0]}")

# =============================================================================
# STEP 2: COMPUTE PERCENTILE THRESHOLDS (base period 1991–2020)
# =============================================================================
print("\nStep 2: Computing base-period percentile thresholds (1991–2020)...")

base = df[(df["Year"] >= 1991) & (df["Year"] <= 2020)]

# 95th percentile of rainfall on wet days (>= 1mm), per grid cell
wet_base = base[base["Rainfall"] >= 1.0]
r95_thresh = wet_base.groupby(["Latitude", "Longitude"])["Rainfall"].quantile(0.95).reset_index()
r95_thresh.columns = ["Latitude", "Longitude", "R95_Threshold"]

# 90th percentile of Tmax per grid cell per day-of-year (for WSDI)
# Use calendar day to avoid leap-year issues
base["DOY"] = base["Date"].dt.dayofyear
tmax90 = base.groupby(["Latitude", "Longitude", "DOY"])["Max_Temp"].quantile(0.90).reset_index()
tmax90.columns = ["Latitude", "Longitude", "DOY", "Tmax_90th"]

# 10th percentile of Tmin per grid cell per day-of-year (for CSDI)
tmin10 = base.groupby(["Latitude", "Longitude", "DOY"])["Min_Temp"].quantile(0.10).reset_index()
tmin10.columns = ["Latitude", "Longitude", "DOY", "Tmin_10th"]

print(f"  R95 thresholds: {len(r95_thresh)} grid cells")
print(f"  Tmax 90th pctl: {len(tmax90)} (cell × DOY) entries")
print(f"  Tmin 10th pctl: {len(tmin10)} (cell × DOY) entries")

# =============================================================================
# STEP 3: COMPUTE INDICES PER GRID CELL PER YEAR
# =============================================================================
print("\nStep 3: Computing ETCCDI indices per grid cell per year...")
print("  (This takes ~2-5 minutes for 362 cells × 75 years...)")

df["DOY"] = df["Date"].dt.dayofyear

# Merge thresholds
df = df.merge(r95_thresh, on=["Latitude", "Longitude"], how="left")
df["R95_Threshold"] = df["R95_Threshold"].fillna(50.0)  # fallback

df = df.merge(tmax90, on=["Latitude", "Longitude", "DOY"], how="left")
df = df.merge(tmin10, on=["Latitude", "Longitude", "DOY"], how="left")

# Fill missing thresholds with reasonable defaults
df["Tmax_90th"] = df["Tmax_90th"].fillna(df["Max_Temp"] + 5.0)
df["Tmin_10th"] = df["Tmin_10th"].fillna(df["Min_Temp"] - 5.0)

# Binary flags
df["is_wet"] = (df["Rainfall"] >= 1.0).astype(int)
df["is_dry"] = (df["Rainfall"] < 1.0).astype(int)
df["is_r95"] = (df["Rainfall"] > df["R95_Threshold"]).astype(int) & df["is_wet"]
df["is_r10"] = (df["Rainfall"] >= 10.0).astype(int)
df["is_r20"] = (df["Rainfall"] >= 20.0).astype(int)
df["is_warm"] = (df["Max_Temp"] > df["Tmax_90th"]).astype(int)
df["is_cold"] = (df["Min_Temp"] < df["Tmin_10th"]).astype(int)


def max_consecutive(arr):
    """Maximum consecutive 1s in a binary 1D array."""
    if len(arr) == 0 or np.sum(arr) == 0:
        return 0
    padded = np.concatenate(([0], arr, [0]))
    diffs = np.diff(padded)
    starts = np.where(diffs == 1)[0]
    ends = np.where(diffs == -1)[0]
    lengths = ends - starts
    return int(np.max(lengths)) if len(lengths) > 0 else 0


def spell_duration_index(arr, min_length=6):
    """Count total days in spells of length >= min_length."""
    if len(arr) == 0 or np.sum(arr) == 0:
        return 0
    padded = np.concatenate(([0], arr, [0]))
    diffs = np.diff(padded)
    starts = np.where(diffs == 1)[0]
    ends = np.where(diffs == -1)[0]
    lengths = ends - starts
    valid_lengths = lengths[lengths >= min_length]
    return int(np.sum(valid_lengths)) if len(valid_lengths) > 0 else 0


results = []
groups = df.groupby(["Latitude", "Longitude", "Year"])
n_groups = len(groups)
processed = 0

for (lat, lon, year), gdf in groups:
    n = len(gdf)

    # Rainfall indices
    wet_days = gdf[gdf["is_wet"] == 1]
    r95p = float(gdf.loc[gdf["is_r95"] == 1, "Rainfall"].sum()) if gdf["is_r95"].sum() > 0 else 0.0
    cdd = max_consecutive(gdf["is_dry"].values)
    cwd = max_consecutive(gdf["is_wet"].values)
    r10mm = int(gdf["is_r10"].sum())
    r20mm = int(gdf["is_r20"].sum())
    sdii = float(wet_days["Rainfall"].mean()) if len(wet_days) > 0 else 0.0

    # Temperature indices
    txx = float(gdf["Max_Temp"].max()) if gdf["Max_Temp"].notna().any() else np.nan
    tnn = float(gdf["Min_Temp"].min()) if gdf["Min_Temp"].notna().any() else np.nan
    wsdi = spell_duration_index(gdf["is_warm"].values, min_length=6)
    csdi = spell_duration_index(gdf["is_cold"].values, min_length=6)

    results.append({
        "Latitude": lat, "Longitude": lon, "Year": year,
        "R95p": round(r95p, 2),
        "CDD": cdd,
        "CWD": cwd,
        "R10mm": r10mm,
        "R20mm": r20mm,
        "SDII": round(sdii, 2),
        "TXx": round(txx, 2) if not np.isnan(txx) else np.nan,
        "TNn": round(tnn, 2) if not np.isnan(tnn) else np.nan,
        "WSDI": wsdi,
        "CSDI": csdi,
    })

    processed += 1
    if processed % 5000 == 0:
        print(f"    Processed {processed:,}/{n_groups:,} cell-years...")

df_indices = pd.DataFrame(results)

# =============================================================================
# STEP 4: SAVE OUTPUT
# =============================================================================
print(f"\nStep 4: Saving {OUTPUT_CSV}...")
df_indices.to_csv(OUTPUT_CSV, index=False)
print(f"  Saved {len(df_indices):,} rows to {OUTPUT_CSV}")

# Quality report
print("\n" + "=" * 65)
print("ETCCDI INDICES SUMMARY (across all grid cells and years)")
print("=" * 65)
for col in ["R95p", "CDD", "CWD", "R10mm", "R20mm", "SDII", "TXx", "TNn", "WSDI", "CSDI"]:
    vals = df_indices[col].dropna()
    print(f"  {col:8s}: mean={vals.mean():8.2f} | median={vals.median():8.2f} | "
          f"min={vals.min():8.2f} | max={vals.max():8.2f}")

# Year range confirmation
years = df_indices["Year"].unique()
print(f"\n  Years covered: {years.min()} – {years.max()} ({len(years)} years)")
print(f"  Grid cells: {df_indices[['Latitude','Longitude']].drop_duplicates().shape[0]}")
print(f"  Total rows: {len(df_indices):,}")

print("\n" + "=" * 65)
print("DONE! ETCCDI indices ready for trend analysis and dashboard.")
print("=" * 65)
