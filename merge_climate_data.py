"""
Climate Data Merger for AI-Powered Digital Twin of India's Climate
===================================================================
Merges IMD gridded data (Max Temp, Min Temp, Rainfall) into a single
ML-ready CSV by spatially and temporally aligning all three datasets.

Directory Structure Expected:
    data/
        max_temp/   -> Maxtemp_MaxT_1951.csv, Maxtemp_MaxT_1952.csv, ...
        min_temp/   -> Mintemp_MinT_1951.csv, Mintemp_MinT_1952.csv, ...
        rainfall/   -> Rainfall_1901.csv, Rainfall_1902.csv, ...

Output:
    merged_climate_data.csv
        Columns: Date, Year, Month, Day, Season,
                 Latitude, Longitude,
                 Max_Temp, Min_Temp, Diurnal_Range, Rainfall

KEY FIXES (v2):
  - Rainfall coords snapped to nearest 0.5 (temp grid is at .5 centres:
    8.5, 9.5, 10.5 ...) using floor(x) + 0.5, NOT round-to-integer.
  - Date normalisation hardened: tries YYYY-MM-DD then DD-MM-YYYY then
    pandas infer — so both MaxTemp and MinTemp/Rainfall formats work.
  - Merge uses string date key to avoid any hidden timezone/dtype edge cases.
"""

import pandas as pd
import numpy as np
import os
import glob
import time
import logging
from pathlib import Path

# ── Configuration ──────────────────────────────────────────────────────────────
START_YEAR   = 1951
END_YEAR     = 2025
MAX_TEMP_DIR = "data/max_temp"
MIN_TEMP_DIR = "data/min_temp"
RAINFALL_DIR = "data/rainfall"
OUTPUT_FILE  = "merged_climate_data.csv"
# ──────────────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


def normalize_date(series: pd.Series) -> pd.Series:
    """
    Robustly parses dates in either YYYY-MM-DD or DD-MM-YYYY format.
    Returns a datetime64 Series.
    """
    # Pass 1: ISO format
    out = pd.to_datetime(series, errors="coerce", format="%Y-%m-%d")
    bad = out.isna()

    # Pass 2: DD-MM-YYYY (MinTemp and Rainfall files use this)
    if bad.any():
        out[bad] = pd.to_datetime(series[bad], errors="coerce", format="%d-%m-%Y")
        bad = out.isna()

    # Pass 3: let pandas infer (catches anything else)
    if bad.any():
        out[bad] = pd.to_datetime(series[bad], errors="coerce", infer_datetime_format=True)
        bad = out.isna()

    if bad.sum():
        log.warning(f"  {bad.sum()} unparseable date rows — will be dropped.")
    return out


def snap_to_temp_grid(coord: pd.Series) -> pd.Series:
    """
    Snap any coordinate to the nearest IMD temperature grid point.
    Temp grid is at half-degree centres: 8.5, 9.5, 10.5, ...
    Formula: floor(x) + 0.5
    This correctly maps 0.25-degree rainfall coords:
        8.25 -> 8.5,  8.75 -> 8.5,  9.0 -> 9.5,  9.25 -> 9.5, etc.
    """
    return np.floor(coord.astype(float)) + 0.5


