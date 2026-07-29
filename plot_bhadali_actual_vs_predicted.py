"""
================================================================================
BHADALI MODEL — ACTUAL vs PREDICTED COMPARISON PLOTS
================================================================================
Loads the trained Bhadali Vakyo rainfall models and generates plots
comparing actual rainfall data against what the model predicted.

Uses the test set (2022+) to show real performance.
================================================================================
"""

import pandas as pd
import numpy as np
import pickle, json, os, gc, warnings
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.patches import Patch
import seaborn as sns
from sklearn.metrics import (
    confusion_matrix, classification_report,
    mean_absolute_error, mean_squared_error, r2_score
)

warnings.filterwarnings("ignore")
os.makedirs("plots_bhadali", exist_ok=True)

plt.rcParams.update({
    "font.family":      "sans-serif",
    "font.size":        11,
    "axes.titlesize":   14,
    "axes.titleweight": "bold",
    "axes.labelsize":   12,
    "figure.facecolor": "white",
    "axes.facecolor":   "#f8f9fa",
    "axes.edgecolor":   "#cccccc",
    "grid.alpha":       0.3,
})

# =============================================================================
# STEP 1: LOAD MODELS
# =============================================================================
print("=" * 60)
print("ACTUAL vs PREDICTED — Bhadali Vakyo Model")
print("=" * 60)

print("\nStep 1: Loading saved models...")
rain_classifier  = pickle.load(open("rainfall_classifier.pkl", "rb"))
rain_regressor   = pickle.load(open("rainfall_regressor.pkl", "rb"))
CLS_FEATURES     = pickle.load(open("rainfall_cls_features.pkl", "rb"))
REG_FEATURES     = pickle.load(open("rainfall_feature_cols.pkl", "rb"))
print(f"  Classifier features: {len(CLS_FEATURES)}")
print(f"  Regressor features:  {len(REG_FEATURES)}")

# =============================================================================
# STEP 2: REBUILD TEST DATA (same pipeline as training script)
# =============================================================================
print("\nStep 2: Rebuilding test dataset...")

df = pd.read_csv("merged_climate_data.csv", parse_dates=["Date"])
df["Rainfall"] = df["Rainfall"].fillna(0)
df = df[(df["Rainfall"] >= 0) & (df["Rainfall"] <= 999)]
df = df[(df["Max_Temp"] >= -20) & (df["Max_Temp"] <= 55)]
df = df[(df["Min_Temp"] >= -20) & (df["Min_Temp"] <= 45)]
df.dropna(subset=["Max_Temp", "Min_Temp"], inplace=True)
df = df.sort_values(["Latitude", "Longitude", "Date"]).reset_index(drop=True)
print(f"  Climate rows: {len(df):,}")

df_bhadali = pd.read_csv("bhadali_features.csv", parse_dates=["Date"], dayfirst=True)
df = df.merge(df_bhadali, on="Date", how="left")
print(f"  After Bhadali merge: {len(df):,}")

# Feature engineering (same as training)
season_map = {"Winter":0, "Pre-Monsoon":1, "Monsoon":2, "Post-Monsoon":3}
df["Season_Code"] = df["Season"].map(season_map)
df["Month_sin"]   = np.sin(2*np.pi*df["Month"]/12).astype(np.float32)
df["Month_cos"]   = np.cos(2*np.pi*df["Month"]/12).astype(np.float32)
df["Day_sin"]     = np.sin(2*np.pi*df["Day"]/365).astype(np.float32)
df["Day_cos"]     = np.cos(2*np.pi*df["Day"]/365).astype(np.float32)
df["DayOfYear"]   = df["Date"].dt.dayofyear
df["Is_Monsoon"]  = df["Month"].isin([6,7,8,9]).astype(np.int8)
df["Lat_Zone"]    = pd.cut(df["Latitude"], bins=[0,15,20,25,40], labels=[0,1,2,3]).astype(float)

