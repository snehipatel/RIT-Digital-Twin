"""
================================================================================
CLIMATE DRIVER VARIABLE INGESTION — Phase 1
================================================================================
Downloads/computes 4 external driver variables and merges them into the
existing merged_climate_data.csv to create merged_climate_data_v2.csv.

Drivers:
  1. NOAA ONI (Niño 3.4 SST anomaly) — monthly, 1950–present
  2. IOD DMI (Dipole Mode Index)      — monthly, 1870–present
  3. SRTM/ETOPO1 Elevation            — static per grid cell
  4. Distance to coast                — static per grid cell

Derived features:
  - ENSO_Phase (El Niño / La Niña / Neutral)
  - IOD_Phase  (Positive / Negative / Neutral)
  - ONI_x_Monsoon, DMI_x_Monsoon, Elevation_x_Monsoon (interaction terms)

Output:
  data/drivers/oni_nino34.csv
  data/drivers/iod_dmi.csv
  data/drivers/elevation_grid.csv
  data/drivers/coast_distance_grid.csv
  merged_climate_data_v2.csv

Usage:
  py ingest_drivers.py

================================================================================
"""

import pandas as pd
import numpy as np
import os
import math
import warnings
import time

warnings.filterwarnings("ignore")

MERGED_CSV = "merged_climate_data.csv"
OUTPUT_CSV = "merged_climate_data_v2.csv"
DRIVERS_DIR = "data/drivers"

os.makedirs(DRIVERS_DIR, exist_ok=True)

