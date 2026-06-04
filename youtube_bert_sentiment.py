"""
youtube_bert_sentiment.py
-------------------------
BERT sentiment analysis on cleaned YouTube comments using
cardiffnlp/twitter-roberta-base-sentiment-latest (3-class: neg / neu / pos).

Compound score is derived as (P(pos) − P(neg)) ∈ [-1, +1]
to be directly comparable with VADER's compound.

Outputs (sentiment_analysis/):
  youtube_sentiment_comments_bert.csv  — one row per comment with bert scores + label
  sentiment_by_occupation_bert.csv     — mean compound per occupation
  sentiment_monthly_bert.csv           — monthly mean per occupation
"""

import logging
import pandas as pd
import torch
from pathlib import Path
from transformers import AutoTokenizer, AutoModelForSequenceClassification

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
                    datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

PROCESSED = Path("data/processed")
OUT = Path("sentiment_analysis")
OUT.mkdir(parents=True, exist_ok=True)

MODEL_NAME = "cardiffnlp/twitter-roberta-base-sentiment-latest"
BATCH_SIZE = 32
MAX_LEN    = 200      # tokens; comments are short
DEVICE = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"


# ── Load model ────────────────────────────────────────────────────────────────
def load_model():
    log.info("Loading model: %s (device=%s)", MODEL_NAME, DEVICE)
    tok = AutoTokenizer.from_pretrained(MODEL_NAME)
    mdl = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME).to(DEVICE)
    mdl.eval()
    # Label order from config.id2label: 0=negative, 1=neutral, 2=positive
    return tok, mdl


# ── Batch scoring ─────────────────────────────────────────────────────────────
@torch.no_grad()
def score_batch(texts, tok, mdl):
    enc = tok(texts, padding=True, truncation=True, max_length=MAX_LEN, return_tensors="pt").to(DEVICE)
    logits = mdl(**enc).logits
    probs  = torch.softmax(logits, dim=1).cpu().numpy()
    # cardiffnlp order: [negative, neutral, positive]
    return probs


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    in_path = PROCESSED / "youtube_comments_clean.csv"
    log.info("Reading: %s", in_path)
    df = pd.read_csv(in_path)
    log.info("  %d comments to score", len(df))

    tok, mdl = load_model()

    texts = df["text"].astype(str).tolist()
    all_probs = []

    n = len(texts)
    for start in range(0, n, BATCH_SIZE):
        end = min(start + BATCH_SIZE, n)
        batch = texts[start:end]
        probs = score_batch(batch, tok, mdl)
        all_probs.extend(probs.tolist())
        if start % (BATCH_SIZE * 5) == 0:
            log.info("  progress: %d/%d", end, n)

    log.info("Scoring complete: %d / %d", len(all_probs), n)

    probs_df = pd.DataFrame(all_probs, columns=["bert_neg", "bert_neu", "bert_pos"])
    df = df.reset_index(drop=True)
    df = pd.concat([df, probs_df], axis=1)

    # Compound: pos - neg ∈ [-1, +1] (matches VADER's compound)
    df["bert_compound"] = (df["bert_pos"] - df["bert_neg"]).round(4)

    # Label: argmax
    label_map = {0: "negative", 1: "neutral", 2: "positive"}
    df["bert_label"] = df[["bert_neg", "bert_neu", "bert_pos"]].values.argmax(axis=1)
    df["bert_label"] = df["bert_label"].map(label_map)

    # Save per-comment
    cmt_path = OUT / "youtube_sentiment_comments_bert.csv"
    df.to_csv(cmt_path, index=False)
    log.info("Saved per-comment: %s", cmt_path)

    # ── Per-occupation summary ───────────────────────────────────────────────
    occ = (df.groupby("occupation")
             .agg(compound_mean=("bert_compound", "mean"),
                  n=("bert_compound", "count"),
                  pct_positive=("bert_label", lambda x: (x == "positive").mean() * 100),
                  pct_negative=("bert_label", lambda x: (x == "negative").mean() * 100))
             .reset_index())
    occ.to_csv(OUT / "sentiment_by_occupation_bert.csv", index=False)
    log.info("Saved per-occupation: %s", OUT / "sentiment_by_occupation_bert.csv")

    # ── Monthly per occupation ───────────────────────────────────────────────
    monthly = (df.groupby(["occupation", "month"])
                 .agg(compound=("bert_compound", "mean"),
                      n=("bert_compound", "count"))
                 .reset_index())
    monthly.to_csv(OUT / "sentiment_monthly_bert.csv", index=False)
    log.info("Saved monthly: %s", OUT / "sentiment_monthly_bert.csv")

    print("\n--- BERT SENTIMENT SUMMARY ---")
    occ["compound_mean"] = occ["compound_mean"].round(4)
    occ["pct_positive"]  = occ["pct_positive"].round(1)
    occ["pct_negative"]  = occ["pct_negative"].round(1)
    print(occ.sort_values("compound_mean", ascending=False).to_string(index=False))


if __name__ == "__main__":
    main()