print("  Lag features...")
grp = df.groupby(["Latitude","Longitude"])
for lag in [1, 2, 3, 7, 14]:
    df[f"Rain_lag{lag}"] = grp["Rainfall"].shift(lag).astype(np.float32)
df["MaxTemp_lag1"]     = grp["Max_Temp"].shift(1).astype(np.float32)
df["MinTemp_lag1"]     = grp["Min_Temp"].shift(1).astype(np.float32)
df["Rain_lag1_binary"] = (df["Rain_lag1"] > 0.1).astype(np.float32)

print("  Rolling features...")
df["Rain_roll3"]    = grp["Rainfall"].transform(lambda x: x.shift(1).rolling(3,  min_periods=1).sum()).astype(np.float32)
df["Rain_roll7"]    = grp["Rainfall"].transform(lambda x: x.shift(1).rolling(7,  min_periods=1).sum()).astype(np.float32)
df["Rain_roll14"]   = grp["Rainfall"].transform(lambda x: x.shift(1).rolling(14, min_periods=1).sum()).astype(np.float32)
df["Rain_roll30"]   = grp["Rainfall"].transform(lambda x: x.shift(1).rolling(30, min_periods=1).sum()).astype(np.float32)
df["Rain_days7"]    = grp["Rainfall"].transform(lambda x: (x.shift(1)>0).rolling(7,  min_periods=1).sum()).astype(np.float32)
df["Rain_max7"]     = grp["Rainfall"].transform(lambda x: x.shift(1).rolling(7,  min_periods=1).max()).astype(np.float32)
df["MaxTemp_roll7"] = grp["Max_Temp"].transform(lambda x: x.shift(1).rolling(7,  min_periods=1).mean()).astype(np.float32)

print("  Spell features...")
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

df["Dry_Spell"] = grp["Rainfall"].transform(dry_spell_vec)
df["Wet_Spell"] = grp["Rainfall"].transform(wet_spell_vec)
df["Dry_Spell_x_Monsoon"]    = (df["Dry_Spell"] * df["Is_Monsoon"]).astype(np.float32)
df["Dry_Spell_x_NotMonsoon"] = (df["Dry_Spell"] * (1-df["Is_Monsoon"])).astype(np.float32)

print("  Neighbor features...")
df["Date_next"] = df["Date"] + pd.Timedelta(days=1)
yesterday_lookup = df[["Date","Latitude","Longitude","Rainfall"]].copy()
yesterday_lookup.columns = ["Date_next","Latitude","Longitude","Yday_Rain"]
for direction, dlat, dlon in [("N",-1,0),("S",1,0),("E",0,-1),("W",0,1)]:
    n = yesterday_lookup.copy()
    n["Latitude"]  = n["Latitude"]  - dlat
    n["Longitude"] = n["Longitude"] - dlon
    df = df.merge(n.rename(columns={"Yday_Rain":f"Rain_{direction}"}),
                  on=["Date_next","Latitude","Longitude"], how="left")
df.drop(columns=["Date_next"], inplace=True)
for col in ["Rain_N","Rain_S","Rain_E","Rain_W"]:
    df[col] = df[col].fillna(0).astype(np.float32)
df["Neighbor_Rain_Mean"] = ((df["Rain_N"]+df["Rain_S"]+df["Rain_E"]+df["Rain_W"])/4).astype(np.float32)
df["Neighbor_Rain_Max"]  = df[["Rain_N","Rain_S","Rain_E","Rain_W"]].max(axis=1).astype(np.float32)
df["Neighbor_Any_Rain"]  = (df["Neighbor_Rain_Mean"] > 0.1).astype(np.float32)
df.drop(columns=["Rain_N","Rain_S","Rain_E","Rain_W"], inplace=True)
del yesterday_lookup
gc.collect()

print("  Climatological features...")
clim_dry = df.groupby(["Latitude","Longitude","Month"]).apply(
    lambda x: (x["Rainfall"]==0).mean(), include_groups=False).reset_index()
