"""
================================================================================
  sample_prediction.json   ← Yashvi uses this to build UI while models train
  plots/                   ← folder with all evaluation graphs
================================================================================
"""

import pandas as pd
import numpy as np
import lightgbm as lgb
import pickle
import json
import os
import warnings
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import LabelEncoder

warnings.filterwarnings("ignore")

# ── Create plots folder ───────────────────────────────────────────────────────
os.makedirs("plots", exist_ok=True)

# =============================================================================
# STEP 1: LOAD DATA
# =============================================================================
print("=" * 60)
dtypes_climate = {
    "Year": "int16", "Month": "int8", "Day": "int8",
    "Season": "category", "Latitude": "float32", "Longitude": "float32",
    "Max_Temp": "float32", "Min_Temp": "float32", "Diurnal_Range": "float32",
    "Rainfall": "float32", "ONI": "float32", "DMI": "float32",
    "Elevation_m": "float32", "Dist_Coast_km": "float32", "Log_Dist_Coast": "float32",
    "ENSO_Phase": "int8", "IOD_Phase": "int8",
    "ONI_x_Monsoon": "float32", "DMI_x_Monsoon": "float32", "Elevation_x_Monsoon": "float32"
}
df = pd.read_csv("merged_climate_data_v2.csv", parse_dates=["Date"], dtype=dtypes_climate)  # Phase 1: driver-augmented dataset

print(f"  Total rows loaded : {len(df):,}")
print(f"  Columns           : {df.columns.tolist()}")
print(f"  Date range        : {df['Date'].min().date()} -> {df['Date'].max().date()}")
print(f"  Sample:\n{df.head(3)}")

# =============================================================================
# STEP 2: CLEAN DATA
# =============================================================================
print("\n" + "=" * 60)
print("STEP 2: Cleaning data...")
print("=" * 60)

# Fill missing rainfall with 0 (ocean/boundary grid points have no rainfall data)
df["Rainfall"] = df["Rainfall"].fillna(0)

# Drop rows where our TARGET columns (Max_Temp, Min_Temp) are missing
# We cannot train without a target value — these rows are useless
before = len(df)
df.dropna(subset=["Max_Temp", "Min_Temp"], inplace=True)
after = len(df)
print(f"  Dropped {before - after:,} rows with missing Max/Min Temp")
print(f"  Remaining rows: {after:,}")

# Remove physically impossible temperature values
# India's recorded range: -20°C to +51°C
df = df[(df["Max_Temp"] >= -20) & (df["Max_Temp"] <= 55)]
df = df[(df["Min_Temp"] >= -20) & (df["Min_Temp"] <= 45)]
# Max temp must be >= Min temp (basic sanity check)
df = df[df["Max_Temp"] >= df["Min_Temp"]]
print(f"  After sanity checks: {len(df):,} rows")

# =============================================================================
# STEP 3: FEATURE ENGINEERING
# =============================================================================
# This is the MOST important step.
# We create new columns that help the model understand patterns better.
# LightGBM cannot understand "January" or "Winter" as raw strings —
# we convert everything to numbers.
print("\n" + "=" * 60)
print("STEP 3: Feature Engineering...")
print("=" * 60)

# Sort by location and date — VERY important for lag features
df = df.sort_values(["Latitude", "Longitude", "Date"]).reset_index(drop=True)

# ── 3a. Encode Season as a number ────────────────────────────────────────────
# Winter=0, Pre-Monsoon=1, Monsoon=2, Post-Monsoon=3
season_map = {
    "Winter": 0,
    "Pre-Monsoon": 1,
    "Monsoon": 2,
    "Post-Monsoon": 3
}
df["Season_Code"] = df["Season"].map(season_map)

