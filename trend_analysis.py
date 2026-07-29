"""
================================================================================
MANN-KENDALL TREND ANALYSIS & CLIMATE FINGERPRINT ENGINE
================================================================================
Runs Mann-Kendall non-parametric trend test and Sen's slope estimator across
all 362 grid cells for 75 years of historical data (1951–2025).

Evaluates trends for:
  - Annual Total Rainfall
  - Mean Max Temperature (Tmax)
  - Mean Min Temperature (Tmin)
  - ETCCDI Extreme Indices (R95p, CDD, CWD, R10mm, R20mm, SDII, WSDI, CSDI)

Outputs:
  - trend_results.csv : Full grid-wise table of trends, Sen's slopes, p-values, significance.
  - trend_summary.json : High-level climate fingerprint stats (e.g. % area wetting/drying/warming).
  - plots/climate_fingerprint_*.png : Choropleth maps of trends across India.

Usage:
  py trend_analysis.py
================================================================================
"""

import pandas as pd
import numpy as np
import scipy.stats as stats
import json
import os
import time
import warnings
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

warnings.filterwarnings("ignore")
os.makedirs("plots", exist_ok=True)

MERGED_CSV = "merged_climate_data.csv"
ETCCDI_CSV = "etccdi_indices.csv"
OUTPUT_CSV = "trend_results.csv"
SUMMARY_JSON = "trend_summary.json"

def mann_kendall_test(x, alpha=0.05):
    """
    Perform Original Mann-Kendall Trend Test.
    Returns (trend_direction, p_value, sen_slope, is_significant)
    """
    x = np.asarray(x, dtype=float)
    x = x[~np.isnan(x)]
    n = len(x)
    if n < 4:
        return "no trend", 1.0, 0.0, False

    # Calculate S statistic
    # s = sum_{i<j} sgn(x[j] - x[i])
    diff = x[:, None] - x[None, :]
    s = np.sum(np.sign(diff[np.triu_indices(n, k=1)]))

    # Calculate Var(S) with tie adjustment
    unique_x, tp = np.unique(x, return_counts=True)
    g = len(unique_x)
    if n == g:  # no ties
        var_s = (n * (n - 1) * (2 * n + 5)) / 18.0
    else:
        var_s = (n * (n - 1) * (2 * n + 5) - np.sum(tp * (tp - 1) * (2 * tp + 5))) / 18.0

    if var_s == 0:
        return "no trend", 1.0, 0.0, False

    # Compute Z test statistic
    if s > 0:
        z = (s - 1) / np.sqrt(var_s)
    elif s < 0:
        z = (s + 1) / np.sqrt(var_s)
    else:
        z = 0.0

    # Compute p-value (two-tailed)
    p = 2 * (1 - stats.norm.cdf(abs(z)))
    h = p < alpha

    # Sen's Slope
    # Median of all pairwise slopes: (x[j] - x[i]) / (j - i)
    idx_i, idx_j = np.triu_indices(n, k=1)
    slopes = (x[idx_j] - x[idx_i]) / (idx_j - idx_i)
    sen_slope = float(np.median(slopes))

    if h:
        trend = "increasing" if z > 0 else "decreasing"
    else:
        trend = "no trend"

    return trend, float(p), float(sen_slope), bool(h)