clim_dry.columns = ["Latitude","Longitude","Month","Dry_Season_Prob"]
df = df.merge(clim_dry, on=["Latitude","Longitude","Month"], how="left")
df["Dry_Season_Prob"] = df["Dry_Season_Prob"].astype(np.float32)

clim_r = df.groupby(["Latitude","Longitude","Month"])["Rainfall"].mean().reset_index()
clim_r.columns = ["Latitude","Longitude","Month","Clim_Rainfall"]
df = df.merge(clim_r, on=["Latitude","Longitude","Month"], how="left")

clim_p = df.groupby(["Latitude","Longitude","Month"]).apply(
    lambda x: (x["Rainfall"]>0).mean(), include_groups=False).reset_index()
clim_p.columns = ["Latitude","Longitude","Month","Clim_Rain_Prob"]
df = df.merge(clim_p, on=["Latitude","Longitude","Month"], how="left")

for col in df.select_dtypes(include=[np.float64]).columns:
    df[col] = df[col].astype(np.float32)

df["Rain_Binary"] = (df["Rainfall"] > 0.1).astype(np.int8)
all_cols = list(set(CLS_FEATURES + REG_FEATURES + ["Rain_Binary","Rainfall","Year","Date","Month"]))
existing = [c for c in all_cols if c in df.columns]
df_model = df[existing].dropna()

test_mask = df_model["Year"] >= 2022
df_test   = df_model[test_mask].copy()
print(f"  Test rows (2022+): {len(df_test):,}")

# =============================================================================
# STEP 3: PREDICT
# =============================================================================
print("\nStep 3: Running predictions...")

Xc_test = df_test[CLS_FEATURES]
Xr_test = df_test[REG_FEATURES]
y_actual_binary = df_test["Rain_Binary"].values
y_actual_rain   = df_test["Rainfall"].values
actual_months   = df_test["Month"].values
actual_dates    = df_test["Date"].values

# Classifier predictions
probs = rain_classifier.predict_proba(Xc_test)[:, 1]
preds_binary = (probs >= 0.5).astype(int)

# Combined predictions (classifier gates regressor)
combined_pred = np.zeros(len(Xr_test))
rain_mask = preds_binary == 1
if rain_mask.sum() > 0:
    combined_pred[rain_mask] = np.maximum(
        np.expm1(rain_regressor.predict(Xr_test.iloc[rain_mask])), 0)

# Metrics
from sklearn.metrics import accuracy_score, f1_score
acc = accuracy_score(y_actual_binary, preds_binary)
f1  = f1_score(y_actual_binary, preds_binary)
mae = mean_absolute_error(y_actual_rain, combined_pred)
rmse = np.sqrt(mean_squared_error(y_actual_rain, combined_pred))
r2  = r2_score(y_actual_rain, combined_pred)

print(f"  Classifier: Accuracy={acc*100:.1f}%, F1={f1:.4f}")
print(f"  Combined:   MAE={mae:.2f}mm, RMSE={rmse:.2f}mm, R2={r2:.4f}")

del df, df_model
gc.collect()

# =============================================================================
# PLOT 1: Actual vs Predicted Scatter Plot
# =============================================================================
print("\nGenerating plots...")
print("  Plot 1: Actual vs Predicted scatter...")

fig, ax = plt.subplots(figsize=(10, 10))

# Sample for performance (too many points otherwise)
rng = np.random.default_rng(42)
n_sample = min(50000, len(y_actual_rain))
idx = rng.choice(len(y_actual_rain), n_sample, replace=False)

ax.scatter(y_actual_rain[idx], combined_pred[idx], alpha=0.15, s=8,
           c="#3a86ff", edgecolors="none")

# Perfect prediction line
max_val = max(y_actual_rain[idx].max(), combined_pred[idx].max())
ax.plot([0, max_val], [0, max_val], "--", color="#e63946", linewidth=2,
        label="Perfect prediction")