# ── 3b. Cyclical encoding for Month and Day ───────────────────────────────────
# Problem: Month 12 (December) and Month 1 (January) are actually close
# but numerically 12 and 1 are far apart. 
# Solution: encode as sine and cosine on a circle.
# This tells the model "December and January are neighbors"
df["Month_sin"] = np.sin(2 * np.pi * df["Month"] / 12)
df["Month_cos"] = np.cos(2 * np.pi * df["Month"] / 12)
df["Day_sin"]   = np.sin(2 * np.pi * df["Day"] / 365)
df["Day_cos"]   = np.cos(2 * np.pi * df["Day"] / 365)

# ── 3c. Day of Year (1-365) ───────────────────────────────────────────────────
df["DayOfYear"] = df["Date"].dt.dayofyear

# ── 3d. Lag Features ──────────────────────────────────────────────────────────
# "What was the temperature 1 day ago / 7 days ago at this same location?"
# This is the single most powerful feature for temperature prediction.
# We group by (Latitude, Longitude) so lag is within the same grid point.

print("  Creating lag features (this may take ~1-2 mins for 9.6M rows)...")

grp = df.groupby(["Latitude", "Longitude"])

# Yesterday's temperature
df["MaxTemp_lag1"]  = grp["Max_Temp"].shift(1)
df["MinTemp_lag1"]  = grp["Min_Temp"].shift(1)

# 3 days ago
df["MaxTemp_lag3"]  = grp["Max_Temp"].shift(3)
df["MinTemp_lag3"]  = grp["Min_Temp"].shift(3)

# 7 days ago (same day last week)
df["MaxTemp_lag7"]  = grp["Max_Temp"].shift(7)
df["MinTemp_lag7"]  = grp["Min_Temp"].shift(7)

# Yesterday's rainfall (affects today's temp — rain cools the surface)
df["Rainfall_lag1"] = grp["Rainfall"].shift(1)

# ── 3e. Rolling Mean Features ─────────────────────────────────────────────────
# "What is the average temperature over the past 7 / 30 days at this location?"
# Captures seasonal trends gradually.

print("  Creating rolling mean features...")

df["MaxTemp_roll7"]  = grp["Max_Temp"].transform(lambda x: x.shift(1).rolling(7,  min_periods=1).mean())
df["MaxTemp_roll30"] = grp["Max_Temp"].transform(lambda x: x.shift(1).rolling(30, min_periods=1).mean())
df["MinTemp_roll7"]  = grp["Min_Temp"].transform(lambda x: x.shift(1).rolling(7,  min_periods=1).mean())
df["MinTemp_roll30"] = grp["Min_Temp"].transform(lambda x: x.shift(1).rolling(30, min_periods=1).mean())
df["Rain_roll7"]     = grp["Rainfall"].transform(lambda x: x.shift(1).rolling(7,  min_periods=1).mean())

# ── 3f. Climatological Mean ───────────────────────────────────────────────────
# "What is the historical average temperature for this location in this month?"
# This is a very strong baseline feature — location + month tells you a lot.

print("  Creating climatological mean features...")

clim = df.groupby(["Latitude", "Longitude", "Month"])[["Max_Temp", "Min_Temp"]].mean()
clim.columns = ["Clim_MaxTemp", "Clim_MinTemp"]
clim = clim.reset_index()
df = df.merge(clim, on=["Latitude", "Longitude", "Month"], how="left")

# Anomaly = today's temp vs historical average for that month/location
df["MaxTemp_Anomaly"] = df["Max_Temp"] - df["Clim_MaxTemp"]
df["MinTemp_Anomaly"] = df["Min_Temp"] - df["Clim_MinTemp"]

print(f"  Feature engineering complete. Total columns: {len(df.columns)}")

# =============================================================================
# STEP 4: DEFINE FEATURES AND SPLIT DATA
# =============================================================================
print("\n" + "=" * 60)
print("STEP 4: Preparing train/test split...")
print("=" * 60)

