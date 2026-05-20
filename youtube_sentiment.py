"""
youtube_sentiment.py
--------------------
VADER sentiment analysis on cleaned YouTube comments + transcripts.

"""

import logging
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
                    datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

PROCESSED = Path("data/processed")
OUT = Path("sentiment_analysis")
FIGS = OUT / "figures"
OUT.mkdir(parents=True, exist_ok=True)
FIGS.mkdir(parents=True, exist_ok=True)

OCCUPATION_LABELS = {
    "aged_and_disabled_carers": "Aged Carers",
    "commercial_cleaners":      "Comm. Cleaners",
    "education_aides":          "Education Aides",
    "motor_mechanics":          "Motor Mechanics",
    "registered_nurses":        "Reg. Nurses",
    "sales_assistants":         "Sales Assistants",
}

TOP3    = ["aged_and_disabled_carers", "registered_nurses", "sales_assistants"]
BOTTOM3 = ["commercial_cleaners", "education_aides", "motor_mechanics"]

# Demand tier colours
TIER_COLOUR = {occ: "#2ecc71" for occ in TOP3}
TIER_COLOUR.update({occ: "#e74c3c" for occ in BOTTOM3})

sns.set_theme(style="whitegrid", palette="muted")


# ── Scoring helpers ────────────────────────────────────────────────────────────
def score_df(df: pd.DataFrame, analyser: SentimentIntensityAnalyzer,
             text_col: str = "text") -> pd.DataFrame:
    scores = df[text_col].apply(
        lambda t: analyser.polarity_scores(str(t)) if pd.notna(t) else
                  {"compound": 0.0, "pos": 0.0, "neu": 1.0, "neg": 0.0}
    )
    df = df.copy()
    df["compound"] = scores.apply(lambda s: s["compound"])
    df["pos"]      = scores.apply(lambda s: s["pos"])
    df["neu"]      = scores.apply(lambda s: s["neu"])
    df["neg"]      = scores.apply(lambda s: s["neg"])
    df["sentiment_label"] = df["compound"].apply(
        lambda c: "positive" if c >= 0.05 else ("negative" if c <= -0.05 else "neutral")
    )
    return df


# ── Plot 1: Mean compound score by occupation (bar chart) ─────────────────────
def plot_occupation_bars(occ_df: pd.DataFrame):
    fig, ax = plt.subplots(figsize=(10, 5))
    colours = [TIER_COLOUR.get(o, "#95a5a6") for o in occ_df["occupation"]]
    bars = ax.barh(occ_df["label"], occ_df["compound_mean"], color=colours, edgecolor="white")
    ax.axvline(0, color="black", linewidth=0.8, linestyle="--")
    ax.bar_label(bars, fmt="%.3f", padding=4, fontsize=9)
    ax.set_xlabel("Mean VADER Compound Score  (−1 most negative → +1 most positive)")
    ax.set_title("Sentiment by Occupation (YouTube Comments)\nGreen = high-demand | Red = declining")
    ax.set_xlim(-0.4, 0.4)

    from matplotlib.patches import Patch
    legend = [Patch(facecolor="#2ecc71", label="High-demand (top 3)"),
              Patch(facecolor="#e74c3c", label="Declining (bottom 3)")]
    ax.legend(handles=legend, loc="lower right", fontsize=8)

    plt.tight_layout()
    path = FIGS / "sentiment_by_occupation.png"
    fig.savefig(path, dpi=150)
    plt.close()
    log.info("Saved: %s", path)


# ── Plot 2: Sentiment distribution (violin / strip) ───────────────────────────
def plot_distribution(comments: pd.DataFrame):
    df = comments.copy()
    df["label"] = df["occupation"].map(OCCUPATION_LABELS)
    df["tier"]  = df["occupation"].apply(lambda o: "High-demand" if o in TOP3 else "Declining")

    fig, ax = plt.subplots(figsize=(12, 5))
    order = [OCCUPATION_LABELS[o] for o in TOP3 + BOTTOM3 if o in OCCUPATION_LABELS]
    palette = {OCCUPATION_LABELS[o]: TIER_COLOUR[o] for o in TOP3 + BOTTOM3}

    sns.violinplot(data=df, x="label", y="compound", order=order,
                   palette=palette, inner="quartile", linewidth=0.8, ax=ax)
    ax.axhline(0, color="black", linewidth=0.8, linestyle="--")
    ax.set_xlabel("")
    ax.set_ylabel("VADER Compound Score")
    ax.set_title("Sentiment Distribution by Occupation (YouTube Comments)")
    plt.xticks(rotation=15, ha="right")
    plt.tight_layout()
    path = FIGS / "sentiment_distribution.png"
    fig.savefig(path, dpi=150)
    plt.close()
    log.info("Saved: %s", path)