ax.set_xlabel("Actual Rainfall (mm)", fontsize=13)
ax.set_ylabel("Predicted Rainfall (mm)", fontsize=13)
ax.set_title(f"Actual vs Predicted Rainfall (Bhadali Vakyo Model)\n"
             f"R2={r2:.4f} | MAE={mae:.2f}mm | RMSE={rmse:.2f}mm",
             fontsize=14, fontweight="bold")
ax.legend(fontsize=12)
ax.set_xlim(0, 200)
ax.set_ylim(0, 200)
ax.set_aspect("equal")
plt.tight_layout()
plt.savefig("plots_bhadali/actual_vs_predicted_scatter.png", dpi=150, bbox_inches="tight")
plt.close()
print("    Saved -> plots_bhadali/actual_vs_predicted_scatter.png")

# =============================================================================
# PLOT 2: Monthly Actual vs Predicted Bar Chart
# =============================================================================
print("  Plot 2: Monthly actual vs predicted...")

fig, axes = plt.subplots(1, 2, figsize=(18, 7))

month_names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

# 2a: Mean rainfall by month
monthly = pd.DataFrame({"Month": actual_months, "Actual": y_actual_rain,
                         "Predicted": combined_pred})
monthly_avg = monthly.groupby("Month").mean()

x = np.arange(12)
width = 0.35
axes[0].bar(x - width/2, monthly_avg["Actual"],    width, label="Actual",
            color="#3a86ff", alpha=0.85, edgecolor="white")
axes[0].bar(x + width/2, monthly_avg["Predicted"], width, label="Predicted",
            color="#ff6b4a", alpha=0.85, edgecolor="white")
axes[0].set_xticks(x)
axes[0].set_xticklabels(month_names)
axes[0].set_ylabel("Mean Rainfall (mm)")
axes[0].set_title("Monthly Mean Rainfall: Actual vs Predicted")
axes[0].legend(fontsize=11)

# Add difference annotation
for i in range(12):
    if i+1 in monthly_avg.index:
        act = monthly_avg.loc[i+1, "Actual"]
        pred = monthly_avg.loc[i+1, "Predicted"]
        diff = pred - act
        axes[0].text(i, max(act, pred) + 2, f"{diff:+.1f}",
                     ha="center", fontsize=8, fontweight="bold",
                     color="#2d6a4f" if abs(diff) < 5 else "#e63946")

# 2b: Rain probability by month
monthly_prob = monthly.copy()
monthly_prob["Actual_Rain"]    = (monthly_prob["Actual"] > 0.1).astype(int)
monthly_prob["Predicted_Rain"] = (monthly_prob["Predicted"] > 0.1).astype(int)
prob_by_month = monthly_prob.groupby("Month")[["Actual_Rain","Predicted_Rain"]].mean() * 100

axes[1].bar(x - width/2, prob_by_month["Actual_Rain"],    width, label="Actual",
            color="#3a86ff", alpha=0.85, edgecolor="white")
axes[1].bar(x + width/2, prob_by_month["Predicted_Rain"], width, label="Predicted",
            color="#ff6b4a", alpha=0.85, edgecolor="white")
axes[1].set_xticks(x)
axes[1].set_xticklabels(month_names)
axes[1].set_ylabel("Rain Occurrence (%)")
axes[1].set_title("Monthly Rain Probability: Actual vs Predicted")
axes[1].legend(fontsize=11)

fig.suptitle("Bhadali Vakyo Model - Monthly Performance (Test Set: 2022+)",
             fontsize=16, fontweight="bold", y=1.02)
plt.tight_layout()
plt.savefig("plots_bhadali/actual_vs_predicted_monthly.png", dpi=150, bbox_inches="tight")
plt.close()
print("    Saved -> plots_bhadali/actual_vs_predicted_monthly.png")

# =============================================================================
# PLOT 3: Confusion Matrix — Did it Rain? Actual vs Predicted
# =============================================================================
print("  Plot 3: Confusion matrix...")

fig, axes = plt.subplots(1, 2, figsize=(16, 7))

