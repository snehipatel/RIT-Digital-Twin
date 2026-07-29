"""
================================================================================
CLIMATOLOGICAL NORMALS (1991-2020), ANOMALIES & SPI ENGINE
================================================================================
Computes standard 30-year climatological normals (1991–2020 base period)
per grid cell per day-of-year.

Calculates:
  1. 1991-2020 Climatological Normals (Mean & Standard Deviation for Tmax, Tmin, Rainfall).
  2. Daily Anomalies:
     - Rainfall_Anomaly = Rainfall - Normal_Rainfall
     - Tmax_Anomaly = Max_Temp - Normal_Tmax
     - Tmin_Anomaly = Min_Temp - Normal_Tmin
  3. Standardized Precipitation Index (SPI-1 month and SPI-3 month) using Gamma distribution.

Outputs:
  - climatology_normals_1991_2020.csv
  - climate_anomalies_daily.csv

Usage:
  py compute_anomalies.py
================================================================================
"""

import pandas as pd
import numpy as np
import scipy.stats as stats
import os
import time
import warnings

warnings.filterwarnings("ignore")

MERGED_CSV = "merged_climate_data_v2.csv"
NORMALS_CSV = "climatology_normals_1991_2020.csv"
ANOMALIES_CSV = "climate_anomalies_daily.csv"

print("=" * 65)
print("CLIMATOLOGICAL NORMALS (1991-2020) & SPI CALCULATOR")
print("=" * 65)

# 1. Load Data
print("\nStep 1: Loading climate data...")
t0 = time.time()
dtypes = {
    "Year": "int16", "Month": "int8", "Day": "int8",
    "Latitude": "float32", "Longitude": "float32",
    "Max_Temp": "float32", "Min_Temp": "float32", "Rainfall": "float32"
}
df = pd.read_csv(MERGED_CSV, parse_dates=["Date"], dtype=dtypes)
df["Rainfall"] = df["Rainfall"].fillna(0.0)
df["DOY"] = df["Date"].dt.dayofyear.astype(np.int16)
print(f"  Loaded {len(df):,} rows in {time.time()-t0:.1f}s")

# 2. Compute 1991-2020 Normals
print("\nStep 2: Computing 1991–2020 base period daily normals per grid cell...")
base_mask = (df["Year"] >= 1991) & (df["Year"] <= 2020)
base_df = df[base_mask]

normals = base_df.groupby(["Latitude", "Longitude", "DOY"]).agg(
    Normal_Tmax=("Max_Temp", "mean"),
    Std_Tmax=("Max_Temp", "std"),
    Normal_Tmin=("Min_Temp", "mean"),
    Std_Tmin=("Min_Temp", "std"),
    Normal_Rainfall=("Rainfall", "mean"),
    Std_Rainfall=("Rainfall", "std")
).reset_index()

# Smooth normals with 7-day rolling filter to avoid day-to-day noise
normals = normals.sort_values(["Latitude", "Longitude", "DOY"]).reset_index(drop=True)
grp = normals.groupby(["Latitude", "Longitude"])
for col in ["Normal_Tmax", "Normal_Tmin", "Normal_Rainfall"]:
    normals[col] = grp[col].transform(lambda x: x.rolling(7, min_periods=1, center=True).mean()).round(3)

normals.to_csv(NORMALS_CSV, index=False)
print(f"  Saved {len(normals):,} normals rows to {NORMALS_CSV}")

# 3. SPI (Standardized Precipitation Index) Computation Helper
print("\nStep 3: Calculating SPI (Standardized Precipitation Index)...")