# These are the columns we feed INTO the model
FEATURE_COLUMNS = [
    # Location
    "Latitude", "Longitude",
    # Time features
    "Year", "Month", "Day", "DayOfYear", "Season_Code",
    "Month_sin", "Month_cos", "Day_sin", "Day_cos",
    # Lag features (past values)
    "MaxTemp_lag1", "MaxTemp_lag3", "MaxTemp_lag7",
    "MinTemp_lag1", "MinTemp_lag3", "MinTemp_lag7",
    "Rainfall_lag1",
    # Rolling averages
    "MaxTemp_roll7", "MaxTemp_roll30",
    "MinTemp_roll7", "MinTemp_roll30",
    "Rain_roll7",
    # Climatology
    "Clim_MaxTemp", "Clim_MinTemp",
    "Diurnal_Range",
    # Yesterday's rainfall
    "Rainfall",
    # Phase 1: Climate driver variables
    "ONI", "DMI", "Elevation_m", "Dist_Coast_km", "Log_Dist_Coast",
    "ENSO_Phase", "IOD_Phase",
    "ONI_x_Monsoon", "DMI_x_Monsoon", "Elevation_x_Monsoon",
]

TARGET_MAX = "Max_Temp"
TARGET_MIN = "Min_Temp"

# Drop rows where ANY feature is NaN
# (lag features will have NaN for first 7 rows of each grid point — normal)
df_model = df[FEATURE_COLUMNS + [TARGET_MAX, TARGET_MIN]].dropna()
print(f"  Rows after dropping NaN feature rows: {len(df_model):,}")

X = df_model[FEATURE_COLUMNS]
y_max = df_model[TARGET_MAX]
y_min = df_model[TARGET_MIN]

# Split strategy:
# Train: 1951-2018 (or dynamic fallback if truncated)
# Val:   2019-2021 (or dynamic fallback if truncated)
# Test:  2022-2025 (or dynamic fallback if truncated)

year_col = df.loc[df_model.index, "Year"]
min_year = int(year_col.min())
max_year = int(year_col.max())

if max_year >= 2025:
    train_end = 2018
    val_end = 2021
else:
    val_end = max_year - 1
    train_end = val_end - 1
    if train_end < min_year:
        train_end = min_year + int((max_year - min_year) * 0.7)
        val_end = min_year + int((max_year - min_year) * 0.85)

train_mask = year_col <= train_end
val_mask   = (year_col >= train_end + 1) & (year_col <= val_end)
test_mask  = year_col >= val_end + 1

# Subsample train set (35% ≈ 3M rows) to ensure memory safety & fast training
rng = np.random.default_rng(42)
train_indices = X[train_mask].index
sub_size = int(len(train_indices) * 0.35)
sub_idx = rng.choice(train_indices, size=sub_size, replace=False)

X_train, y_max_train, y_min_train = X.loc[sub_idx], y_max.loc[sub_idx], y_min.loc[sub_idx]
X_val,   y_max_val,   y_min_val   = X[val_mask],   y_max[val_mask],   y_min[val_mask]
X_test,  y_max_test,  y_min_test  = X[test_mask],  y_max[test_mask],  y_min[test_mask]

print(f"  Train size (subsampled) : {len(X_train):,} rows ({min_year}-{train_end})")
print(f"  Val size               : {len(X_val):,} rows   ({train_end+1}-{val_end})")
print(f"  Test size              : {len(X_test):,} rows  ({val_end+1}-{max_year})")

# =============================================================================
# STEP 5: TRAIN LIGHTGBM — MAX TEMP
# =============================================================================
print("\n" + "=" * 60)
print("STEP 5: Training LightGBM for Max Temperature...")
print("=" * 60)

# LightGBM parameters — explanation of each:
lgb_params = {
    "objective":       "regression",    # we're predicting a continuous number
    "metric":          "rmse",          # optimize Root Mean Squared Error
    "n_estimators":    1000,            # max number of trees to build
    "learning_rate":   0.05,            # how much each tree corrects the previous
    "num_leaves":      63,              # complexity of each tree (higher = more complex)
    "max_depth":       -1,              # no depth limit
    "min_child_samples": 50,            # min data points in each leaf (prevents overfitting)
    "feature_fraction": 0.8,           # use 80% of features per tree (adds randomness)
    "bagging_fraction": 0.8,           # use 80% of data per tree
    "bagging_freq":    5,
    "reg_alpha":       0.1,             # L1 regularization (reduces overfitting)
    "reg_lambda":      0.1,             # L2 regularization
    "n_jobs":          -1,              # use all CPU cores
    "verbose":         -1,              # suppress training output spam
    "random_state":    42,
}