def load_yearly_files(directory: str, value_col: str,
                      start_year: int, end_year: int) -> pd.DataFrame:
    """
    Load all per-year CSVs from a directory and concatenate them.
    Auto-detects the value column if the expected name isn't found.
    """
    directory = Path(directory)
    if not directory.exists():
        raise FileNotFoundError(f"Directory not found: {directory}")

    frames = []
    missing = []

    for year in range(start_year, end_year + 1):
        matches = list(directory.glob(f"*{year}*.csv"))
        if not matches:
            missing.append(year)
            continue
        try:
            df = pd.read_csv(matches[0])
            df.columns = df.columns.str.strip()

            # Auto-detect value column
            if value_col not in df.columns:
                candidates = [c for c in df.columns
                              if c.lower() not in ("date", "latitude", "longitude")]
                if len(candidates) == 1:
                    df.rename(columns={candidates[0]: value_col}, inplace=True)
                else:
                    log.warning(f"  Cannot identify '{value_col}' in {matches[0].name} — skipping.")
                    continue

            frames.append(df[["Date", "Latitude", "Longitude", value_col]])

        except Exception as e:
            log.error(f"  Error reading {matches[0].name}: {e}")

    if missing:
        log.warning(f"  Years not found in {directory.name}: {missing}")
    if not frames:
        raise ValueError(f"No data loaded from {directory}")

    log.info(f"  Loaded {len(frames)} yearly files from '{directory.name}'")
    combined = pd.concat(frames, ignore_index=True)

    # Normalise dates
    combined["Date"] = normalize_date(combined["Date"])
    combined.dropna(subset=["Date"], inplace=True)

    # Normalise coordinates (2 decimal places)
    combined["Latitude"]  = combined["Latitude"].astype(float).round(2)
    combined["Longitude"] = combined["Longitude"].astype(float).round(2)

    combined.drop_duplicates(subset=["Date", "Latitude", "Longitude"], inplace=True)
    return combined


def load_rainfall(directory: str, start_year: int, end_year: int) -> pd.DataFrame:
    """
    Load rainfall CSVs (0.25° grid) and aggregate to the 1° temperature grid.
    Grid snapping: snap coords to nearest .5-centred degree (floor + 0.5).
    Aggregation: sum rainfall within each 1° cell per day (physically correct).
    """
    df = load_yearly_files(directory, "Rainfall", start_year, end_year)

    log.info("  Snapping rainfall 0.25° coords → 1° temp grid (floor + 0.5)...")

    # Diagnostic: show a few before/after values
    sample_lat = df["Latitude"].head(8).tolist()
    snapped    = (np.floor(pd.Series(sample_lat)) + 0.5).tolist()
    log.info(f"  Sample Lat before snap : {sample_lat}")
    log.info(f"  Sample Lat after  snap : {snapped}")

    df["Latitude"]  = snap_to_temp_grid(df["Latitude"])
    df["Longitude"] = snap_to_temp_grid(df["Longitude"])

    # Aggregate: sum makes physical sense (total rain in 1° cell = sum of sub-cells)
    log.info("  Aggregating rainfall to 1° grid (sum per cell per day)...")
    df_agg = (
        df.groupby(["Date", "Latitude", "Longitude"], as_index=False)["Rainfall"]
        .sum()
    )
    df_agg["Rainfall"] = df_agg["Rainfall"].round(3)
    return df_agg