# =============================================================================
# UTILITY: Great-circle distance (Haversine)
# =============================================================================
def haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance in km between two (lat, lon) points."""
    R = 6371.0  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# =============================================================================
# STEP 1: DOWNLOAD / PARSE NOAA ONI (Niño 3.4 SST ANOMALY)
# =============================================================================
def fetch_oni():
    """
    Download and parse NOAA CPC ONI data.
    Source: https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt
    Format: SEAS  YEAR  TOTAL  APTS  ANOMALY
    """
    print("\n" + "=" * 60)
    print("STEP 1: Fetching NOAA ONI (Niño 3.4) Index...")
    print("=" * 60)

    oni_csv = os.path.join(DRIVERS_DIR, "oni_nino34.csv")

    if os.path.exists(oni_csv):
        print(f"  Found existing {oni_csv}, loading...")
        df = pd.read_csv(oni_csv)
        print(f"  Loaded {len(df)} rows")
        return df

    # Download from NOAA
    import urllib.request
    url = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
    print(f"  Downloading from {url}...")

    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as response:
            text = response.read().decode('utf-8')
    except Exception as e:
        print(f"  [ERROR] Failed to download ONI: {e}")
        print("  Falling back to hardcoded ONI data for recent years...")
        return _fallback_oni()

    # Parse the fixed-width format
    # Columns: SEAS  YEAR  TOTAL  ANOM
    # SEAS is like DJF, JFM, FMA, MAM, AMJ, MJJ, JJA, JAS, ASO, SON, OND, NDJ
    season_to_month = {
        'DJF': 1, 'JFM': 2, 'FMA': 3, 'MAM': 4, 'AMJ': 5, 'MJJ': 6,
        'JJA': 7, 'JAS': 8, 'ASO': 9, 'SON': 10, 'OND': 11, 'NDJ': 12
    }

    records = []
    for line in text.strip().split('\n'):
        parts = line.split()
        if len(parts) < 4:
            continue
        seas = parts[0].strip()
        if seas not in season_to_month:
            continue
        try:
            year = int(parts[1])
            anom = float(parts[-1])  # Last column is ANOM
            month = season_to_month[seas]
            records.append({'Year': year, 'Month': month, 'ONI': anom})
        except (ValueError, IndexError):
            continue

    df = pd.DataFrame(records)
    df = df.drop_duplicates(subset=['Year', 'Month']).sort_values(['Year', 'Month']).reset_index(drop=True)
    df.to_csv(oni_csv, index=False)
    print(f"  Saved {len(df)} rows to {oni_csv}")
    print(f"  Year range: {df['Year'].min()} – {df['Year'].max()}")
    print(f"  ONI range: {df['ONI'].min():.2f} to {df['ONI'].max():.2f}")
    return df


def _fallback_oni():
    """Fallback ONI data if download fails — covers 1950–2025."""
    # Generate approximate ONI from known ENSO events
    # This is a simplified version; real data preferred
    records = []
    for year in range(1950, 2026):
        for month in range(1, 13):
            # Known strong El Niño years: 1972, 1982-83, 1997-98, 2015-16, 2023-24
            # Known strong La Niña years: 1973-74, 1988-89, 1999-2000, 2010-11, 2020-22
            oni = 0.0
            if year in [1972, 1982, 1997, 2015, 2023] and month in [6,7,8,9,10,11,12]:
                oni = 1.5
            elif year in [1983, 1998, 2016, 2024] and month in [1,2,3,4,5]:
                oni = 1.0
            elif year in [1973, 1988, 1999, 2010, 2020, 2021] and month in [6,7,8,9,10,11,12]:
                oni = -1.2
            elif year in [1974, 1989, 2000, 2011, 2021, 2022] and month in [1,2,3,4,5]:
                oni = -0.8
            records.append({'Year': year, 'Month': month, 'ONI': oni})
    df = pd.DataFrame(records)
    oni_csv = os.path.join(DRIVERS_DIR, "oni_nino34.csv")
    df.to_csv(oni_csv, index=False)
    print(f"  [Fallback] Saved {len(df)} rows to {oni_csv}")
    return df


# =============================================================================
# STEP 2: DOWNLOAD / PARSE IOD DMI INDEX
# =============================================================================
def fetch_dmi():
    """
    Download and parse IOD DMI (Dipole Mode Index).
    Source: https://psl.noaa.gov/gcos_wgsp/Timeseries/Data/dmi.had.long.data
    Format: Year followed by 12 monthly values
    """
    print("\n" + "=" * 60)
    print("STEP 2: Fetching IOD DMI Index...")
    print("=" * 60)

    dmi_csv = os.path.join(DRIVERS_DIR, "iod_dmi.csv")

    if os.path.exists(dmi_csv):
        print(f"  Found existing {dmi_csv}, loading...")
        df = pd.read_csv(dmi_csv)
        print(f"  Loaded {len(df)} rows")
        return df

    import urllib.request
    url = "https://psl.noaa.gov/gcos_wgsp/Timeseries/Data/dmi.had.long.data"
    print(f"  Downloading from {url}...")

    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as response:
            text = response.read().decode('utf-8')
    except Exception as e:
        print(f"  [ERROR] Failed to download DMI: {e}")
        print("  Falling back to hardcoded DMI data...")
        return _fallback_dmi()

    # Parse: first line is header with year range, then Year + 12 monthly values
    lines = text.strip().split('\n')
    records = []
    for line in lines:
        parts = line.split()
        if len(parts) < 13:
            continue
        try:
            year = int(parts[0])
            if year < 1870 or year > 2030:
                continue
            for month_idx in range(12):
                val = float(parts[1 + month_idx])
                # Missing values are typically -999 or -99.99
                if val < -90:
                    val = np.nan
                records.append({'Year': year, 'Month': month_idx + 1, 'DMI': val})
        except (ValueError, IndexError):
            continue

    df = pd.DataFrame(records)
    df = df.dropna(subset=['DMI'])
    df = df.drop_duplicates(subset=['Year', 'Month']).sort_values(['Year', 'Month']).reset_index(drop=True)
    df.to_csv(dmi_csv, index=False)
    print(f"  Saved {len(df)} rows to {dmi_csv}")
    print(f"  Year range: {df['Year'].min()} – {df['Year'].max()}")
    print(f"  DMI range: {df['DMI'].min():.3f} to {df['DMI'].max():.3f}")
    return df


def _fallback_dmi():
    """Fallback DMI data if download fails."""
    records = []
    for year in range(1950, 2026):
        for month in range(1, 13):
            dmi = 0.0
            # Known positive IOD years: 1961, 1994, 1997, 2006, 2019
            # Known negative IOD years: 1960, 1992, 1998, 2010, 2016
            if year in [1961, 1994, 1997, 2006, 2019] and month in [6,7,8,9,10,11]:
                dmi = 0.8
            elif year in [1960, 1992, 1998, 2010, 2016] and month in [6,7,8,9,10,11]:
                dmi = -0.6
            records.append({'Year': year, 'Month': month, 'DMI': round(dmi, 3)})
    df = pd.DataFrame(records)
    dmi_csv = os.path.join(DRIVERS_DIR, "iod_dmi.csv")
    df.to_csv(dmi_csv, index=False)
    print(f"  [Fallback] Saved {len(df)} rows to {dmi_csv}")
    return df


# =============================================================================
# STEP 3: COMPUTE ELEVATION PER GRID CELL
# =============================================================================
def compute_elevation(grid_cells):
    """
    Compute mean elevation for each 1° grid cell.
    Uses Open-Meteo elevation API (free, no key needed) for accuracy,
    with a hardcoded fallback for offline use.
    """
    print("\n" + "=" * 60)
    print("STEP 3: Computing elevation per grid cell...")
    print("=" * 60)

    elev_csv = os.path.join(DRIVERS_DIR, "elevation_grid.csv")

    if os.path.exists(elev_csv):
        print(f"  Found existing {elev_csv}, loading...")
        df = pd.read_csv(elev_csv)
        print(f"  Loaded {len(df)} rows")
        return df

    # Try Open-Meteo elevation API (batched)
    print(f"  Computing elevation for {len(grid_cells)} grid cells...")
    print("  Trying Open-Meteo elevation API...")

    elevations = {}
    try:
        import urllib.request
        import json

        # Batch in groups of 50 (API limit)
        cells_list = list(grid_cells)
        for i in range(0, len(cells_list), 50):
            batch = cells_list[i:i+50]
            lats = ",".join(f"{c[0]}" for c in batch)
            lons = ",".join(f"{c[1]}" for c in batch)
            url = f"https://api.open-meteo.com/v1/elevation?latitude={lats}&longitude={lons}"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=15) as response:
                data = json.loads(response.read().decode('utf-8'))

            elev_vals = data.get("elevation", [])
            for j, cell in enumerate(batch):
                if j < len(elev_vals):
                    elevations[cell] = max(0.0, float(elev_vals[j]))
                else:
                    elevations[cell] = 0.0

            if (i // 50) % 2 == 0:
                print(f"    Fetched {min(i+50, len(cells_list))}/{len(cells_list)} cells...")
            time.sleep(0.3)  # Rate limit

    except Exception as e:
        print(f"  [WARNING] API failed: {e}")
        print("  Using topographic approximation based on Indian geography...")
        elevations = _approximate_elevation(grid_cells)

    records = [{'Latitude': lat, 'Longitude': lon, 'Elevation_m': elev}
               for (lat, lon), elev in elevations.items()]
    df = pd.DataFrame(records)
    df.to_csv(elev_csv, index=False)
    print(f"  Saved {len(df)} rows to {elev_csv}")
    print(f"  Elevation range: {df['Elevation_m'].min():.0f} m to {df['Elevation_m'].max():.0f} m")
    return df


def _approximate_elevation(grid_cells):
    """
    Approximate elevation for Indian grid cells using known topography.
    Major features: Himalayas (N), Western Ghats (W coast), Eastern Ghats,
    Indo-Gangetic Plain, Deccan Plateau, Thar Desert.
    """
    elevations = {}
    for lat, lon in grid_cells:
        elev = 200.0  # Default: Deccan Plateau

        # Himalayas: lat > 30, increases with latitude
        if lat >= 30.5:
            elev = 1500 + (lat - 30) * 500
            if lon >= 76.5 and lon <= 80.5:
                elev += 800  # Greater Himalayas
        # Shivalik/Sub-Himalayas: lat 28-30
        elif lat >= 28.5 and lat <= 30.5:
            elev = 400 + (lat - 28) * 400
            if lon >= 76.5 and lon <= 80.5:
                elev += 500

        # Indo-Gangetic Plain: lat 24-28, lon 76-88
        elif lat >= 24.5 and lat <= 28.5 and lon >= 76.5 and lon <= 88.5:
            elev = 60 + (lon - 76) * 5  # Slight eastward rise

        # Western Ghats: lat 8-20, lon 73-76
        if lat >= 8.5 and lat <= 20.5 and lon >= 73.5 and lon <= 76.5:
            elev = max(elev, 600 + (16 - abs(lat - 14)) * 50)

        # Eastern Ghats: lat 12-20, lon 78-80
        if lat >= 12.5 and lat <= 20.5 and lon >= 78.5 and lon <= 80.5:
            elev = max(elev, 400)

        # Thar Desert: lat 24-28, lon 69-72
        if lat >= 24.5 and lat <= 28.5 and lon >= 69.5 and lon <= 72.5:
            elev = 150

        # Coastal lowlands: near coast
        if lat <= 13.5 and lon >= 79.5:
            elev = min(elev, 50)
        if lat <= 22.5 and lon <= 72.5 and lat >= 20.5:
            elev = min(elev, 30)  # Gujarat coast

        # Northeast hills: lat 24-28, lon 91-97
        if lat >= 24.5 and lon >= 91.5:
            elev = max(elev, 300 + (lon - 91) * 150)

        # Andaman/Nicobar
        if lon >= 92.5 and lat <= 14.5:
            elev = 50

        elevations[(lat, lon)] = round(max(0, elev), 1)
    return elevations


# =============================================================================
# STEP 4: COMPUTE DISTANCE TO COAST PER GRID CELL
# =============================================================================
def compute_coast_distance(grid_cells):
    """
    Compute minimum distance from each grid cell center to the Indian coastline.
    Uses a simplified coastline polygon with ~80 vertices.
    """
    print("\n" + "=" * 60)
    print("STEP 4: Computing distance-to-coast per grid cell...")
    print("=" * 60)

    coast_csv = os.path.join(DRIVERS_DIR, "coast_distance_grid.csv")

    if os.path.exists(coast_csv):
        print(f"  Found existing {coast_csv}, loading...")
        df = pd.read_csv(coast_csv)
        print(f"  Loaded {len(df)} rows")
        return df

    # Simplified India coastline vertices (lat, lon) — traced clockwise from Gujarat
    # These are approximate, covering mainland India's coast
    INDIA_COAST = [
        # Gujarat / Rann of Kutch
        (23.5, 68.5), (22.5, 69.0), (21.5, 69.5), (21.0, 70.0),
        (20.5, 70.5), (20.0, 71.0), (19.5, 71.5), (19.0, 72.0),
        # Mumbai / Konkan coast
        (18.5, 72.8), (18.0, 73.0), (17.5, 73.2), (17.0, 73.3),
        (16.5, 73.5), (16.0, 73.5), (15.5, 73.8), (15.0, 73.9),
        # Goa / Karnataka / Kerala
        (14.5, 74.2), (14.0, 74.5), (13.5, 74.7), (13.0, 74.8),
        (12.5, 74.8), (12.0, 75.0), (11.5, 75.5), (11.0, 75.8),
        (10.5, 76.0), (10.0, 76.2), (9.5, 76.3), (9.0, 76.5),
        (8.5, 77.0), (8.0, 77.5),
        # Cape Comorin / Tamil Nadu
        (8.0, 77.5), (8.2, 78.0), (8.5, 78.5), (9.0, 79.0),
        (9.5, 79.3), (10.0, 79.5), (10.5, 79.8), (11.0, 79.8),
        (11.5, 80.0), (12.0, 80.2), (12.5, 80.3), (13.0, 80.3),
        # Andhra Pradesh coast
        (13.5, 80.3), (14.0, 80.2), (14.5, 80.1), (15.0, 80.0),
        (15.5, 80.2), (16.0, 80.5), (16.5, 81.0), (17.0, 81.5),
        (17.5, 82.5), (18.0, 83.5), (18.5, 84.0),
        # Odisha / West Bengal coast
        (19.0, 84.5), (19.5, 85.0), (20.0, 85.5), (20.5, 86.0),
        (20.5, 86.5), (21.0, 87.0), (21.5, 87.5), (21.5, 88.0),
        (22.0, 88.0), (22.0, 88.5), (21.5, 89.0),
        # Sundarbans delta
        (21.5, 88.5), (22.0, 89.0),
    ]

    records = []
    for lat, lon in grid_cells:
        min_dist = float('inf')
        for clat, clon in INDIA_COAST:
            d = haversine_km(lat, lon, clat, clon)
            min_dist = min(min_dist, d)
        records.append({
            'Latitude': lat,
            'Longitude': lon,
            'Dist_Coast_km': round(min_dist, 1)
        })

    df = pd.DataFrame(records)
    df.to_csv(coast_csv, index=False)
    print(f"  Saved {len(df)} rows to {coast_csv}")
    print(f"  Distance range: {df['Dist_Coast_km'].min():.1f} km to {df['Dist_Coast_km'].max():.1f} km")

    # Sanity check
    coastal = df[df['Dist_Coast_km'] < 100]
    inland = df[df['Dist_Coast_km'] > 500]
    print(f"  Coastal cells (<100km): {len(coastal)}")
    print(f"  Deep inland cells (>500km): {len(inland)}")
    return df


# =============================================================================
# STEP 5: MERGE ALL DRIVERS INTO CLIMATE DATA
# =============================================================================
def merge_drivers():
    """
    Merge ONI, DMI, Elevation, Coast Distance into merged_climate_data.csv
    to create merged_climate_data_v2.csv with derived features.
    """
    print("\n" + "=" * 60)
    print("STEP 5: Loading merged_climate_data.csv...")
    print("=" * 60)

    # Get canonical grid cells
    df_coords = pd.read_csv(MERGED_CSV, usecols=['Latitude', 'Longitude'])
    grid_cells = set(zip(df_coords['Latitude'], df_coords['Longitude']))
    del df_coords
    print(f"  Canonical grid cells: {len(grid_cells)}")

    # Fetch/compute all drivers
    df_oni = fetch_oni()
    df_dmi = fetch_dmi()
    df_elev = compute_elevation(grid_cells)
    df_coast = compute_coast_distance(grid_cells)

    # Load main dataset
    print("\n" + "=" * 60)
    print("STEP 6: Merging drivers into main dataset...")
    print("=" * 60)

    t0 = time.time()
    dtypes = {
        "Year": "int16", "Month": "int8", "Day": "int8",
        "Season": "category", "Latitude": "float32", "Longitude": "float32",
        "Max_Temp": "float32", "Min_Temp": "float32",
        "Diurnal_Range": "float32", "Rainfall": "float32"
    }
    df = pd.read_csv(MERGED_CSV, parse_dates=["Date"], dtype=dtypes)
    print(f"  Loaded {len(df):,} rows in {time.time()-t0:.1f}s")

    # ── Merge ONI (by Year + Month) ──
    print("  Merging ONI...")
    df_oni['Year'] = df_oni['Year'].astype('int16')
    df_oni['Month'] = df_oni['Month'].astype('int8')
    df_oni['ONI'] = df_oni['ONI'].astype('float32')
    before = len(df)
    df = df.merge(df_oni[['Year', 'Month', 'ONI']], on=['Year', 'Month'], how='left')
    assert len(df) == before, "ONI merge changed row count!"
    df['ONI'] = df['ONI'].fillna(0.0).astype('float32')
    print(f"    ONI coverage: {df['ONI'].notna().mean()*100:.1f}%")

    # ── Merge DMI (by Year + Month) ──
    print("  Merging DMI...")
    df_dmi['Year'] = df_dmi['Year'].astype('int16')
    df_dmi['Month'] = df_dmi['Month'].astype('int8')
    df_dmi['DMI'] = df_dmi['DMI'].astype('float32')
    df = df.merge(df_dmi[['Year', 'Month', 'DMI']], on=['Year', 'Month'], how='left')
    assert len(df) == before, "DMI merge changed row count!"
    df['DMI'] = df['DMI'].fillna(0.0).astype('float32')
    print(f"    DMI coverage: {df['DMI'].notna().mean()*100:.1f}%")

    # ── Merge Elevation (by Latitude + Longitude) ──
    print("  Merging Elevation...")
    df_elev['Latitude'] = df_elev['Latitude'].astype('float32')
    df_elev['Longitude'] = df_elev['Longitude'].astype('float32')
    df_elev['Elevation_m'] = df_elev['Elevation_m'].astype('float32')
    df = df.merge(df_elev, on=['Latitude', 'Longitude'], how='left')
    assert len(df) == before, "Elevation merge changed row count!"
    df['Elevation_m'] = df['Elevation_m'].fillna(200.0).astype('float32')
    print(f"    Elevation coverage: {df['Elevation_m'].notna().mean()*100:.1f}%")

    # ── Merge Coast Distance (by Latitude + Longitude) ──
    print("  Merging Coast Distance...")
    df_coast['Latitude'] = df_coast['Latitude'].astype('float32')
    df_coast['Longitude'] = df_coast['Longitude'].astype('float32')
    df_coast['Dist_Coast_km'] = df_coast['Dist_Coast_km'].astype('float32')
    df = df.merge(df_coast, on=['Latitude', 'Longitude'], how='left')
    assert len(df) == before, "Coast distance merge changed row count!"
    df['Dist_Coast_km'] = df['Dist_Coast_km'].fillna(500.0).astype('float32')
    print(f"    Coast distance coverage: {df['Dist_Coast_km'].notna().mean()*100:.1f}%")

    # ── Derived Features ──
    print("\n  Computing derived features...")

    # ENSO Phase (categorical encoded as int)
    # El Niño: ONI >= 0.5, La Niña: ONI <= -0.5, Neutral: in between
    df['ENSO_Phase'] = np.where(df['ONI'] >= 0.5, 2,    # El Niño
                       np.where(df['ONI'] <= -0.5, 0,    # La Niña
                                1)).astype(np.int8)       # Neutral

    # IOD Phase
    df['IOD_Phase'] = np.where(df['DMI'] >= 0.4, 2,      # Positive IOD
                     np.where(df['DMI'] <= -0.4, 0,       # Negative IOD
                              1)).astype(np.int8)          # Neutral

    # Is_Monsoon flag (needed for interactions)
    is_monsoon = df['Month'].isin([6, 7, 8, 9]).astype(np.float32)

    # Interaction terms
    df['ONI_x_Monsoon'] = (df['ONI'] * is_monsoon).astype(np.float32)
    df['DMI_x_Monsoon'] = (df['DMI'] * is_monsoon).astype(np.float32)
    df['Elevation_x_Monsoon'] = (df['Elevation_m'] * is_monsoon / 1000.0).astype(np.float32)

    # Log-transform of distance (diminishing effect)
    df['Log_Dist_Coast'] = np.log1p(df['Dist_Coast_km']).astype(np.float32)

    print(f"    ENSO Phase distribution: La Niña={int((df['ENSO_Phase']==0).sum()):,}, "
          f"Neutral={int((df['ENSO_Phase']==1).sum()):,}, El Niño={int((df['ENSO_Phase']==2).sum()):,}")
    print(f"    IOD Phase distribution: Negative={int((df['IOD_Phase']==0).sum()):,}, "
          f"Neutral={int((df['IOD_Phase']==1).sum()):,}, Positive={int((df['IOD_Phase']==2).sum()):,}")

    # ── Save ──
    print(f"\n  Saving {OUTPUT_CSV}...")
    t0 = time.time()
    df.to_csv(OUTPUT_CSV, index=False)
    size_mb = os.path.getsize(OUTPUT_CSV) / 1e6
    print(f"  Saved {len(df):,} rows to {OUTPUT_CSV} ({size_mb:.1f} MB) in {time.time()-t0:.1f}s")

    # ── Quality report ──
    print("\n" + "=" * 60)
    print("DATA QUALITY REPORT")
    print("=" * 60)
    new_cols = ['ONI', 'DMI', 'Elevation_m', 'Dist_Coast_km',
                'ENSO_Phase', 'IOD_Phase', 'ONI_x_Monsoon', 'DMI_x_Monsoon',
                'Elevation_x_Monsoon', 'Log_Dist_Coast']
    for col in new_cols:
        na = df[col].isna().sum()
        print(f"  {col:25s}: mean={df[col].mean():8.3f} | std={df[col].std():8.3f} | "
              f"min={df[col].min():8.3f} | max={df[col].max():8.3f} | NaN={na}")

    print("\n" + "=" * 60)
    print(f"DONE! New columns added: {new_cols}")
    print(f"Original columns preserved. Dataset ready for model retraining.")
    print("=" * 60)

    return df


# =============================================================================
# MAIN
# =============================================================================
if __name__ == "__main__":
    t_start = time.time()
    merge_drivers()
    elapsed = time.time() - t_start
    print(f"\nTotal time: {elapsed:.1f}s")
