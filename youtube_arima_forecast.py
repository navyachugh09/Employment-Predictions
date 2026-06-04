"""
youtube_arima_forecast.py
-------------------------
Fits ARIMA models to BERT monthly sentiment series per occupation and
forecasts the next FORECAST_HORIZON months with 95% confidence intervals.

Inputs:
  sentiment_analysis/sentiment_monthly_bert.csv  (occupation, month, compound, n)

Outputs:
  sentiment_analysis/arima_forecasts.json
"""

import json
import warnings
import logging
import pandas as pd
import numpy as np
from pathlib import Path
from statsmodels.tsa.arima.model import ARIMA

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
                    datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

OUT = Path("sentiment_analysis")
OUT.mkdir(parents=True, exist_ok=True)

FORECAST_HORIZON = 12
ORDER_GRID = [(p, d, q) for p in (0, 1, 2) for d in (0, 1) for q in (0, 1, 2)]


def best_arima(series: pd.Series):
    """Grid-search (p,d,q) ∈ ORDER_GRID, return best fit by AIC."""
    best = None
    for order in ORDER_GRID:
        try:
            model = ARIMA(series, order=order).fit()
            if best is None or model.aic < best[1]:
                best = (model, model.aic, order)
        except Exception:
            continue
    return best


def main():
    in_path = OUT / "sentiment_monthly_bert.csv"
    if not in_path.exists():
        log.error("Missing %s — run youtube_bert_sentiment.py first", in_path)
        return

    df = pd.read_csv(in_path)
    log.info("Loaded monthly series for %d occupations", df["occupation"].nunique())

    forecasts = {}

    for occ, grp in df.groupby("occupation"):
        grp = grp.sort_values("month")

        # Reindex to continuous monthly range, ffill
        idx = pd.period_range(grp["month"].min(), grp["month"].max(), freq="M")
        s   = (grp.set_index(pd.PeriodIndex(grp["month"], freq="M"))["compound"]
                  .reindex(idx).ffill().bfill())

        if len(s) < 12:
            log.warning("[%s] only %d months — skipping ARIMA", occ, len(s))
            continue

        result = best_arima(s)
        if result is None:
            log.warning("[%s] all ARIMA orders failed", occ)
            continue

        model, aic, order = result
        log.info("[%s] ARIMA%s  AIC=%.2f (n=%d)", occ, order, aic, len(s))

        # Forecast with 95% CI
        forecast_res = model.get_forecast(steps=FORECAST_HORIZON)
        mean = forecast_res.predicted_mean.tolist()
        ci   = forecast_res.conf_int(alpha=0.05)
        lower = ci.iloc[:, 0].tolist()
        upper = ci.iloc[:, 1].tolist()

        # Future month labels
        last_period = s.index[-1]
        future = [(last_period + i + 1).strftime("%Y-%m") for i in range(FORECAST_HORIZON)]

        # Clip CI / mean to [-1, +1] (compound bound)
        clamp = lambda v: max(-1.0, min(1.0, float(v)))

        forecasts[occ] = {
            "order":     list(order),
            "aic":       round(float(aic), 2),
            "history": {
                "months":   [str(p) for p in s.index],
                "values":   [round(float(v), 4) for v in s.values],
            },
            "forecast": {
                "months": future,
                "mean":   [round(clamp(v), 4) for v in mean],
                "lower":  [round(clamp(v), 4) for v in lower],
                "upper":  [round(clamp(v), 4) for v in upper],
            }
        }

    out_path = OUT / "arima_forecasts.json"
    with open(out_path, "w") as f:
        json.dump(forecasts, f, indent=2)
    log.info("Saved: %s  (%d occupations)", out_path, len(forecasts))

    # Print summary
    print("\n--- ARIMA FORECAST SUMMARY (next 12 months) ---")
    for occ, d in forecasts.items():
        last_hist = d["history"]["values"][-1]
        end_fcast = d["forecast"]["mean"][-1]
        diff = end_fcast - last_hist
        arrow = "↑" if diff > 0.05 else "↓" if diff < -0.05 else "→"
        print(f"  ARIMA{tuple(d['order'])} {occ}: {last_hist:+.3f} {arrow} {end_fcast:+.3f}   (AIC={d['aic']})")


if __name__ == "__main__":
    main()