# 3a: Confusion matrix heatmap
cm = confusion_matrix(y_actual_binary, preds_binary)
sns.heatmap(cm, annot=True, fmt=",d", cmap="Blues", ax=axes[0],
            xticklabels=["Predicted: No Rain", "Predicted: Rain"],
            yticklabels=["Actual: No Rain", "Actual: Rain"],
            annot_kws={"size": 14})
axes[0].set_title(f"Confusion Matrix\nAccuracy: {acc*100:.1f}% | F1: {f1:.4f}",
                  fontsize=13, fontweight="bold")

# 3b: Normalized confusion matrix (percentages)
cm_norm = cm.astype(float) / cm.sum(axis=1, keepdims=True) * 100
sns.heatmap(cm_norm, annot=True, fmt=".1f", cmap="Oranges", ax=axes[1],
            xticklabels=["Predicted: No Rain", "Predicted: Rain"],
            yticklabels=["Actual: No Rain", "Actual: Rain"],
            annot_kws={"size": 14}, vmin=0, vmax=100)
axes[1].set_title("Normalized Confusion Matrix (%)\n(row-wise: what % did we get right?)",
                  fontsize=13, fontweight="bold")

fig.suptitle("Bhadali Vakyo Classifier - Rain Detection Performance",
             fontsize=16, fontweight="bold", y=1.02)
plt.tight_layout()
plt.savefig("plots_bhadali/actual_vs_predicted_confusion.png", dpi=150, bbox_inches="tight")
plt.close()
print("    Saved -> plots_bhadali/actual_vs_predicted_confusion.png")

# =============================================================================
# PLOT 4: Daily Time Series — Actual vs Predicted (sample station)
# =============================================================================
print("  Plot 4: Daily time series comparison...")

# Pick a grid point with good data coverage
sample = df_test.copy()
grid_counts = sample.groupby(["Latitude","Longitude"]).size().reset_index(name="n")
grid_counts = grid_counts.sort_values("n", ascending=False)
best_lat = grid_counts.iloc[0]["Latitude"]
best_lon = grid_counts.iloc[0]["Longitude"]

mask_station = (sample["Latitude"] == best_lat) & (sample["Longitude"] == best_lon)
station_data = sample[mask_station].sort_values("Date").copy()
station_pred = combined_pred[mask_station.values]

# Take monsoon months (Jun-Sep) for clearer visualization
monsoon_mask = station_data["Month"].isin([6,7,8,9])
st_monsoon = station_data[monsoon_mask].reset_index(drop=True)
pr_monsoon = station_pred[monsoon_mask.values]

# Limit to first 120 days for readability
n_days = min(120, len(st_monsoon))
dates_plot   = st_monsoon["Date"].values[:n_days]
actual_plot  = st_monsoon["Rainfall"].values[:n_days]
pred_plot    = pr_monsoon[:n_days]

fig, axes = plt.subplots(2, 1, figsize=(18, 10), gridspec_kw={"height_ratios": [3, 1]})

# Top: overlaid actual vs predicted
axes[0].fill_between(range(n_days), actual_plot, alpha=0.3, color="#3a86ff", label="Actual Rainfall")
axes[0].plot(range(n_days), actual_plot, color="#3a86ff", linewidth=1, alpha=0.7)
axes[0].plot(range(n_days), pred_plot, color="#ff6b4a", linewidth=1.5, alpha=0.9, label="Predicted Rainfall")

axes[0].set_ylabel("Rainfall (mm)", fontsize=13)
axes[0].set_title(f"Daily Rainfall: Actual vs Predicted (Monsoon Season)\n"
                  f"Grid Point: {best_lat:.1f}N, {best_lon:.1f}E",
                  fontsize=14, fontweight="bold")
axes[0].legend(fontsize=12, loc="upper right")

# Set x-axis labels every 10 days
tick_pos = list(range(0, n_days, 10))
tick_labels = [pd.Timestamp(dates_plot[i]).strftime("%b %d") if i < n_days else ""
               for i in tick_pos]
axes[0].set_xticks(tick_pos)
axes[0].set_xticklabels(tick_labels, rotation=30, fontsize=9)