def add_derived_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add time features and derived climate indices."""
    df["Year"]  = df["Date"].dt.year
    df["Month"] = df["Date"].dt.month
    df["Day"]   = df["Date"].dt.day

    # Diurnal Temperature Range
    if {"Max_Temp", "Min_Temp"}.issubset(df.columns):
        df["Diurnal_Range"] = (df["Max_Temp"] - df["Min_Temp"]).round(3)

    season_map = {
        12: "Winter", 1: "Winter",  2: "Winter",
         3: "Pre-Monsoon", 4: "Pre-Monsoon", 5: "Pre-Monsoon",
         6: "Monsoon",     7: "Monsoon",     8: "Monsoon",    9: "Monsoon",
        10: "Post-Monsoon", 11: "Post-Monsoon",
    }
    df["Season"] = df["Month"].map(season_map)
    return df


def main():
    t0 = time.time()
    log.info("=" * 60)
    log.info("Climate Data Merger v2 — Starting")
    log.info(f"Year range: {START_YEAR}–{END_YEAR}")
    log.info("=" * 60)

    # ── Load ──────────────────────────────────────────────────────────────────
    log.info("[1/4] Loading Max Temperature data...")
    df_max = load_yearly_files(MAX_TEMP_DIR, "Max_Temp", START_YEAR, END_YEAR)
    log.info(f"      Rows: {len(df_max):,}")

    log.info("[2/4] Loading Min Temperature data...")
    df_min = load_yearly_files(MIN_TEMP_DIR, "Min_Temp", START_YEAR, END_YEAR)
    log.info(f"      Rows: {len(df_min):,}")

    log.info("[3/4] Loading Rainfall data...")
    df_rain = load_rainfall(RAINFALL_DIR, START_YEAR, END_YEAR)
    log.info(f"      Rows after snap+agg: {len(df_rain):,}")

    # ── Merge key: use string date to avoid any dtype edge cases ──────────────
    log.info("[4/4] Merging on [Date, Latitude, Longitude]...")
    for df in (df_max, df_min, df_rain):
        df["_date_key"] = df["Date"].dt.strftime("%Y-%m-%d")
        df["_lat_key"]  = df["Latitude"].round(1).astype(str)
        df["_lon_key"]  = df["Longitude"].round(1).astype(str)

    merge_keys = ["_date_key", "_lat_key", "_lon_key"]

    merged = pd.merge(df_max, df_min,  on=merge_keys, how="outer",
                      suffixes=("", "_min"))
    # Consolidate lat/lon columns that got duplicated
    for col in ("Date", "Latitude", "Longitude"):
        dup = col + "_min"
        if dup in merged.columns:
            merged[col] = merged[col].fillna(merged[dup])
            merged.drop(columns=[dup], inplace=True)
    log.info(f"  After Max+Min merge : {len(merged):,} rows")

    # Verify a rainfall sample matches before full merge
    sample_rain = df_rain.head(3)[["_date_key","_lat_key","_lon_key","Rainfall"]]
    log.info(f"  Rainfall key sample :\n{sample_rain.to_string(index=False)}")
    sample_temp = merged.head(3)[["_date_key","_lat_key","_lon_key","Max_Temp"]]
    log.info(f"  Temp key sample     :\n{sample_temp.to_string(index=False)}")

    merged = pd.merge(merged, df_rain[merge_keys + ["Rainfall"]],
                      on=merge_keys, how="left")
    log.info(f"  After adding Rainfall: {len(merged):,} rows")

    # Drop helper keys
    merged.drop(columns=merge_keys, inplace=True)

    # ── Derived features ──────────────────────────────────────────────────────
    merged = add_derived_features(merged)

    # ── Final ordering ────────────────────────────────────────────────────────
    merged.sort_values(["Date", "Latitude", "Longitude"], inplace=True)
    merged.reset_index(drop=True, inplace=True)

    col_order = ["Date", "Year", "Month", "Day", "Season",
                 "Latitude", "Longitude",
                 "Max_Temp", "Min_Temp", "Diurnal_Range", "Rainfall"]
    col_order = [c for c in col_order if c in merged.columns]
    merged = merged[col_order]

    # ── Quality Report ────────────────────────────────────────────────────────
    log.info("")
    log.info("── Data Quality Report ──────────────────────────────────")
    log.info(f"  Total rows      : {len(merged):,}")
    log.info(f"  Date range      : {merged['Date'].min().date()} → {merged['Date'].max().date()}")
    log.info(f"  Lat range       : {merged['Latitude'].min()} – {merged['Latitude'].max()}")
    log.info(f"  Lon range       : {merged['Longitude'].min()} – {merged['Longitude'].max()}")
    log.info(f"  Unique grid pts : {merged[['Latitude','Longitude']].drop_duplicates().shape[0]}")
    log.info("")
    log.info("  Missing values per column:")
    for col in ["Max_Temp", "Min_Temp", "Rainfall", "Diurnal_Range"]:
        if col in merged.columns:
            n   = merged[col].isna().sum()
            pct = 100 * n / len(merged)
            log.info(f"    {col:<18}: {n:>8,}  ({pct:.2f}%)")
    log.info("")
    log.info("  Non-null Rainfall sample (first 5 non-NaN rows):")
    log.info(merged[merged["Rainfall"].notna()][
        ["Date","Latitude","Longitude","Max_Temp","Min_Temp","Rainfall"]
    ].head(5).to_string(index=False))
    log.info("")

    # ── Save ──────────────────────────────────────────────────────────────────
    merged.to_csv(OUTPUT_FILE, index=False)
    size_mb = os.path.getsize(OUTPUT_FILE) / 1e6
    elapsed = time.time() - t0
    log.info(f"Saved → {OUTPUT_FILE}  ({size_mb:.1f} MB)")
    log.info(f"Total time: {elapsed:.1f}s")
    log.info("Done ✓")


if __name__ == "__main__":
    main()