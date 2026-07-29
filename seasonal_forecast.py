"""
================================================================================
SEASONAL MONSOON FORECASTING & ONSET/WITHDRAWAL MODULE
================================================================================
Predicts JJAS (June–September) monsoon seasonal rainfall total, onset date,
and withdrawal date per grid cell across India using pre-monsoon ocean-atmospheric
drivers (March–May ONI & DMI), static geography, and climate anomalies.

Features & Outputs:
  1. Historical JJAS Seasonal Accumulation & Onset/Withdrawal calculation (1951–2025).
  2. Machine Learning Seasonal Regressor for total monsoon rainfall.
  3. Grid-wise Monsoon Onset Date (DOY after June 1 with sustained rainfall).
  4. Grid-wise Monsoon Withdrawal Date (DOY in Sept/Oct with precipitation cessation).
  5. Outputs: seasonal_predictions_2026.csv & seasonal_metrics.json.

Usage:
  py seasonal_forecast.py
================================================================================
"""

import pandas as pd
import numpy as np
import lightgbm as lgb
import json
import os
import time
import warnings
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

warnings.filterwarnings("ignore")

MERGED_CSV = "merged_climate_data_v2.csv"
OUTPUT_CSV = "seasonal_predictions_2026.csv"
METRICS_JSON = "seasonal_metrics.json"

print("=" * 65)
print("SEASONAL MONSOON FORECASTING & ONSET/WITHDRAWAL MODULE")
print("=" * 65)

# =============================================================================
# STEP 1: CALCULATE HISTORICAL JJAS ACCUMULATIONS & ONSET/WITHDRAWAL
# =============================================================================
print("\nStep 1: Loading data and computing seasonal targets (1951–2025)...")
t0 = time.time()

dtypes = {
    "Year": "int16", "Month": "int8", "Day": "int8",
    "Latitude": "float32", "Longitude": "float32",
    "Rainfall": "float32", "Max_Temp": "float32", "Min_Temp": "float32",
    "ONI": "float32", "DMI": "float32", "Elevation_m": "float32", "Dist_Coast_km": "float32"
}
use_cols = list(dtypes.keys()) + ["Date"]
df = pd.read_csv(MERGED_CSV, parse_dates=["Date"], dtype=dtypes, usecols=use_cols)
df["Rainfall"] = df["Rainfall"].fillna(0.0)
df["DOY"] = df["Date"].dt.dayofyear.astype(np.int16)

print(f"  Loaded {len(df):,} rows in {time.time()-t0:.1f}s")

# Extract Pre-Monsoon (MAM: Mar, Apr, May) features per Year & Grid cell
print("  Computing Pre-Monsoon (MAM) predictor features...")
mam_df = df[df["Month"].isin([3, 4, 5])].groupby(["Latitude", "Longitude", "Year"]).agg(
    PreMonsoon_Rain=("Rainfall", "sum"),
    PreMonsoon_Tmax=("Max_Temp", "mean"),
    MAM_ONI=("ONI", "mean"),
    MAM_DMI=("DMI", "mean"),
    Elevation_m=("Elevation_m", "first"),
    Dist_Coast_km=("Dist_Coast_km", "first")
).reset_index()

# Compute JJAS Seasonal Rainfall Total
jjas_df = df[df["Month"].isin([6, 7, 8, 9])].groupby(["Latitude", "Longitude", "Year"]).agg(
    JJAS_Rainfall=("Rainfall", "sum")
).reset_index()

# Vectorized Onset and Withdrawal DOY computation per cell-year
print("  Calculating grid-wise monsoon onset and withdrawal dates...")
df = df.sort_values(["Latitude", "Longitude", "Date"]).reset_index(drop=True)
grp = df.groupby(["Latitude", "Longitude"])
df["roll5"] = grp["Rainfall"].transform(lambda x: x.rolling(5, min_periods=1).sum()).astype(np.float32)

# Onset mask: DOY >= 152 and roll5 >= 20.0
onset_df = df[(df["DOY"] >= 152) & (df["roll5"] >= 20.0)].groupby(["Latitude", "Longitude", "Year"])["DOY"].min().reset_index()
onset_df.columns = ["Latitude", "Longitude", "Year", "Onset_DOY"]

# Withdrawal mask: 244 <= DOY <= 288 and roll5 >= 10.0
withdr_df = df[(df["DOY"] >= 244) & (df["DOY"] <= 288) & (df["roll5"] >= 10.0)].groupby(["Latitude", "Longitude", "Year"])["DOY"].max().reset_index()
withdr_df.columns = ["Latitude", "Longitude", "Year", "Withdrawal_DOY"]

del df

# Merge into seasonal training table
seasonal_table = mam_df.merge(jjas_df, on=["Latitude", "Longitude", "Year"], how="inner")
seasonal_table = seasonal_table.merge(onset_df, on=["Latitude", "Longitude", "Year"], how="left")
seasonal_table = seasonal_table.merge(withdr_df, on=["Latitude", "Longitude", "Year"], how="left")

seasonal_table["Onset_DOY"] = seasonal_table["Onset_DOY"].fillna(165.0)
seasonal_table["Withdrawal_DOY"] = seasonal_table["Withdrawal_DOY"].fillna(273.0)

print(f"  Seasonal dataset built: {len(seasonal_table):,} cell-years")

# =============================================================================
# STEP 2: MODEL TRAINING & EVALUATION
# =============================================================================
print("\nStep 2: Training LightGBM Seasonal Regressor...")