# Create LightGBM datasets (faster than pandas for training)
train_data_max = lgb.Dataset(X_train, label=y_max_train)
val_data_max   = lgb.Dataset(X_val,   label=y_max_val, reference=train_data_max)

# Callback: stop early if validation score doesn't improve for 50 rounds
# This prevents wasting time and overfitting
callbacks = [
    lgb.early_stopping(stopping_rounds=50, verbose=True),
    lgb.log_evaluation(period=100)  # print progress every 100 trees
]

print("  Training... (will stop early if no improvement after 50 rounds)")
max_temp_model = lgb.train(
    lgb_params,
    train_data_max,
    valid_sets=[val_data_max],
    callbacks=callbacks,
)

print(f"  Best iteration: {max_temp_model.best_iteration}")

# =============================================================================
# STEP 6: TRAIN LIGHTGBM — MIN TEMP
# =============================================================================
print("\n" + "=" * 60)
print("STEP 6: Training LightGBM for Min Temperature...")
print("=" * 60)

train_data_min = lgb.Dataset(X_train, label=y_min_train)
val_data_min   = lgb.Dataset(X_val,   label=y_min_val, reference=train_data_min)

min_temp_model = lgb.train(
    lgb_params,
    train_data_min,
    valid_sets=[val_data_min],
    callbacks=callbacks,
)

print(f"  Best iteration: {min_temp_model.best_iteration}")

# =============================================================================
# STEP 7: EVALUATE BOTH MODELS
# =============================================================================
print("\n" + "=" * 60)
print(f"STEP 7: Evaluating models on TEST set ({val_end+1}-{max_year})...")
print("=" * 60)

def evaluate(model, X_test, y_test, name):
    preds = model.predict(X_test, num_iteration=model.best_iteration)
    mae   = mean_absolute_error(y_test, preds)
    rmse  = np.sqrt(mean_squared_error(y_test, preds))
    r2    = r2_score(y_test, preds)
    print(f"\n  {name}")
    print(f"    MAE  (Mean Absolute Error)      : {mae:.3f} C")
    print(f"    RMSE (Root Mean Squared Error)  : {rmse:.3f} C")
    print(f"    R2   (Accuracy score 0-1)       : {r2:.4f}  ({r2*100:.1f}%)")
    # Interpretation
    print(f"    -> On average, predictions are off by {mae:.2f} C")
    return preds, mae, rmse, r2

max_preds, max_mae, max_rmse, max_r2 = evaluate(
    max_temp_model, X_test, y_max_test, "MAX TEMPERATURE MODEL"
)
min_preds, min_mae, min_rmse, min_r2 = evaluate(
    min_temp_model, X_test, y_min_test, "MIN TEMPERATURE MODEL"
)

# =============================================================================
# STEP 8: PLOTS
# =============================================================================
print("\n" + "=" * 60)
print("STEP 8: Generating evaluation plots...")
print("=" * 60)

# ── Plot 1: Feature Importance ────────────────────────────────────────────────
fig, axes = plt.subplots(1, 2, figsize=(18, 8))

for ax, model, title in zip(axes,
                             [max_temp_model, min_temp_model],
                             ["Max Temp — Feature Importance",
                              "Min Temp — Feature Importance"]):
    importance = pd.DataFrame({
        "Feature":    FEATURE_COLUMNS,
        "Importance": model.feature_importance(importance_type="gain")
    }).sort_values("Importance", ascending=True).tail(15)

    ax.barh(importance["Feature"], importance["Importance"], color="steelblue")
    ax.set_title(title, fontsize=13, fontweight="bold")
    ax.set_xlabel("Importance (gain)")

