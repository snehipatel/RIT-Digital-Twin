"""
================================================================================
BHADALI VAKYO FEATURE GENERATOR
================================================================================
Converts ancient Indian rain prediction wisdom (Bhadali Vakyo) into ML features.
Calculates lunar calendar features for every date in merged_climate_data.csv.

Features generated:
  - Tithi (lunar day 1-30)
  - Paksha (Shukla=waxing / Krishna=waning)
  - Nakshatra (which of 27 lunar mansions moon is in)
  - Key nakshatra flags (Swati=flood, Rohini=good crop, Anuradha=heavy rain)
  - Moon phase angle (continuous 0-360°)
  - Purnima / Amavas flags
  - Bhadali Score (composite: how many ancient rules fire today)
  - Indian lunar month (Chaitra, Vaishakh, ... Phalguna)

OUTPUT: bhadali_features.csv  (Date + all lunar features, one row per unique date)
        -> merge into main dataset before training

HOW TO USE:
  1. Run this script first:  py bhadali_features.py
  2. Then run the main model: py juhi_rainfall_89.py  (modified to load bhadali_features.csv)
================================================================================
"""

import ephem
import math
import pandas as pd
# pyrefly: ignore [missing-import]
import numpy as np
from datetime import date, timedelta
import warnings
warnings.filterwarnings("ignore")

# =============================================================================
# LUNAR CALCULATION ENGINE
# =============================================================================

NAKSHATRAS = [
    'Ashwini','Bharani','Krittika','Rohini','Mrigashira',
    'Ardra','Punarvasu','Pushya','Ashlesha','Magha',
    'Purva_Phalguni','Uttara_Phalguni','Hasta','Chitra','Swati',
    'Vishakha','Anuradha','Jyeshtha','Mula','Purva_Ashadha',
    'Uttara_Ashadha','Shravana','Dhanishtha','Shatabhisha',
    'Purva_Bhadrapada','Uttara_Bhadrapada','Revati'
]

# Indian lunar months (determined by which nakshatra full moon falls near)
# Approximate solar month → lunar month mapping
SOLAR_TO_LUNAR_MONTH = {
    4:  1,   # Chaitra      (Apr)
    5:  2,   # Vaishakh     (May)
    6:  3,   # Jyeshtha     (Jun)
    7:  4,   # Ashadha      (Jul)
    8:  5,   # Shravana     (Aug)
    9:  6,   # Bhadrapad    (Sep)
    10: 7,   # Ashwin       (Oct)
    11: 8,   # Kartik       (Nov)
    12: 9,   # Margashirsha (Dec)
    1:  10,  # Pausha       (Jan)
    2:  11,  # Magha        (Feb)
    3:  12,  # Phalguna     (Mar)
}

LUNAR_MONTH_NAMES = {
    1:'Chaitra', 2:'Vaishakh', 3:'Jyeshtha', 4:'Ashadha',
    5:'Shravana', 6:'Bhadrapad', 7:'Ashwin', 8:'Kartik',
    9:'Margashirsha', 10:'Pausha', 11:'Magha', 12:'Phalguna'
}