FEATURE_COLS = [
    "Latitude", "Longitude", "Elevation_m", "Dist_Coast_km",
    "PreMonsoon_Rain", "PreMonsoon_Tmax", "MAM_ONI", "MAM_DMI"
]

train_mask = seasonal_table["Year"] <= 2018
val_mask   = (seasonal_table["Year"] >= 2019) & (seasonal_table["Year"] <= 2021)
test_mask  = seasonal_table["Year"] >= 2022

X_tr = seasonal_table.loc[train_mask, FEATURE_COLS]
y_tr = seasonal_table.loc[train_mask, "JJAS_Rainfall"]

X_te = seasonal_table.loc[test_mask, FEATURE_COLS]
y_te = seasonal_table.loc[test_mask, "JJAS_Rainfall"]

model_jjas = lgb.LGBMRegressor(
    objective="regression", n_estimators=500, learning_rate=0.03,
    max_depth=6, subsample=0.8, colsample_bytree=0.8, n_jobs=-1, random_state=42, verbose=-1
)
model_jjas.fit(X_tr, y_tr)

preds_jjas = model_jjas.predict(X_te)
mae_jjas = mean_absolute_error(y_te, preds_jjas)
rmse_jjas = np.sqrt(mean_squared_error(y_te, preds_jjas))
r2_jjas = r2_score(y_te, preds_jjas)

print(f"  JJAS Seasonal Total Prediction Skills (Test Set 2022-2025):")
print(f"    MAE  : {mae_jjas:.1f} mm")
print(f"    RMSE : {rmse_jjas:.1f} mm")
print(f"    R²   : {r2_jjas:.4f} ({r2_jjas*100:.1f}%)")

# Onset & Withdrawal Models
print("  Training Onset & Withdrawal Regressors...")
model_onset = lgb.LGBMRegressor(objective="regression", n_estimators=300, learning_rate=0.03, max_depth=5, n_jobs=-1, random_state=42, verbose=-1)
model_onset.fit(X_tr, seasonal_table.loc[train_mask, "Onset_DOY"])

model_withdr = lgb.LGBMRegressor(objective="regression", n_estimators=300, learning_rate=0.03, max_depth=5, n_jobs=-1, random_state=42, verbose=-1)
model_withdr.fit(X_tr, seasonal_table.loc[train_mask, "Withdrawal_DOY"])

# Save Metrics
metrics = {
    "JJAS_Seasonal_Rainfall": {"MAE_mm": round(mae_jjas, 2), "RMSE_mm": round(rmse_jjas, 2), "R2": round(r2_jjas, 4)},
    "Onset_Date_MAE_days": round(mean_absolute_error(seasonal_table.loc[test_mask, "Onset_DOY"], model_onset.predict(X_te)), 1),
    "Withdrawal_Date_MAE_days": round(mean_absolute_error(seasonal_table.loc[test_mask, "Withdrawal_DOY"], model_withdr.predict(X_te)), 1)
}

with open(METRICS_JSON, "w", encoding="utf-8") as f:
    json.dump(metrics, f, indent=2)
print(f"  Saved {METRICS_JSON}")

# =============================================================================
# STEP 3: GENERATE 2026 MONSOON SEASONAL FORECAST
# =============================================================================
print("\nStep 3: Generating 2026 Seasonal Monsoon Forecast for all 362 grid cells...")

unique_grid = seasonal_table[["Latitude", "Longitude", "Elevation_m", "Dist_Coast_km"]].drop_duplicates().reset_index(drop=True)

# 2026 Pre-Monsoon Proxy / Latest Conditions (e.g. MAM 2025/2026 ONI = 0.2, DMI = 0.1)
unique_grid["PreMonsoon_Rain"] = 80.0   # average pre-monsoon shower
unique_grid["PreMonsoon_Tmax"] = 38.5
unique_grid["MAM_ONI"] = 0.2           # Neutral-ENSO forecast
unique_grid["MAM_DMI"] = 0.15          # Slightly positive IOD

pred_2026_jjas = model_jjas.predict(unique_grid[FEATURE_COLS])
pred_2026_onset = model_onset.predict(unique_grid[FEATURE_COLS])
pred_2026_withdr = model_withdr.predict(unique_grid[FEATURE_COLS])

forecast_2026 = unique_grid[["Latitude", "Longitude"]].copy()
forecast_2026["Predicted_JJAS_Rain_mm"] = np.round(pred_2026_jjas, 1)
forecast_2026["Predicted_Onset_DOY"] = np.round(pred_2026_onset).astype(int)
forecast_2026["Predicted_Withdrawal_DOY"] = np.round(pred_2026_withdr).astype(int)

# Format DOY into readable dates
def doy_to_date_str(year, doy):
    return (pd.Timestamp(f"{year}-01-01") + pd.Timedelta(days=int(doy)-1)).strftime("%b %d")

forecast_2026["Onset_Date"] = forecast_2026["Predicted_Onset_DOY"].apply(lambda d: doy_to_date_str(2026, d))
forecast_2026["Withdrawal_Date"] = forecast_2026["Predicted_Withdrawal_DOY"].apply(lambda d: doy_to_date_str(2026, d))

forecast_2026.to_csv(OUTPUT_CSV, index=False)
print(f"  Saved 2026 Seasonal Forecast to {OUTPUT_CSV} ({len(forecast_2026)} grid cells)")

print("\n" + "=" * 65)
print("ALL DONE! Seasonal Monsoon Module Ready.")
print("=" * 65)

if __name__ == "__main__":
    pass