plt.tight_layout()
plt.savefig("plots/feature_importance.png", dpi=150, bbox_inches="tight")
print("  Saved -> plots/feature_importance.png")
plt.close()

# ── Plot 2: Predicted vs Actual (scatter) ─────────────────────────────────────
sample_size = min(5000, len(y_max_test))
idx = np.random.choice(len(y_max_test), sample_size, replace=False)

fig, axes = plt.subplots(1, 2, figsize=(14, 6))
for ax, actual, predicted, title, color in zip(
    axes,
    [np.array(y_max_test)[idx], np.array(y_min_test)[idx]],
    [max_preds[idx],             min_preds[idx]],
    ["Max Temp: Predicted vs Actual", "Min Temp: Predicted vs Actual"],
    ["crimson", "steelblue"]
):
    ax.scatter(actual, predicted, alpha=0.3, s=5, color=color)
    mn = min(actual.min(), predicted.min())
    mx = max(actual.max(), predicted.max())
    ax.plot([mn, mx], [mn, mx], "k--", lw=1, label="Perfect prediction")
    ax.set_xlabel("Actual (°C)")
    ax.set_ylabel("Predicted (°C)")
    ax.set_title(title)
    ax.legend()

plt.tight_layout()
plt.savefig("plots/predicted_vs_actual.png", dpi=150, bbox_inches="tight")
print("  Saved -> plots/predicted_vs_actual.png")
plt.close()

# ── Plot 3: Time series for one location (Ahmedabad ≈ Lat 23.5, Lon 72.5) ───
print("  Generating time series plot for Ahmedabad...")

# Get test data for Ahmedabad grid point
abad_mask = (
    (df.loc[df_model.index[test_mask], "Latitude"]  == 23.5) &
    (df.loc[df_model.index[test_mask], "Longitude"] == 72.5)
)
if abad_mask.sum() > 30:
    X_abad    = X_test[abad_mask]
    y_abad    = y_max_test[abad_mask]
    pred_abad = max_temp_model.predict(X_abad, num_iteration=max_temp_model.best_iteration)
    dates_abad = df.loc[df_model.index[test_mask][abad_mask], "Date"].values

    fig, ax = plt.subplots(figsize=(16, 5))
    ax.plot(dates_abad[:365], y_abad.values[:365],   label="Actual",    color="crimson",   lw=1.5)
    ax.plot(dates_abad[:365], pred_abad[:365],        label="Predicted", color="steelblue", lw=1.5, linestyle="--")
    ax.set_title("Max Temperature — Ahmedabad (First year of test set)", fontsize=13)
    ax.set_ylabel("Temperature (°C)")
    ax.legend()
    plt.tight_layout()
    plt.savefig("plots/ahmedabad_timeseries.png", dpi=150, bbox_inches="tight")
    print("  Saved -> plots/ahmedabad_timeseries.png")
    plt.close()
else:
    print("  (Ahmedabad grid point not found in test set — skipping this plot)")

# =============================================================================
# STEP 9: SAVE MODELS
# =============================================================================
print("\n" + "=" * 60)
print("STEP 9: Saving models...")
print("=" * 60)

with open("max_temp_model.pkl", "wb") as f:
    pickle.dump(max_temp_model, f)
print("  Saved -> max_temp_model.pkl")

with open("min_temp_model.pkl", "wb") as f:
    pickle.dump(min_temp_model, f)
print("  Saved -> min_temp_model.pkl")

# Save feature columns list — Yashvi MUST use this exact order when predicting
with open("feature_columns.pkl", "wb") as f:
    pickle.dump(FEATURE_COLUMNS, f)
print("  Saved -> feature_columns.pkl")

