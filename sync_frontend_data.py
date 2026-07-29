"""
================================================================================
FRONTEND DATA SYNC ENGINE
================================================================================
Copies all generated backend artifacts (JSON, CSV, maps, plots) to the frontend
public data directories (`dashboard/public/data` and `frontend/public/data`)
ensuring 100% real-time data binding for the React dashboard.

Usage:
  py sync_frontend_data.py
================================================================================
"""

import os
import shutil
import json

TARGET_DIRS = ["frontend/data", "frontend/public/data"]

FILES_TO_SYNC = [
    "whatif_precomputed.json",
    "trend_summary.json",
    "trend_results.csv",
    "baseline_metrics.json",
    "spatial_validation_report.json",
    "seasonal_metrics.json",
    "seasonal_predictions_2026.csv",
    "insat_map_data.json",
    "insat_daily_lst.csv",
    "insat_validation_report.json",
    "sample_prediction.json",
    "model_metrics_v2.json",
    "model_metrics.json",
    "rainfall_metrics_v2.json",
    "rainfall_metrics.json",
    "etccdi_indices.csv"
]

PLOT_DIRS = ["plots", "plots_rainfall", "plots_insat", "plots_bhadali"]

def sync_data():
    print("=" * 65)
    print("FRONTEND DATA SYNC ENGINE")
    print("=" * 65)

    for target in TARGET_DIRS:
        os.makedirs(target, exist_ok=True)
        print(f"\nSyncing data to target: {target}...")

        # Sync Files
        synced_count = 0
        for fname in FILES_TO_SYNC:
            if os.path.exists(fname):
                dest = os.path.join(target, fname)
                shutil.copy(fname, dest)
                synced_count += 1
                print(f"  [OK] Copied {fname} -> {dest}")
            else:
                print(f"  [!] Missing (pending generation): {fname}")

        # Sync Plots to public/plots
        target_plots = os.path.join(os.path.dirname(target), "plots")
        os.makedirs(target_plots, exist_ok=True)
        
        for pdir in PLOT_DIRS:
            if os.path.exists(pdir):
                for pfile in os.listdir(pdir):
                    if pfile.endswith(".png") or pfile.endswith(".jpg") or pfile.endswith(".json"):
                        src_p = os.path.join(pdir, pfile)
                        dest_p = os.path.join(target_plots, pfile)
                        shutil.copy(src_p, dest_p)

        print(f"  Synced {synced_count}/{len(FILES_TO_SYNC)} files to {target}")

    print("\n" + "=" * 65)
    print("ALL FRONTEND DATA DIRECTORIES FULLY SYNCED!")
    print("=" * 65)

if __name__ == "__main__":
    sync_data()