# ── Plot 3: Sentiment label breakdown (stacked bar) ───────────────────────────
def plot_label_breakdown(comments: pd.DataFrame):
    df = comments.copy()
    df["label"] = df["occupation"].map(OCCUPATION_LABELS)
    pivot = (df.groupby(["label", "sentiment_label"])
               .size()
               .unstack(fill_value=0))
    # normalise to %
    pivot = pivot.div(pivot.sum(axis=1), axis=0) * 100
    for col in ["positive", "neutral", "negative"]:
        if col not in pivot.columns:
            pivot[col] = 0.0
    pivot = pivot[["positive", "neutral", "negative"]]

    order = [OCCUPATION_LABELS[o] for o in TOP3 + BOTTOM3 if OCCUPATION_LABELS[o] in pivot.index]
    pivot = pivot.reindex(order)

    fig, ax = plt.subplots(figsize=(11, 5))
    pivot.plot(kind="barh", stacked=True, color=["#2ecc71", "#bdc3c7", "#e74c3c"],
               edgecolor="white", ax=ax)
    ax.set_xlabel("% of comments")
    ax.set_title("Sentiment Label Breakdown by Occupation")
    ax.legend(loc="lower right", fontsize=8)
    plt.tight_layout()
    path = FIGS / "sentiment_label_breakdown.png"
    fig.savefig(path, dpi=150)
    plt.close()
    log.info("Saved: %s", path)


# ── Plot 4: Monthly sentiment trend (line chart) ──────────────────────────────
def plot_monthly_trend(monthly: pd.DataFrame):
    fig, axes = plt.subplots(2, 3, figsize=(15, 8), sharey=True)
    axes = axes.flatten()
    all_occs = TOP3 + BOTTOM3

    for i, occ in enumerate(all_occs):
        sub = monthly[monthly["occupation"] == occ].copy()
        sub = sub.sort_values("month")
        ax = axes[i]
        colour = TIER_COLOUR.get(occ, "#95a5a6")
        ax.plot(sub["month"].astype(str), sub["compound"], marker="o", markersize=3,
                linewidth=1.5, color=colour, label=OCCUPATION_LABELS.get(occ, occ))
        ax.axhline(0, color="black", linewidth=0.6, linestyle="--")
        ax.set_title(OCCUPATION_LABELS.get(occ, occ), fontsize=10)
        ax.set_xlabel("")
        ax.set_ylabel("Mean compound" if i % 3 == 0 else "")
        # Only show every 6th month label to avoid clutter
        ticks = sub["month"].astype(str).tolist()
        ax.set_xticks(ticks[::6])
        ax.set_xticklabels(ticks[::6], rotation=45, ha="right", fontsize=7)

    fig.suptitle("Monthly Sentiment Trend per Occupation (YouTube Comments)", fontsize=13)
    plt.tight_layout()
    path = FIGS / "sentiment_monthly_trend.png"
    fig.savefig(path, dpi=150)
    plt.close()
    log.info("Saved: %s", path)