# Save model metrics for dashboard MODEL SUMMARY panel
metrics = {
    "max_temp": {"MAE": round(max_mae, 3), "RMSE": round(max_rmse, 3), "R2": round(max_r2, 4)},
    "min_temp": {"MAE": round(min_mae, 3), "RMSE": round(min_rmse, 3), "R2": round(min_r2, 4)},
    "model_type": "LightGBM",
    "spatial_resolution": "1.0° x 1.0°",
    "temporal_resolution": "Daily",
    "forecast_horizon": "1–7 Days",
    "train_years": f"{min_year}-{train_end}",
    "test_years": f"{val_end+1}-{max_year}",
}
with open("model_metrics_v2.json", "w", encoding="utf-8") as f:
    json.dump(metrics, f, indent=2)
print("  Saved -> model_metrics_v2.json")

# =============================================================================
# STEP 10: GENERATE SAMPLE PREDICTION JSON FOR YASHVI
# =============================================================================
# Yashvi can use this hardcoded JSON to build the UI
# while the real models are still being trained
print("\n" + "=" * 60)
print("STEP 10: Generating sample prediction JSON for Yashvi...")
print("=" * 60)

# Pick a sample date from test set and predict all grid points
test_dates = df.loc[df_model.index[test_mask], "Date"]
if len(test_dates) > 0:
    sample_date = test_dates.iloc[len(test_dates) // 2]
else:
    sample_date = df["Date"].max()
sample_date_str = sample_date.strftime("%Y-%m-%d")

# Get all rows for this date
df_sample = df[df["Date"] == sample_date].copy()

if len(df_sample) > 0:
    df_sample_feat = df_sample[FEATURE_COLUMNS].dropna()
    if len(df_sample_feat) > 0:
        max_pred_sample = max_temp_model.predict(df_sample_feat)
        min_pred_sample = min_temp_model.predict(df_sample_feat)

        grid_predictions = []
        for i, (idx, row) in enumerate(df_sample_feat.iterrows()):
            grid_predictions.append({
                "lat":      float(df_sample.loc[idx, "Latitude"]),
                "lon":      float(df_sample.loc[idx, "Longitude"]),
                "max_temp": round(float(max_pred_sample[i]), 2),
                "min_temp": round(float(min_pred_sample[i]), 2),
                "rainfall": float(df_sample.loc[idx, "Rainfall"]),
            })

        sample_output = {
            "date": sample_date_str,
            "model": "LightGBM Temperature Model",
            "all_india_summary": {
                "max_temp": round(float(np.mean(max_pred_sample)), 1),
                "min_temp": round(float(np.mean(min_pred_sample)), 1),
            },
            "grid_predictions": grid_predictions[:50],  # first 50 for sample
            "model_metrics": metrics,
        }

        with open("sample_prediction.json", "w", encoding="utf-8") as f:
            json.dump(sample_output, f, indent=2)
        print(f"  Saved -> sample_prediction.json ({len(grid_predictions)} grid points)")
else:
    print(f"  Sample date {sample_date_str} not found — skipping JSON generation")

# =============================================================================
# FINAL SUMMARY
# =============================================================================
print("\n" + "=" * 60)
print("ALL DONE! SUMMARY")
print("=" * 60)
print(f"""
  Models trained on  : {min_year}-{train_end} data
  Models validated   : {train_end+1}-{val_end} data
  Models tested on   : {val_end+1}-{max_year} data (never seen during training)

  MAX TEMP MODEL:
    -> R2 = {max_r2:.4f} ({max_r2*100:.1f}% accuracy)
    -> Average error = {max_mae:.2f} C

  MIN TEMP MODEL:
    -> R2 = {min_r2:.4f} ({min_r2*100:.1f}% accuracy)
    -> Average error = {min_mae:.2f} C

  Files to give to Yashvi:
    [x] max_temp_model.pkl
    [x] min_temp_model.pkl
    [x] feature_columns.pkl
    [x] model_metrics.json
    [x] sample_prediction.json

  Files to show in presentation:
    [x] plots/feature_importance.png
    [x] plots/predicted_vs_actual.png
    [x] plots/ahmedabad_timeseries.png
""")