def get_lunar_features(dt):
    """
    Calculate all lunar/astronomical features for a given date.
    Uses India's geographic center (Nagpur: 21°N, 79°E) as reference.
    """
    obs = ephem.Observer()
    obs.lat  = '21.0'   # India center latitude
    obs.long = '79.0'   # India center longitude
    obs.date = dt.strftime('%Y/%m/%d 06:00:00')  # 6 AM IST ≈ midnight UTC

    moon = ephem.Moon(obs)
    sun  = ephem.Sun(obs)
    moon.compute(obs)
    sun.compute(obs)

    # ── Moon-Sun elongation (phase angle) ────────────────────────────────────
    moon_lon = math.degrees(float(moon.hlong))  # ecliptic longitude of moon
    sun_lon  = math.degrees(float(sun.hlong))   # ecliptic longitude of sun
    phase_angle = (moon_lon - sun_lon) % 360    # 0=New Moon, 180=Full Moon

    # Moon illumination
    moon_illumination = float(moon.phase)

    # Determine waxing / waning
    obs2 = ephem.Observer()
    obs2.lat = '21.0'
    obs2.long = '79.0'
    obs2.date = (dt + timedelta(days=1)).strftime('%Y/%m/%d 06:00:00')

    moon2 = ephem.Moon(obs2)
    moon2.compute(obs2)

    is_waxing = moon2.phase >= moon.phase

    # Approximate Tithi

    if is_waxing:
        tithi = max(1, min(15, round((moon.phase/100)*15)))
        paksha = 1
    else:
        tithi = max(16, min(30, 30-round((moon.phase/100)*14)))
        paksha = 0

    # ── Nakshatra (27 lunar mansions) ─────────────────────────────────────────
    # Moon moves through 27 nakshatras, each covering 360/27 = 13.333°
    nakshatra_num = int(moon_lon / (360 / 27)) % 27

    # ── Key Nakshatra flags from Bhadali Vakyo ────────────────────────────────
    is_swati    = int(nakshatra_num == 14)  # Swati → flood warning
    is_rohini   = int(nakshatra_num == 3)   # Rohini → good monsoon/crops
    is_anuradha = int(nakshatra_num == 16)  # Anuradha → heavy rain
    is_hasta    = int(nakshatra_num == 12)  # Hasta → beneficial rains
    is_shravana = int(nakshatra_num == 21)  # Shravana → steady monsoon
    is_ardra    = int(nakshatra_num == 5)   # Ardra → intense rain (Rahu's star)
    is_purvashadha = int(nakshatra_num == 19)  # Purvashadha → good rains

    # ── Special tithis ───────────────────────────────────────────────────────
    is_purnima  = int(tithi == 15)   # Full moon
    is_amavas   = int(tithi == 30)   # New moon
    is_saptami  = int(tithi == 7 or tithi == 22)   # 7th tithi (Bhadali rule)
    is_ashtami  = int(tithi == 8 or tithi == 23)   # 8th tithi
    is_navami   = int(tithi == 9 or tithi == 24)   # 9th tithi
    is_ekadashi = int(tithi == 11 or tithi == 26)  # 11th tithi

    # ── Indian lunar month (approximate) ─────────────────────────────────────
    solar_month   = dt.month
    lunar_month   = SOLAR_TO_LUNAR_MONTH.get(solar_month, 1)

    # ── Vara (day of week, 0=Sun to 6=Sat) ───────────────────────────────────
    vara = dt.weekday()  # 0=Mon in Python, convert: Sun=0
    vara_indian = (dt.weekday() + 1) % 7  # 0=Sun, 1=Mon, ..., 6=Sat

    # ── Bhadali Score (composite rule match) ─────────────────────────────────
    # Count how many Bhadali Vakyo rules apply to this date
    # Each rule that fires adds to the score
    bhadali_score = 0

    # Rule 1: Shravan month + Shukla Saptami + Swati → heavy flood
    if lunar_month == 5 and paksha == 1 and tithi == 7 and is_swati:
        bhadali_score += 3  # High weight — strongest rule

    # Rule 2: Posh Shukla 7/8/9 → monsoon garbha confirmed
    if lunar_month == 10 and paksha == 1 and tithi in [7, 8, 9]:
        bhadali_score += 2

    # Rule 3: Maha Shukla Saptami → rain all 4 monsoon months
    if lunar_month == 11 and paksha == 1 and tithi == 7:
        bhadali_score += 2

    # Rule 4: Akha Teej + Rohini → abundant monsoon (Akha Teej = Vaishakh Shukla 3)
    if lunar_month == 2 and paksha == 1 and tithi == 3 and is_rohini:
        bhadali_score += 2

    # Rule 5: Bhadrapad Shukla 6 + Anuradha → heavy rain
    if lunar_month == 6 and paksha == 1 and tithi == 6 and is_anuradha:
        bhadali_score += 2

    # Rule 6: Shukla Purnima in monsoon months → strong monsoon
    if is_purnima and lunar_month in [3, 4, 5, 6]:  # Jyeshtha to Bhadrapad
        bhadali_score += 1

    # Rule 7: Ardra nakshatra in Ashadha → intense rain onset
    if lunar_month == 4 and is_ardra:
        bhadali_score += 1

    # Rule 8: Swati in any monsoon month → rain likely
    if is_swati and lunar_month in [4, 5, 6]:
        bhadali_score += 1

    return {
        'Moon_Phase_Angle': round(phase_angle,2),
        'Moon_Phase_Sin': round(math.sin(math.radians(phase_angle)),6),
        'Moon_Phase_Cos': round(math.cos(math.radians(phase_angle)),6),
        'Moon_Illumination':   round(moon_illumination, 2),
        'Tithi': tithi,
        'Tithi_Sin': round(math.sin(2*math.pi*tithi/30),6),
        'Tithi_Cos': round(math.cos(2*math.pi*tithi/30),6),
        'Paksha':              paksha,           # 1=Shukla/bright, 0=Krishna/dark
        'Nakshatra': nakshatra_num,
        'Nakshatra_Sin': round(math.sin(2*math.pi*nakshatra_num/27),6),
        'Nakshatra_Cos': round(math.cos(2*math.pi*nakshatra_num/27),6),   # 0-26
        'Lunar_Month':         lunar_month,      # 1-12
        'Vara':                vara_indian,      # 0=Sun, 6=Sat
        # Key nakshatra flags
        'Is_Swati':            is_swati,
        'Is_Rohini':           is_rohini,
        'Is_Anuradha':         is_anuradha,
        'Is_Hasta':            is_hasta,
        'Is_Shravana':         is_shravana,
        'Is_Ardra':            is_ardra,
        # Special tithi flags
        'Is_Purnima':          is_purnima,
        'Is_Amavas':           is_amavas,
        'Is_Saptami':          is_saptami,

        'Monsoon_Season': int(dt.month in [6,7,8,9]),
        'Pre_Monsoon': int(dt.month in [4,5]),
        'Post_Monsoon': int(dt.month in [10,11]),
        # Composite score
        'Bhadali_Score':       bhadali_score,
        # Interactions (most powerful Bhadali combinations)
        'Swati_x_Monsoon':     is_swati * int(lunar_month in [4,5,6]),
        'Rohini_x_Paksha':     is_rohini * paksha,
        'Purnima_x_Monsoon':   is_purnima * int(lunar_month in [3,4,5,6]),
    }

