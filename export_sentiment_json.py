"""
export_sentiment_json.py
Exports BERT sentiment + ARIMA forecast data to public/data/sentiment.json
for the dashboard.
"""
import json
import pandas as pd
from pathlib import Path

OUT_DIR = Path("public/data")
OUT_DIR.mkdir(parents=True, exist_ok=True)

SENT_DIR = Path("sentiment_analysis")

TOP3    = ["aged_and_disabled_carers", "registered_nurses", "sales_assistants"]
BOTTOM3 = ["commercial_cleaners", "education_aides", "motor_mechanics"]

LABELS = {
    "aged_and_disabled_carers": "Aged & Disabled Carers",
    "commercial_cleaners":      "Commercial Cleaners",
    "education_aides":          "Education Aides",
    "motor_mechanics":          "Motor Mechanics",
    "registered_nurses":        "Registered Nurses",
    "sales_assistants":         "Sales Assistants",
}

# ── Occupation summary (BERT) ──────────────────────────────────────────────
occ_df = pd.read_csv(SENT_DIR / "sentiment_by_occupation_bert.csv")
occ_df["label"] = occ_df["occupation"].map(LABELS)
occ_df["tier"]  = occ_df["occupation"].apply(lambda o: "high_demand" if o in TOP3 else "declining")
occ_df = occ_df.sort_values("compound_mean", ascending=False)

occupation_summary = []
for _, row in occ_df.iterrows():
    pct_neu = round(100 - row["pct_positive"] - row["pct_negative"], 1)
    occupation_summary.append({
        "occupation": row["occupation"],
        "label": row["label"],
        "tier": row["tier"],
        "n": int(row["n"]),
        "compound_mean": round(float(row["compound_mean"]), 4),
        "pct_positive": round(float(row["pct_positive"]), 1),
        "pct_neutral":  round(float(pct_neu), 1),
        "pct_negative": round(float(row["pct_negative"]), 1),
    })

# ── Monthly trend from per-comment BERT scores ─────────────────────────────
all_comments = pd.read_csv(SENT_DIR / "youtube_sentiment_comments_bert.csv")
all_comments["month"] = pd.to_datetime(all_comments["month"], errors="coerce").dt.to_period("M").astype(str)

monthly_by_occ = {}
for occ in LABELS.keys():
    sub = all_comments[all_comments["occupation"] == occ]
    if sub.empty:
        monthly_by_occ[occ] = {"months": [], "compound": [], "n": [], "smoothed": [], "direction": "flat"}
        continue

    g = sub.groupby("month").agg(compound=("bert_compound", "mean"),
                                 n=("bert_compound", "count")).reset_index().sort_values("month")
    months_idx = pd.period_range(g["month"].min(), g["month"].max(), freq="M").astype(str)
    g = g.set_index("month").reindex(months_idx).reset_index().rename(columns={"index": "month"})
    g["n"] = g["n"].fillna(0).astype(int)
    g["compound"] = g["compound"].ffill().bfill().fillna(0)
    g["smoothed"] = g["compound"].rolling(window=3, min_periods=1, center=True).mean()

    direction = "flat"
    if len(g) >= 8:
        recent = g["smoothed"].tail(6).mean()
        prior  = g["smoothed"].iloc[-12:-6].mean() if len(g) >= 12 else g["smoothed"].head(len(g) - 6).mean()
        diff = recent - prior
        if   diff >  0.05: direction = "improving"
        elif diff < -0.05: direction = "worsening"

    monthly_by_occ[occ] = {
        "months":   g["month"].tolist(),
        "compound": [round(float(v), 4) for v in g["compound"]],
        "smoothed": [round(float(v), 4) for v in g["smoothed"]],
        "n":        g["n"].tolist(),
        "direction": direction,
    }

# ── ARIMA forecasts ────────────────────────────────────────────────────────
forecasts_path = SENT_DIR / "arima_forecasts.json"
forecasts = {}
if forecasts_path.exists():
    with open(forecasts_path) as f:
        raw = json.load(f)
    for occ, d in raw.items():
        # Determine forecast direction (end of horizon vs last historical)
        last_hist = d["history"]["values"][-1]
        end_fc    = d["forecast"]["mean"][-1]
        diff = end_fc - last_hist
        fc_dir = "improving" if diff > 0.05 else "worsening" if diff < -0.05 else "flat"
        forecasts[occ] = {
            "order": d["order"],
            "aic":   d["aic"],
            "forecast": d["forecast"],
            "direction": fc_dir,
            "diff": round(float(diff), 4),
        }
else:
    print("⚠️  No ARIMA forecasts found — run youtube_arima_forecast.py first")

# ── Assemble payload ───────────────────────────────────────────────────────
payload = {
    "meta": {
        "source": "YouTube",
        "model":  "BERT (cardiffnlp/twitter-roberta-base-sentiment-latest)",
        "forecast_model": "ARIMA (best AIC over grid p≤2, d≤1, q≤2)",
        "total_comments": int(occ_df["n"].sum()),
        "occupations": list(LABELS.keys()),
        "top3": TOP3,
        "bottom3": BOTTOM3,
    },
    "occupation_summary": occupation_summary,
    "monthly_trend": monthly_by_occ,
    "forecasts": forecasts,
}

out_path = OUT_DIR / "sentiment.json"
with open(out_path, "w") as f:
    json.dump(payload, f, indent=2)

print(f"Exported {out_path}  ({out_path.stat().st_size // 1024} KB)")