# Bottom: residual (error)
residual = pred_plot - actual_plot
axes[1].bar(range(n_days), residual, color=["#2d6a4f" if r >= 0 else "#e63946" for r in residual],
            alpha=0.7, width=1)
axes[1].axhline(0, color="black", linewidth=0.5)
axes[1].set_ylabel("Error (mm)")
axes[1].set_xlabel("Day")
axes[1].set_title("Prediction Error (Predicted - Actual)", fontsize=12)
axes[1].set_xticks(tick_pos)
axes[1].set_xticklabels(tick_labels, rotation=30, fontsize=9)

plt.tight_layout()
plt.savefig("plots_bhadali/actual_vs_predicted_timeseries.png", dpi=150, bbox_inches="tight")
plt.close()
print("    Saved -> plots_bhadali/actual_vs_predicted_timeseries.png")

# =============================================================================
# PLOT 5: Rainfall Distribution — Actual vs Predicted Histogram
# =============================================================================
print("  Plot 5: Rainfall distribution comparison...")

fig, axes = plt.subplots(1, 2, figsize=(16, 7))

# 5a: Full distribution (including 0)
bins_all = np.arange(0, 105, 5)
axes[0].hist(y_actual_rain, bins=bins_all, alpha=0.6, color="#3a86ff",
             label="Actual", density=True, edgecolor="white")
axes[0].hist(combined_pred, bins=bins_all, alpha=0.6, color="#ff6b4a",
             label="Predicted", density=True, edgecolor="white")
axes[0].set_xlabel("Rainfall (mm)")
axes[0].set_ylabel("Density")
axes[0].set_title("Rainfall Distribution (0-100mm)")
axes[0].legend(fontsize=11)
axes[0].set_xlim(0, 100)

# 5b: Only rainy days
rainy_actual = y_actual_rain[y_actual_rain > 0.1]
rainy_pred   = combined_pred[combined_pred > 0.1]
bins_rain = np.arange(0, 105, 5)
axes[1].hist(rainy_actual, bins=bins_rain, alpha=0.6, color="#3a86ff",
             label=f"Actual (n={len(rainy_actual):,})", density=True, edgecolor="white")
axes[1].hist(rainy_pred, bins=bins_rain, alpha=0.6, color="#ff6b4a",
             label=f"Predicted (n={len(rainy_pred):,})", density=True, edgecolor="white")
axes[1].set_xlabel("Rainfall (mm)")
axes[1].set_ylabel("Density")
axes[1].set_title("Rainy Days Only (>0.1mm)")
axes[1].legend(fontsize=11)
axes[1].set_xlim(0, 100)

fig.suptitle("Rainfall Distribution: Actual vs Bhadali Model Predicted",
             fontsize=16, fontweight="bold", y=1.02)
plt.tight_layout()
plt.savefig("plots_bhadali/actual_vs_predicted_distribution.png", dpi=150, bbox_inches="tight")
plt.close()
print("    Saved -> plots_bhadali/actual_vs_predicted_distribution.png")

# =============================================================================
# PLOT 6: Bhadali Score Impact — Actual vs Predicted by Score
# =============================================================================
print("  Plot 6: Bhadali Score actual vs predicted...")

fig, axes = plt.subplots(1, 2, figsize=(16, 7))

bhadali_scores = Xc_test["Bhadali_Score"].values
score_df = pd.DataFrame({
    "Bhadali_Score": bhadali_scores,
    "Actual_Rain":   y_actual_rain,
    "Predicted_Rain": combined_pred,
    "Actual_Binary":  y_actual_binary,
    "Predicted_Binary": preds_binary
})

score_agg = score_df.groupby("Bhadali_Score").agg(
    Actual_Prob=("Actual_Binary", "mean"),
    Predicted_Prob=("Predicted_Binary", "mean"),
    Actual_Amount=("Actual_Rain", "mean"),
    Predicted_Amount=("Predicted_Rain", "mean"),
    Count=("Actual_Rain", "count")
).reset_index()

