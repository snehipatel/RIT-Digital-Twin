"""
================================================================================
BHADALI VAKYO FEATURE PLOTS
================================================================================
Generates comprehensive visualizations of Bhadali Vakyo (ancient Indian lunar
rain prediction) features and their correlation with actual rainfall data.

Input files:
  - bhadali_features.csv      (lunar features per date)
  - merged_climate_data.csv   (rainfall + climate data)

Output: plots_bhadali/ directory with 8 publication-quality plots
================================================================================
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.patches import Patch
import seaborn as sns
import os, warnings

warnings.filterwarnings("ignore")
os.makedirs("plots_bhadali", exist_ok=True)

# ── Style setup ───────────────────────────────────────────────────────────────
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

LUNAR_ORANGE  = "#ff6b4a"
CLIMATE_TEAL  = "#2ec4b6"
RAIN_BLUE     = "#3a86ff"
DRY_GOLD      = "#ffd166"
DARK_BG       = "#1a1a2e"

# =============================================================================
# LOAD DATA
# =============================================================================
print("=" * 60)
print("BHADALI VAKYO FEATURE PLOTS")
print("=" * 60)

print("\nLoading data...")
df_bhadali = pd.read_csv("bhadali_features.csv", parse_dates=["Date"], dayfirst=True)
print(f"  Bhadali features: {len(df_bhadali):,} dates x {len(df_bhadali.columns)} columns")

df_climate = pd.read_csv("merged_climate_data.csv", parse_dates=["Date"],
                          usecols=["Date","Rainfall","Max_Temp","Min_Temp",
                                   "Latitude","Longitude","Month","Season"])
df_climate["Rainfall"] = df_climate["Rainfall"].fillna(0)
df_climate = df_climate[(df_climate["Rainfall"] >= 0) & (df_climate["Rainfall"] <= 999)]
print(f"  Climate data: {len(df_climate):,} rows")

# Merge
df = df_climate.merge(df_bhadali, on="Date", how="inner")
df["Has_Rain"] = (df["Rainfall"] > 0.1).astype(int)
print(f"  Merged: {len(df):,} rows")

# =============================================================================
# NAKSHATRA NAMES
# =============================================================================
NAKSHATRA_NAMES = [
    'Ashwini','Bharani','Krittika','Rohini','Mrigashira',
    'Ardra','Punarvasu','Pushya','Ashlesha','Magha',
    'Purva Ph.','Uttara Ph.','Hasta','Chitra','Swati',
    'Vishakha','Anuradha','Jyeshtha','Mula','Purva Ash.',
    'Uttara Ash.','Shravana','Dhanishtha','Shatabhisha',
    'P. Bhadra','U. Bhadra','Revati'
]

BHADALI_NAKSHATRAS = {3, 5, 12, 14, 16, 21}  # Rohini, Ardra, Hasta, Swati, Anuradha, Shravana

LUNAR_MONTH_NAMES = {
    1:'Chaitra', 2:'Vaishakh', 3:'Jyeshtha', 4:'Ashadha',
    5:'Shravana', 6:'Bhadrapad', 7:'Ashwin', 8:'Kartik',
    9:'Margashirsha', 10:'Pausha', 11:'Magha', 12:'Phalguna'
}

# =============================================================================
# PLOT 1: Rain Probability by Nakshatra (Bhadali validation)
# =============================================================================
print("\n  Plot 1: Rain probability by Nakshatra...")

fig, ax = plt.subplots(figsize=(16, 7))

nak_stats = df.groupby("Nakshatra").agg(
    rain_prob=("Has_Rain", "mean"),
    mean_rain=("Rainfall", "mean"),
    count=("Has_Rain", "count")
).reset_index()

bar_colors = [LUNAR_ORANGE if n in BHADALI_NAKSHATRAS else CLIMATE_TEAL
              for n in nak_stats["Nakshatra"]]

bars = ax.bar(
    [NAKSHATRA_NAMES[n] for n in nak_stats["Nakshatra"]],
    nak_stats["rain_prob"] * 100,
    color=bar_colors, alpha=0.88, edgecolor="white", linewidth=0.5
)

# Add value labels
for bar, val in zip(bars, nak_stats["rain_prob"]):
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.3,
            f"{val*100:.1f}%", ha="center", va="bottom", fontsize=8, fontweight="bold")

overall_prob = df["Has_Rain"].mean() * 100
ax.axhline(y=overall_prob, color="#e63946", linestyle="--", linewidth=1.5,
           label=f"Overall avg: {overall_prob:.1f}%")

ax.set_xlabel("Nakshatra (Lunar Mansion)")
ax.set_ylabel("Rain Probability (%)")
ax.set_title("🌙 Rain Probability by Nakshatra — Validating Bhadali Vakyo Wisdom")
ax.set_xticklabels([NAKSHATRA_NAMES[n] for n in nak_stats["Nakshatra"]],
                    rotation=45, ha="right", fontsize=9)
ax.legend(handles=[
    Patch(color=LUNAR_ORANGE, label="Bhadali-highlighted Nakshatras"),
    Patch(color=CLIMATE_TEAL, label="Other Nakshatras"),
    plt.Line2D([0],[0], color="#e63946", linestyle="--", linewidth=1.5, label=f"Overall avg: {overall_prob:.1f}%")
], fontsize=10, loc="upper right")
ax.set_ylim(0, max(nak_stats["rain_prob"]*100)*1.15)
plt.tight_layout()
plt.savefig("plots_bhadali/01_nakshatra_rain_probability.png", dpi=150, bbox_inches="tight")
plt.close()
print("    Saved -> plots_bhadali/01_nakshatra_rain_probability.png")

# =============================================================================
# PLOT 2: Mean Rainfall Amount by Nakshatra
# =============================================================================
print("  Plot 2: Mean rainfall by Nakshatra...")

fig, ax = plt.subplots(figsize=(16, 7))

bar_colors2 = [LUNAR_ORANGE if n in BHADALI_NAKSHATRAS else RAIN_BLUE
               for n in nak_stats["Nakshatra"]]

bars = ax.bar(
    [NAKSHATRA_NAMES[n] for n in nak_stats["Nakshatra"]],
    nak_stats["mean_rain"],
    color=bar_colors2, alpha=0.88, edgecolor="white", linewidth=0.5
)

for bar, val in zip(bars, nak_stats["mean_rain"]):
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.05,
            f"{val:.2f}", ha="center", va="bottom", fontsize=8, fontweight="bold")

overall_rain = df["Rainfall"].mean()
ax.axhline(y=overall_rain, color="#e63946", linestyle="--", linewidth=1.5,
           label=f"Overall avg: {overall_rain:.2f} mm")

ax.set_xlabel("Nakshatra (Lunar Mansion)")
ax.set_ylabel("Mean Rainfall (mm)")
ax.set_title("🌧️ Mean Rainfall by Nakshatra — Quantity Validation")
ax.set_xticklabels([NAKSHATRA_NAMES[n] for n in nak_stats["Nakshatra"]],
                    rotation=45, ha="right", fontsize=9)
ax.legend(handles=[
    Patch(color=LUNAR_ORANGE, label="Bhadali-highlighted Nakshatras"),
    Patch(color=RAIN_BLUE, label="Other Nakshatras"),
    plt.Line2D([0],[0], color="#e63946", linestyle="--", linewidth=1.5, label=f"Overall avg: {overall_rain:.2f} mm")
], fontsize=10, loc="upper right")
plt.tight_layout()
plt.savefig("plots_bhadali/02_nakshatra_mean_rainfall.png", dpi=150, bbox_inches="tight")
plt.close()
print("    Saved -> plots_bhadali/02_nakshatra_mean_rainfall.png")

# =============================================================================
# PLOT 3: Moon Phase vs Rainfall (polar plot)
# =============================================================================
print("  Plot 3: Moon phase vs rainfall (polar)...")

fig = plt.figure(figsize=(10, 10))
ax = fig.add_subplot(111, polar=True)

# Bin moon phase angle into 36 bins (each 10°)
n_bins = 36
bins = np.linspace(0, 360, n_bins + 1)
bin_centers = (bins[:-1] + bins[1:]) / 2
bin_rads = np.deg2rad(bin_centers)

df["Phase_Bin"] = pd.cut(df["Moon_Phase_Angle"], bins=bins, labels=bin_centers, include_lowest=True)
phase_rain = df.groupby("Phase_Bin", observed=True).agg(
    rain_prob=("Has_Rain", "mean"),
    mean_rain=("Rainfall", "mean")
).reset_index()

# Convert bin centers to radians
theta = np.deg2rad(phase_rain["Phase_Bin"].astype(float).values)
radii = phase_rain["rain_prob"].values * 100

# Color gradient from blue (low rain) to orange (high rain)
norm = plt.Normalize(radii.min(), radii.max())
colors = plt.cm.YlOrRd(norm(radii))

bars = ax.bar(theta, radii, width=np.deg2rad(10), color=colors,
              alpha=0.85, edgecolor="white", linewidth=0.5)

# Mark key phases
ax.annotate("🌑 New Moon\n(Amavasya)", xy=(0, max(radii)*1.1),
            fontsize=10, ha="center", fontweight="bold")
ax.annotate("🌕 Full Moon\n(Purnima)", xy=(np.pi, max(radii)*1.1),
            fontsize=10, ha="center", fontweight="bold")
ax.annotate("🌓 First Quarter", xy=(np.pi/2, max(radii)*1.1),
            fontsize=9, ha="center")
ax.annotate("🌗 Last Quarter", xy=(3*np.pi/2, max(radii)*1.1),
            fontsize=9, ha="center")

ax.set_title("🌙 Rain Probability by Moon Phase Angle\n"
             "(0° = New Moon, 180° = Full Moon)", pad=40, fontsize=14, fontweight="bold")
ax.set_theta_zero_location("N")
ax.set_theta_direction(-1)

plt.tight_layout()
plt.savefig("plots_bhadali/03_moon_phase_polar.png", dpi=150, bbox_inches="tight")
plt.close()
print("    Saved -> plots_bhadali/03_moon_phase_polar.png")

# =============================================================================
# PLOT 4: Tithi-wise Rain Probability (Shukla vs Krishna Paksha)
# =============================================================================
print("  Plot 4: Tithi-wise rain probability...")

fig, axes = plt.subplots(1, 2, figsize=(18, 7), sharey=True)

for idx, (paksha_val, paksha_name, color) in enumerate([
    (1, "Shukla Paksha (Waxing / Bright Half)", "#ff9f43"),
    (0, "Krishna Paksha (Waning / Dark Half)", "#5f27cd")
]):
    ax = axes[idx]
    subset = df[df["Paksha"] == paksha_val]
    tithi_rain = subset.groupby("Tithi").agg(
        rain_prob=("Has_Rain", "mean"),
        count=("Has_Rain", "count")
    ).reset_index()

    special_tithis = {7: "Saptami", 8: "Ashtami", 15: "Purnima",
                      22: "Saptami", 23: "Ashtami", 30: "Amavasya"}

    bar_colors = []
    for t in tithi_rain["Tithi"]:
        if t in special_tithis:
            bar_colors.append(LUNAR_ORANGE)
        else:
            bar_colors.append(color)

    bars = ax.bar(tithi_rain["Tithi"].astype(str), tithi_rain["rain_prob"]*100,
                  color=bar_colors, alpha=0.85, edgecolor="white", linewidth=0.5)

    # Label special tithis
    for bar, t in zip(bars, tithi_rain["Tithi"]):
        if t in special_tithis:
            ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.3,
                    special_tithis[t], ha="center", va="bottom",
                    fontsize=7, fontweight="bold", color=LUNAR_ORANGE)

    ax.axhline(y=overall_prob, color="#e63946", linestyle="--", linewidth=1,
               alpha=0.7, label=f"Avg: {overall_prob:.1f}%")
    ax.set_xlabel("Tithi (Lunar Day)")
    ax.set_ylabel("Rain Probability (%)" if idx==0 else "")
    ax.set_title(paksha_name, fontsize=13)
    ax.legend(fontsize=9)

fig.suptitle("🕉️ Rain Probability by Tithi — Shukla vs Krishna Paksha",
             fontsize=16, fontweight="bold", y=1.02)
plt.tight_layout()
plt.savefig("plots_bhadali/04_tithi_rain_by_paksha.png", dpi=150, bbox_inches="tight")
plt.close()
print("    Saved -> plots_bhadali/04_tithi_rain_by_paksha.png")

# =============================================================================
# PLOT 5: Bhadali Score vs Rainfall
# =============================================================================
print("  Plot 5: Bhadali Score vs rainfall...")

fig, axes = plt.subplots(1, 3, figsize=(18, 6))

# 5a: Rain probability by Bhadali Score
score_stats = df.groupby("Bhadali_Score").agg(
    rain_prob=("Has_Rain", "mean"),
    mean_rain=("Rainfall", "mean"),
    count=("Has_Rain", "count")
).reset_index()

gradient = [CLIMATE_TEAL, DRY_GOLD, LUNAR_ORANGE, "#e63946"]
bar_c = [gradient[min(int(s), len(gradient)-1)] for s in score_stats["Bhadali_Score"]]

axes[0].bar(score_stats["Bhadali_Score"].astype(str), score_stats["rain_prob"]*100,
            color=bar_c, alpha=0.88, edgecolor="white", linewidth=1)
for i, row in score_stats.iterrows():
    axes[0].text(i, row["rain_prob"]*100+0.5, f"{row['rain_prob']*100:.1f}%",
                 ha="center", fontsize=10, fontweight="bold")
axes[0].set_xlabel("Bhadali Score")
axes[0].set_ylabel("Rain Probability (%)")
axes[0].set_title("Rain Probability by\nBhadali Score")
axes[0].axhline(y=overall_prob, color="#e63946", linestyle="--", linewidth=1, alpha=0.6)

# 5b: Mean rainfall by Bhadali Score
axes[1].bar(score_stats["Bhadali_Score"].astype(str), score_stats["mean_rain"],
            color=bar_c, alpha=0.88, edgecolor="white", linewidth=1)
for i, row in score_stats.iterrows():
    axes[1].text(i, row["mean_rain"]+0.05, f"{row['mean_rain']:.2f}",
                 ha="center", fontsize=10, fontweight="bold")
axes[1].set_xlabel("Bhadali Score")
axes[1].set_ylabel("Mean Rainfall (mm)")
axes[1].set_title("Mean Rainfall by\nBhadali Score")
axes[1].axhline(y=overall_rain, color="#e63946", linestyle="--", linewidth=1, alpha=0.6)

# 5c: Sample count by Bhadali Score (log scale)
axes[2].bar(score_stats["Bhadali_Score"].astype(str), score_stats["count"],
            color=bar_c, alpha=0.88, edgecolor="white", linewidth=1)
for i, row in score_stats.iterrows():
    axes[2].text(i, row["count"]*1.05, f"{row['count']:,.0f}",
                 ha="center", fontsize=9, fontweight="bold")
axes[2].set_xlabel("Bhadali Score")
axes[2].set_ylabel("Number of Data Points")
axes[2].set_title("Sample Count by\nBhadali Score")
axes[2].set_yscale("log")

fig.suptitle("📊 Bhadali Composite Score — Impact on Rainfall",
             fontsize=16, fontweight="bold", y=1.02)
plt.tight_layout()
plt.savefig("plots_bhadali/05_bhadali_score_analysis.png", dpi=150, bbox_inches="tight")
plt.close()
print("    Saved -> plots_bhadali/05_bhadali_score_analysis.png")

# =============================================================================
# PLOT 6: Lunar Month vs Rainfall (comparison with Gregorian)
# =============================================================================
print("  Plot 6: Lunar month rainfall comparison...")

fig, ax = plt.subplots(figsize=(14, 7))

lm_stats = df.groupby("Lunar_Month").agg(
    rain_prob=("Has_Rain", "mean"),
    mean_rain=("Rainfall", "mean")
).reset_index()

greg_stats = df.groupby("Month").agg(
    rain_prob=("Has_Rain", "mean"),
    mean_rain=("Rainfall", "mean")
).reset_index()

x = np.arange(12)
width = 0.35

lunar_labels = [LUNAR_MONTH_NAMES[i+1] for i in range(12)]
greg_labels  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

bars1 = ax.bar(x - width/2, lm_stats["mean_rain"], width,
               label="Indian Lunar Month", color=LUNAR_ORANGE, alpha=0.85, edgecolor="white")
bars2 = ax.bar(x + width/2, greg_stats["mean_rain"], width,
               label="Gregorian Month", color=RAIN_BLUE, alpha=0.85, edgecolor="white")

# Dual x-axis labels
ax.set_xticks(x)
ax.set_xticklabels([f"{lunar_labels[i]}\n({greg_labels[i]})" for i in range(12)],
                    fontsize=9, rotation=30, ha="right")

ax.set_ylabel("Mean Rainfall (mm)")
ax.set_title("🗓️ Rainfall: Indian Lunar Months vs Gregorian Months",
             fontsize=14, fontweight="bold")
ax.legend(fontsize=11)
plt.tight_layout()
plt.savefig("plots_bhadali/06_lunar_vs_gregorian_months.png", dpi=150, bbox_inches="tight")
plt.close()
print("    Saved -> plots_bhadali/06_lunar_vs_gregorian_months.png")

# =============================================================================
# PLOT 7: Key Nakshatra Flags — Rain Lift Analysis
# =============================================================================
print("  Plot 7: Nakshatra flag rain lift analysis...")

flag_features = ["Is_Swati", "Is_Rohini", "Is_Anuradha", "Is_Hasta",
                 "Is_Shravana", "Is_Ardra"]
flag_labels   = ["Swati\n(Flood Warning)", "Rohini\n(Good Monsoon)", "Anuradha\n(Heavy Rain)",
                 "Hasta\n(Beneficial)", "Shravana\n(Steady Monsoon)", "Ardra\n(Intense Rain)"]

fig, axes = plt.subplots(2, 3, figsize=(18, 11))
axes = axes.flatten()

for idx, (feat, label) in enumerate(zip(flag_features, flag_labels)):
    ax = axes[idx]

    # Overall stats
    on_prob  = df[df[feat]==1]["Has_Rain"].mean() * 100
    off_prob = df[df[feat]==0]["Has_Rain"].mean() * 100
    on_rain  = df[df[feat]==1]["Rainfall"].mean()
    off_rain = df[df[feat]==0]["Rainfall"].mean()
    lift     = on_prob - off_prob

    bars = ax.bar(["Other Days", label.split("\n")[0]],
                  [off_prob, on_prob],
                  color=[CLIMATE_TEAL, LUNAR_ORANGE], alpha=0.85,
                  edgecolor="white", linewidth=1)

    ax.text(0, off_prob + 0.3, f"{off_prob:.1f}%", ha="center", fontsize=11, fontweight="bold")
    ax.text(1, on_prob + 0.3,  f"{on_prob:.1f}%",  ha="center", fontsize=11, fontweight="bold",
            color=LUNAR_ORANGE)

    lift_color = "#2d6a4f" if lift > 0 else "#e63946"
    ax.text(0.5, max(on_prob, off_prob) * 0.5,
            f"Lift: {lift:+.1f}%\nRain: {on_rain:.2f} vs {off_rain:.2f} mm",
            ha="center", fontsize=10, fontweight="bold", color=lift_color,
            bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8))

    ax.set_title(label, fontsize=12, fontweight="bold")
    ax.set_ylabel("Rain Probability (%)")

fig.suptitle("🔍 Key Bhadali Nakshatra Flags — Rain Probability Lift",
             fontsize=16, fontweight="bold", y=1.02)
plt.tight_layout()
plt.savefig("plots_bhadali/07_nakshatra_flag_lift.png", dpi=150, bbox_inches="tight")
plt.close()
print("    Saved -> plots_bhadali/07_nakshatra_flag_lift.png")

# =============================================================================
# PLOT 8: Feature Correlation Heatmap (Bhadali features)
# =============================================================================
print("  Plot 8: Bhadali feature correlation heatmap...")

bhadali_cols = [
    "Moon_Phase_Angle", "Moon_Illumination", "Tithi", "Paksha",
    "Nakshatra", "Lunar_Month", "Vara",
    "Is_Swati", "Is_Rohini", "Is_Anuradha", "Is_Hasta", "Is_Ardra",
    "Is_Purnima", "Is_Amavas", "Is_Saptami",
    "Bhadali_Score", "Swati_x_Monsoon", "Rohini_x_Paksha", "Purnima_x_Monsoon",
    "Rainfall", "Has_Rain"
]

existing_cols = [c for c in bhadali_cols if c in df.columns]
corr_df = df[existing_cols].corr()

fig, ax = plt.subplots(figsize=(16, 14))
mask = np.triu(np.ones_like(corr_df, dtype=bool))
sns.heatmap(corr_df, mask=mask, annot=True, fmt=".2f", cmap="RdYlBu_r",
            center=0, vmin=-1, vmax=1, linewidths=0.5, linecolor="white",
            ax=ax, annot_kws={"size": 8},
            cbar_kws={"label": "Pearson Correlation", "shrink": 0.8})

ax.set_title("📈 Bhadali Feature Correlation Matrix\n(including Rainfall & Rain Occurrence)",
             fontsize=14, fontweight="bold", pad=20)
plt.tight_layout()
plt.savefig("plots_bhadali/08_bhadali_correlation_heatmap.png", dpi=150, bbox_inches="tight")
plt.close()
print("    Saved -> plots_bhadali/08_bhadali_correlation_heatmap.png")

# =============================================================================
# SUMMARY
# =============================================================================
print("\n" + "=" * 60)
print("ALL PLOTS SAVED!")
print("=" * 60)
print("""
  Output directory: plots_bhadali/

  Generated plots:
    01_nakshatra_rain_probability.png   — Rain % by Nakshatra (Bhadali validation)
    02_nakshatra_mean_rainfall.png      — Avg rainfall by Nakshatra (mm)
    03_moon_phase_polar.png             — Polar plot: rain % by moon phase angle
    04_tithi_rain_by_paksha.png         — Tithi-wise rain: Shukla vs Krishna
    05_bhadali_score_analysis.png       — Composite Bhadali Score impact
    06_lunar_vs_gregorian_months.png    — Lunar vs Gregorian month comparison
    07_nakshatra_flag_lift.png          — Key nakshatra flags lift analysis
    08_bhadali_correlation_heatmap.png  — Full correlation heatmap
""")