def main():
    t0 = time.time()
    print("=" * 65)
    print("MANN-KENDALL TREND ANALYSIS & CLIMATE FINGERPRINT")
    print("=" * 65)

    # 1. Prepare Annual Data for Temperature & Rainfall
    print("\nStep 1: Aggregating annual rainfall and temperatures per grid cell...")
    dtypes = {
        "Year": "int16", "Latitude": "float32", "Longitude": "float32",
        "Max_Temp": "float32", "Min_Temp": "float32", "Rainfall": "float32"
    }
    df_climate = pd.read_csv(MERGED_CSV, usecols=list(dtypes.keys()), dtype=dtypes)
    df_climate["Rainfall"] = df_climate["Rainfall"].fillna(0.0)

    annual_climate = df_climate.groupby(["Latitude", "Longitude", "Year"]).agg(
        Annual_Rainfall=("Rainfall", "sum"),
        Mean_Tmax=("Max_Temp", "mean"),
        Mean_Tmin=("Min_Temp", "mean")
    ).reset_index()

    del df_climate

    # 2. Load ETCCDI Indices if available
    if os.path.exists(ETCCDI_CSV):
        print(f"\nStep 2: Merging with {ETCCDI_CSV}...")
        df_etccdi = pd.read_csv(ETCCDI_CSV)
        annual_full = annual_climate.merge(df_etccdi, on=["Latitude", "Longitude", "Year"], how="left")
    else:
        print("\nStep 2: ETCCDI CSV not found yet, analyzing base climate variables...")
        annual_full = annual_climate

    # Define variables to analyze
    target_vars = [c for c in annual_full.columns if c not in ["Latitude", "Longitude", "Year"]]

    print(f"\nStep 3: Running Mann-Kendall trend test for {len(target_vars)} variables across grid cells...")
    
    records = []
    grid_groups = annual_full.groupby(["Latitude", "Longitude"])
    total_cells = len(grid_groups)
    
    for idx, ((lat, lon), gdf) in enumerate(grid_groups):
        gdf = gdf.sort_values("Year")
        for var in target_vars:
            series = gdf[var].values
            trend, p_val, sen_slope, is_sig = mann_kendall_test(series)
            
            records.append({
                "Latitude": float(lat),
                "Longitude": float(lon),
                "Variable": var,
                "Trend": trend,
                "Sen_Slope": round(sen_slope, 5),
                "p_value": round(p_val, 5),
                "Is_Significant": is_sig,
                "Mean_Value": round(float(np.nanmean(series)), 2)
            })

    results_df = pd.DataFrame(records)
    results_df.to_csv(OUTPUT_CSV, index=False)
    print(f"  Saved {len(results_df):,} trend results to {OUTPUT_CSV}")

    # 4. Generate Climate Fingerprint Summary JSON
    print("\nStep 4: Compiling Climate Change Fingerprint Summary...")
    summary = {}
    for var in target_vars:
        var_df = results_df[results_df["Variable"] == var]
        n_total = len(var_df)
        n_inc_sig = len(var_df[(var_df["Trend"] == "increasing") & var_df["Is_Significant"]])
        n_dec_sig = len(var_df[(var_df["Trend"] == "decreasing") & var_df["Is_Significant"]])
        n_no_sig  = n_total - (n_inc_sig + n_dec_sig)

        summary[var] = {
            "total_grid_cells": n_total,
            "significantly_increasing_pct": round(100.0 * n_inc_sig / n_total, 1),
            "significantly_decreasing_pct": round(100.0 * n_dec_sig / n_total, 1),
            "non_significant_pct": round(100.0 * n_no_sig / n_total, 1),
            "max_positive_slope": round(float(var_df["Sen_Slope"].max()), 4),
            "max_negative_slope": round(float(var_df["Sen_Slope"].min()), 4),
            "avg_slope": round(float(var_df["Sen_Slope"].mean()), 4),
        }

    with open(SUMMARY_JSON, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print(f"  Saved summary to {SUMMARY_JSON}")

    # Print Key Highlights
    print("\n" + "=" * 65)
    print("CLIMATE CHANGE FINGERPRINT HIGHLIGHTS (1951–2025)")
    print("=" * 65)
    for var, stats_dict in summary.items():
        print(f"  {var:<18s}: {stats_dict['significantly_increasing_pct']:>5.1f}% cells increasing | "
              f"{stats_dict['significantly_decreasing_pct']:>5.1f}% cells decreasing | "
              f"Avg slope: {stats_dict['avg_slope']:+.4f}/yr")

    # 5. Plot Fingerprint Maps for Key Variables
    print("\nStep 5: Plotting Climate Fingerprint trend maps...")
    for var in ["Annual_Rainfall", "Mean_Tmax", "Mean_Tmin", "CDD", "R95p"]:
        var_df = results_df[results_df["Variable"] == var]
        if len(var_df) == 0:
            continue

        fig, ax = plt.subplots(figsize=(9, 8))
        # Color coding: Increasing & Sig (Dark Red/Blue), Decreasing & Sig (Orange/Blue), Non-sig (Gray)
        if "Temp" in var or var in ["CDD", "WSDI"]:
            c_inc, c_dec = "#d62728", "#1f77b4"  # Red for warming/drought, Blue for cooling
        else:
            c_inc, c_dec = "#1f77b4", "#d62728"  # Blue for wetter, Red for drier

        colors = []
        sizes = []
        for _, row in var_df.iterrows():
            if row["Is_Significant"]:
                colors.append(c_inc if row["Trend"] == "increasing" else c_dec)
                sizes.append(45)
            else:
                colors.append("#cccccc")
                sizes.append(15)

        ax.scatter(var_df["Longitude"], var_df["Latitude"], c=colors, s=sizes, alpha=0.85)
        ax.set_title(f"Mann-Kendall Trend: {var} (1951–2025)\nLarge Colored Dots = Statistically Significant (p < 0.05)", fontweight="bold")
        ax.set_xlabel("Longitude (°E)")
        ax.set_ylabel("Latitude (°N)")
        ax.grid(True, linestyle="--", alpha=0.3)
        plt.tight_layout()
        plt.savefig(f"plots/climate_fingerprint_{var.lower()}.png", dpi=150)
        plt.close()
        print(f"  Saved -> plots/climate_fingerprint_{var.lower()}.png")

    print("\n" + "=" * 65)
    print(f"DONE in {time.time()-t0:.1f}s!")
    print("=" * 65)

if __name__ == "__main__":
    main()