x = np.arange(len(score_agg))
width = 0.35

# 6a: Rain probability
axes[0].bar(x - width/2, score_agg["Actual_Prob"]*100,    width,
            label="Actual", color="#3a86ff", alpha=0.85, edgecolor="white")
axes[0].bar(x + width/2, score_agg["Predicted_Prob"]*100, width,
            label="Predicted", color="#ff6b4a", alpha=0.85, edgecolor="white")

for i, row in score_agg.iterrows():
    axes[0].text(i - width/2, row["Actual_Prob"]*100 + 1,
                 f"{row['Actual_Prob']*100:.1f}%", ha="center", fontsize=9, fontweight="bold", color="#3a86ff")
    axes[0].text(i + width/2, row["Predicted_Prob"]*100 + 1,
                 f"{row['Predicted_Prob']*100:.1f}%", ha="center", fontsize=9, fontweight="bold", color="#ff6b4a")

axes[0].set_xticks(x)
axes[0].set_xticklabels(score_agg["Bhadali_Score"].astype(int))
axes[0].set_xlabel("Bhadali Score")
axes[0].set_ylabel("Rain Probability (%)")
axes[0].set_title("Rain Probability by Bhadali Score")
axes[0].legend(fontsize=11)

# 6b: Mean rainfall amount
axes[1].bar(x - width/2, score_agg["Actual_Amount"],    width,
            label="Actual", color="#3a86ff", alpha=0.85, edgecolor="white")
axes[1].bar(x + width/2, score_agg["Predicted_Amount"], width,
            label="Predicted", color="#ff6b4a", alpha=0.85, edgecolor="white")

for i, row in score_agg.iterrows():
    axes[1].text(i - width/2, row["Actual_Amount"] + 1,
                 f"{row['Actual_Amount']:.1f}", ha="center", fontsize=9, fontweight="bold", color="#3a86ff")
    axes[1].text(i + width/2, row["Predicted_Amount"] + 1,
                 f"{row['Predicted_Amount']:.1f}", ha="center", fontsize=9, fontweight="bold", color="#ff6b4a")

axes[1].set_xticks(x)
axes[1].set_xticklabels(score_agg["Bhadali_Score"].astype(int))
axes[1].set_xlabel("Bhadali Score")
axes[1].set_ylabel("Mean Rainfall (mm)")
axes[1].set_title("Mean Rainfall by Bhadali Score")
axes[1].legend(fontsize=11)

fig.suptitle("Bhadali Score: Does the Model Capture Ancient Wisdom?\n"
             "(Blue = what actually happened, Orange = what model predicted)",
             fontsize=15, fontweight="bold", y=1.03)
plt.tight_layout()
plt.savefig("plots_bhadali/actual_vs_predicted_bhadali_score.png", dpi=150, bbox_inches="tight")
plt.close()
print("    Saved -> plots_bhadali/actual_vs_predicted_bhadali_score.png")

# =============================================================================
# DONE
# =============================================================================
print("\n" + "=" * 60)
print("ALL ACTUAL vs PREDICTED PLOTS SAVED!")
print("=" * 60)
print(f"""
  Model Performance (Test Set 2022+):
    Classifier Accuracy : {acc*100:.1f}%
    Classifier F1       : {f1:.4f}
    Combined MAE        : {mae:.2f} mm
    Combined RMSE       : {rmse:.2f} mm
    Combined R2         : {r2:.4f}

  Plots saved to plots_bhadali/:
    actual_vs_predicted_scatter.png       - Scatter: actual vs predicted rainfall
    actual_vs_predicted_monthly.png       - Monthly bars: actual vs predicted
    actual_vs_predicted_confusion.png     - Confusion matrix (rain/no-rain)
    actual_vs_predicted_timeseries.png    - Daily timeseries overlay
    actual_vs_predicted_distribution.png  - Histogram: rainfall distributions
    actual_vs_predicted_bhadali_score.png - Bhadali Score: actual vs predicted
""")