# ── Plot 5: Transcript sentiment vs comment sentiment comparison ───────────────
def plot_transcript_vs_comment(occ_df: pd.DataFrame, t_occ: pd.DataFrame):
    merged = occ_df.merge(t_occ, on="occupation", suffixes=("_comments", "_transcripts"))
    merged["label"] = merged["occupation"].map(OCCUPATION_LABELS)

    fig, ax = plt.subplots(figsize=(9, 5))
    x = range(len(merged))
    w = 0.35
    b1 = ax.bar([i - w/2 for i in x], merged["compound_mean_comments"], w,
                label="Comments", color="#3498db", alpha=0.85)
    b2 = ax.bar([i + w/2 for i in x], merged["compound_mean_transcripts"], w,
                label="Transcripts", color="#e67e22", alpha=0.85)
    ax.set_xticks(list(x))
    ax.set_xticklabels(merged["label"], rotation=15, ha="right")
    ax.axhline(0, color="black", linewidth=0.7, linestyle="--")
    ax.set_ylabel("Mean VADER Compound Score")
    ax.set_title("Comment vs Transcript Sentiment by Occupation")
    ax.legend()
    ax.bar_label(b1, fmt="%.2f", padding=2, fontsize=8)
    ax.bar_label(b2, fmt="%.2f", padding=2, fontsize=8)
    plt.tight_layout()
    path = FIGS / "sentiment_comments_vs_transcripts.png"
    fig.savefig(path, dpi=150)
    plt.close()
    log.info("Saved: %s", path)


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    analyser = SentimentIntensityAnalyzer()

    # ── Comments ──────────────────────────────────────────────────────────────
    log.info("Scoring comments...")
    comments = pd.read_csv(PROCESSED / "youtube_comments_clean.csv")
    comments = score_df(comments, analyser)
    comments.to_csv(OUT / "youtube_sentiment_comments.csv", index=False)
    log.info("  Scored %d comments", len(comments))

    # Occupation summary
    occ_df = (comments.groupby("occupation")
              .agg(compound_mean=("compound", "mean"),
                   n=("compound", "count"),
                   pct_positive=("sentiment_label", lambda x: (x == "positive").mean() * 100),
                   pct_negative=("sentiment_label", lambda x: (x == "negative").mean() * 100))
              .reset_index())
    occ_df["label"] = occ_df["occupation"].map(OCCUPATION_LABELS)
    occ_df = occ_df.sort_values("compound_mean")
    occ_df.to_csv(OUT / "sentiment_by_occupation.csv", index=False)

    # Monthly
    comments["month_period"] = pd.to_datetime(
        comments["month"], errors="coerce").dt.to_period("M")
    monthly = (comments.groupby(["occupation", "month_period"])
               .agg(compound=("compound", "mean"),
                    n=("compound", "count"))
               .reset_index())
    monthly = monthly[monthly["n"] >= 2]  # at least 2 comments per month
    monthly.rename(columns={"month_period": "month"}, inplace=True)
    monthly.to_csv(OUT / "sentiment_monthly.csv", index=False)

    # ── Transcripts ───────────────────────────────────────────────────────────
    log.info("Scoring transcripts...")
    transcripts = pd.read_csv(PROCESSED / "youtube_transcripts_clean.csv")
    transcripts = score_df(transcripts, analyser)
    transcripts.to_csv(OUT / "youtube_sentiment_transcripts.csv", index=False)
    log.info("  Scored %d transcripts", len(transcripts))

    t_occ = (transcripts.groupby("occupation")
             .agg(compound_mean=("compound", "mean"),
                  n=("compound", "count"))
             .reset_index())

    # ── Plots ─────────────────────────────────────────────────────────────────
    log.info("Generating figures...")
    plot_occupation_bars(occ_df)
    plot_distribution(comments)
    plot_label_breakdown(comments)
    plot_monthly_trend(monthly)
    plot_transcript_vs_comment(occ_df, t_occ)

    # ── Print summary ─────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("SENTIMENT SUMMARY (comments)")
    print("=" * 60)
    summary = occ_df[["label", "n", "compound_mean", "pct_positive", "pct_negative"]].copy()
    summary.columns = ["Occupation", "N", "Mean Compound", "% Positive", "% Negative"]
    summary["Mean Compound"] = summary["Mean Compound"].round(4)
    summary["% Positive"]   = summary["% Positive"].round(1)
    summary["% Negative"]   = summary["% Negative"].round(1)
    print(summary.to_string(index=False))

    print("\nSENTIMENT SUMMARY (transcripts)")
    print("=" * 60)
    t_summary = t_occ.copy()
    t_summary["label"] = t_summary["occupation"].map(OCCUPATION_LABELS)
    t_summary["compound_mean"] = t_summary["compound_mean"].round(4)
    print(t_summary[["label", "n", "compound_mean"]].to_string(index=False))

    print(f"\nAll outputs saved to: {OUT}/ (figures in {FIGS}/)")
    print("Next step: python3 youtube_topics.py  (LDA topic modelling)")


if __name__ == "__main__":
    main()
