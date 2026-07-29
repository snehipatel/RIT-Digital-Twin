"""What-If Scenario Simulator"""
import pickle, json, numpy as np, pandas as pd

with open("max_temp_model.pkl","rb") as f:        max_temp_model  = pickle.load(f)
with open("min_temp_model.pkl","rb") as f:        min_temp_model  = pickle.load(f)
with open("rainfall_classifier.pkl","rb") as f:   rain_classifier = pickle.load(f)
with open("rainfall_regressor.pkl","rb") as f:    rain_regressor  = pickle.load(f)
with open("feature_columns.pkl","rb") as f:       temp_feats      = pickle.load(f)
with open("rainfall_feature_cols.pkl","rb") as f: rain_feats      = pickle.load(f)
with open("rainfall_cls_features.pkl","rb") as f: cls_feats       = pickle.load(f)

def run_whatif_scenario(base_date, temp_change=0.0, rain_change=0.0,
                         duration_days=7, df_path="merged_climate_data.csv"):
    df = pd.read_csv(df_path, parse_dates=["Date"])
    df["Rainfall"] = df["Rainfall"].fillna(0)
    sm = {"Winter":0,"Pre-Monsoon":1,"Monsoon":2,"Post-Monsoon":3}
    df["Season_Code"] = df["Season"].map(sm)
    df["Month_sin"]  = np.sin(2*np.pi*df["Month"]/12)
    df["Month_cos"]  = np.cos(2*np.pi*df["Month"]/12)
    df["DayOfYear"]  = df["Date"].dt.dayofyear
    df["Day_sin"]    = np.sin(2*np.pi*df["DayOfYear"]/365)
    df["Day_cos"]    = np.cos(2*np.pi*df["DayOfYear"]/365)
    df["Is_Monsoon"] = df["Month"].isin([6,7,8,9]).astype(int)
    df["Lat_Zone"]   = pd.cut(df["Latitude"],bins=[0,15,20,25,40],labels=[0,1,2,3]).astype(float)
    base = pd.Timestamp(base_date)
    baseline, scenario = [], []
    for d in range(duration_days):
        td  = base + pd.Timedelta(days=d)
        ddf = df[df["Date"]==td].copy()
        if len(ddf)==0: continue
        sdf = ddf.copy()
        sdf["Max_Temp"] += temp_change
        sdf["Min_Temp"] += temp_change
        sdf["Rainfall"]  = np.maximum(0, sdf["Rainfall"]+rain_change)
        for df_use, store in [(ddf,baseline),(sdf,scenario)]:
            for c in temp_feats+rain_feats+cls_feats:
                if c not in df_use.columns: df_use[c] = 0
            Xt  = df_use[[c for c in temp_feats  if c in df_use.columns]].fillna(0)
            Xr  = df_use[[c for c in rain_feats  if c in df_use.columns]].fillna(0)
            Xcl = df_use[[c for c in cls_feats   if c in df_use.columns]].fillna(0)
            mp   = max_temp_model.predict(Xt)
            mnp  = min_temp_model.predict(Xt)
            cp   = rain_classifier.predict_proba(Xcl)[:,1]
            is_r = (cp >= 0.5).astype(int)
            ra   = np.zeros(len(Xr))
            if is_r.sum()>0:
                ra[is_r==1] = np.maximum(np.expm1(rain_regressor.predict(Xr[is_r==1])),0)
            store.append({"date":str(td.date()),
                           "avg_max_temp":round(float(np.mean(mp)),2),
                           "avg_min_temp":round(float(np.mean(mnp)),2),
                           "avg_rainfall":round(float(np.mean(ra)),2),
                           "total_rainfall":round(float(np.sum(ra)),2)})
    if not baseline: return {"error":f"No data for {base_date}"}
    bt=np.mean([r["avg_max_temp"] for r in baseline])
    st=np.mean([r["avg_max_temp"] for r in scenario])
    br=sum([r["total_rainfall"] for r in baseline])
    sr=sum([r["total_rainfall"] for r in scenario])
    bh=sum(1 for r in baseline if r["avg_max_temp"]>40)
    sh=sum(1 for r in scenario  if r["avg_max_temp"]>40)
    cool=round(max(0,(st-24)*5)-max(0,(bt-24)*5),1)
    td2=st-bt; rd=sr-br
    agri="High" if td2>3 or rd<-50 else "Moderate" if td2>1.5 or rd<-20 else "Low"
    return {"scenario":{"base_date":base_date,"temp_change":temp_change,
                          "rain_change":rain_change,"duration_days":duration_days},
             "baseline":baseline,"scenario_results":scenario,
             "projected_impact":{"avg_temp_rise":round(st-bt,2),
                                   "heatwave_days_increase":sh-bh,
                                   "cooling_demand_change_pct":cool,
                                   "rainfall_change_mm":round(sr-br,1),
                                   "agriculture_risk":agri}}

if __name__ == "__main__":
    r = run_whatif_scenario("2024-06-15", temp_change=+2.0, duration_days=7)
    print(json.dumps(r["projected_impact"], indent=2))