def fit_spi(rain_series):
    """
    Fits Gamma distribution to precipitation series and transforms to SPI z-scores.
    Handles zero-precipitation probability (p0).
    """
    rain_series = np.asarray(rain_series, dtype=float)
    n = len(rain_series)
    if n < 30:
        return np.zeros(n)

    zeros = (rain_series <= 0.001)
    q = np.mean(zeros)

    if q >= 0.99:
        return np.zeros(n)

    pos_rain = rain_series[~zeros]
    if len(pos_rain) < 10:
        return np.zeros(n)

    # Fit Gamma distribution via MLE
    mean_p = np.mean(pos_rain)
    log_mean = np.log(mean_p)
    mean_log = np.mean(np.log(pos_rain))
    A = log_mean - mean_log

    if A <= 0:
        alpha = 1.0
    else:
        alpha = (1.0 + np.sqrt(1.0 + 4.0 * A / 3.0)) / (4.0 * A)
    beta = mean_p / alpha

    # CDF computation
    cdf = np.zeros(n)
    pos_cdf = stats.gamma.cdf(pos_rain, a=alpha, scale=beta)
    cdf[~zeros] = q + (1.0 - q) * pos_cdf
    cdf[zeros] = q / 2.0  # smooth zero boundary

    # Clip to avoid infinity in norm.ppf
    cdf = np.clip(cdf, 0.0001, 0.9999)
    spi = stats.norm.ppf(cdf)
    return np.clip(spi, -3.5, 3.5)

# Calculate 30-day and 90-day accumulated rainfall for SPI
print("  Computing rolling 30-day (SPI-1) and 90-day (SPI-3) rainfall accumulations...")
df = df.merge(normals[["Latitude", "Longitude", "DOY", "Normal_Tmax", "Normal_Tmin", "Normal_Rainfall"]], on=["Latitude", "Longitude", "DOY"], how="left")

df["Tmax_Anomaly"] = (df["Max_Temp"] - df["Normal_Tmax"]).astype(np.float32).round(2)
df["Tmin_Anomaly"] = (df["Min_Temp"] - df["Normal_Tmin"]).astype(np.float32).round(2)
df["Rainfall_Anomaly"] = (df["Rainfall"] - df["Normal_Rainfall"]).astype(np.float32).round(2)

print("  Processing grid-wise SPI z-scores...")
df = df.sort_values(["Latitude", "Longitude", "Date"]).reset_index(drop=True)
grp = df.groupby(["Latitude", "Longitude"])

df["R30"] = grp["Rainfall"].transform(lambda x: x.rolling(30, min_periods=15).sum()).fillna(0.0).astype(np.float32)
df["R90"] = grp["Rainfall"].transform(lambda x: x.rolling(90, min_periods=45).sum()).fillna(0.0).astype(np.float32)

# Apply SPI per grid cell efficiently
unique_grids = df[["Latitude", "Longitude"]].drop_duplicates().values
spi1_arr = np.zeros(len(df), dtype=np.float32)
spi3_arr = np.zeros(len(df), dtype=np.float32)

# Compute SPI for each grid cell
for lat, lon in unique_grids:
    mask = (df["Latitude"] == lat) & (df["Longitude"] == lon)
    indices = df.index[mask]
    r30_sub = df.loc[indices, "R30"].values
    r90_sub = df.loc[indices, "R90"].values
    
    spi1_arr[indices] = fit_spi(r30_sub)
    spi3_arr[indices] = fit_spi(r90_sub)

df["SPI_1"] = np.round(spi1_arr, 2)
df["SPI_3"] = np.round(spi3_arr, 2)

out_cols = ["Date", "Latitude", "Longitude", "Rainfall_Anomaly", "Tmax_Anomaly", "Tmin_Anomaly", "SPI_1", "SPI_3"]
anomalies_df = df[out_cols].sort_values(["Date", "Latitude", "Longitude"]).reset_index(drop=True)
anomalies_df.to_csv(ANOMALIES_CSV, index=False, chunksize=200000)

print(f"  Saved {len(anomalies_df):,} daily anomaly rows to {ANOMALIES_CSV}")

print("\n" + "=" * 65)
print("ALL DONE! Climatological Normals & SPI Module Completed.")
print("=" * 65)

if __name__ == "__main__":
    pass