if __name__ == "__main__":
    print("=" * 60)
    print("BHADALI VAKYO FEATURE GENERATOR")
    print("=" * 60)

    # Get all unique dates from merged_climate_data.csv
    print("\nStep 1: Reading dates from merged_climate_data.csv...")
    df_dates = pd.read_csv("merged_climate_data.csv", usecols=["Date"],
                            parse_dates=["Date"])
    unique_dates = sorted(df_dates["Date"].dt.date.unique())
    print(f"  Unique dates: {len(unique_dates):,}")
    print(f"  Range: {unique_dates[0]} -> {unique_dates[-1]}")
    del df_dates

    # Calculate lunar features for each unique date
    print(f"\nStep 2: Calculating lunar features for {len(unique_dates):,} dates...")
    print("  (This takes ~2-3 minutes -- one calculation per day)")

    records = []
    for i, dt in enumerate(unique_dates):
        try:
            feats = get_lunar_features(dt)
            feats["Date"] = pd.Timestamp(dt)
            records.append(feats)
        except Exception as e:
            print(f"  Warning: failed for {dt}: {e}")

        if i % 5000 == 0 and i > 0:
            print(f"  Processed {i:,}/{len(unique_dates):,} dates...")

    print(f"  Done! Processed {len(records):,} dates.")

    # Save to CSV
    print("\nStep 3: Saving bhadali_features.csv...")
    df_bhadali = pd.DataFrame(records)
    df_bhadali = df_bhadali.sort_values("Date").reset_index(drop=True)
    df_bhadali.to_csv("bhadali_features.csv", index=False)
    print(f"  Saved: {len(df_bhadali):,} rows to bhadali_features.csv")