"""
youtube_cleaning.py
-------------------
Cleans the raw YouTube comments + transcripts collected by youtube_collection.py.

Outputs (data/processed/):
  youtube_comments_clean.csv   — one row per comment, cleaned + tagged
  youtube_transcripts_clean.csv — one row per video transcript, cleaned + tagged
  cleaning_report.txt          — summary of what was kept / dropped

Cleaning steps (comments):
  1. Drop exact duplicates (comment_id)
  2. Parse and validate published_at → year, month columns
  3. Drop non-English comments (langdetect; lang != 'en')
  4. Drop spam: len < 5 words OR > 500 words
  5. Strip HTML entities & excess whitespace
  6. Tag AU-relevant: comment text OR video title/channel mentions Australia/Vic keywords
  7. Tag occupation keywords present in comment
  8. Add word_count column

Cleaning steps (transcripts):
  1. Drop duplicates (video_id)
  2. Parse published_at
  3. Strip [Music] / [Applause] / other bracketed noise
  4. Tag AU-relevant (same rule as comments)
  5. Recompute word_count after cleaning
"""

import re
import logging
import pandas as pd
from pathlib import Path
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
                    datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

RAW = Path("data/raw")
OUT = Path("data/processed")
OUT.mkdir(parents=True, exist_ok=True)

DATE_SUFFIX = datetime.today().strftime("%Y%m%d")

# ── AU relevance keywords ────────────────────────────────────────────────────
AU_KEYWORDS = re.compile(
    r"\b(australia[n]?|vic(?:toria[n]?)?|melbourne|nsw|queensland|brisbane"
    r"|sydney|perth|adelaide|canberra|fair\s*work|ndis|centrelink"
    r"|aged\s*care\s*act|myagedcare|tafe|ato|abn|superannuation|super\s+fund"
    r"|award\s+wage|minimum\s+wage\s+australia|enterprise\s+agreement)\b",
    re.IGNORECASE,
)

# ── Noise patterns in transcripts ────────────────────────────────────────────
BRACKET_NOISE = re.compile(r"\[(Music|Applause|Laughter|Inaudible|__]\]?[^\]]*)\]", re.IGNORECASE)
MULTI_SPACE   = re.compile(r" {2,}")

# ── Simple English detection (no langdetect dep needed) ─────────────────────
# Heuristic: if ≥60% of characters are ASCII printable, treat as English.
def _looks_english(text: str) -> bool:
    if not isinstance(text, str) or len(text) < 10:
        return True  # keep very short strings; not worth filtering
    ascii_count = sum(1 for c in text if ord(c) < 128)
    return ascii_count / len(text) >= 0.60


def _strip_html(text: str) -> str:
    if not isinstance(text, str):
        return ""
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&quot;", '"', text)
    text = re.sub(r"&#39;", "'", text)
    text = re.sub(r"<[^>]+>", " ", text)
    return MULTI_SPACE.sub(" ", text).strip()


def _word_count(text: str) -> int:
    if not isinstance(text, str):
        return 0
    return len(text.split())


def _is_au(text: str, extra: str = "") -> bool:
    combined = f"{text} {extra}"
    return bool(AU_KEYWORDS.search(combined))


# ── Clean comments ────────────────────────────────────────────────────────────
def clean_comments(path: Path) -> pd.DataFrame:
    log.info("Reading comments: %s", path)
    df = pd.read_csv(path)
    n_raw = len(df)
    log.info("  Raw rows: %d", n_raw)

    # 1. Dedup
    df = df.drop_duplicates(subset=["comment_id"])
    log.info("  After dedup: %d (dropped %d)", len(df), n_raw - len(df))

    # 2. Parse dates
    df["published_at"] = pd.to_datetime(df["published_at"], errors="coerce", utc=True)
    df["year"]  = df["published_at"].dt.year.astype("Int64")
    df["month"] = df["published_at"].dt.to_period("M").astype(str)
    df = df.dropna(subset=["published_at"])
    log.info("  After date parse: %d", len(df))

    # 3. Strip HTML
    df["text"] = df["text"].apply(_strip_html)

    # 4. Drop non-English
    before = len(df)
    df = df[df["text"].apply(_looks_english)]
    log.info("  After language filter: %d (dropped %d)", len(df), before - len(df))

    # 5. Drop spam by word count
    df["word_count"] = df["text"].apply(_word_count)
    before = len(df)
    df = df[(df["word_count"] >= 5) & (df["word_count"] <= 500)]
    log.info("  After spam filter (5–500 words): %d (dropped %d)", len(df), before - len(df))

    # 6. AU relevance tag
    df["is_au_relevant"] = df.apply(
        lambda r: _is_au(str(r.get("text", "")),
                         f"{r.get('video_title','')} {r.get('video_channel','')}"),
        axis=1,
    )

    # 7. Occupation keyword present in comment text
    OCC_TERMS = {
        "aged_and_disabled_carers": r"aged\s*care|carer|disability|ndis|home\s*care|pca",
        "commercial_cleaners":      r"clean(er|ing|s)?|janitor|hygiene",
        "education_aides":          r"teacher(\s*aide)?|education\s*aide|classroom|school\s*support",
        "motor_mechanics":          r"mechanic|automotive|service\s*tech|car\s*repair",
        "registered_nurses":        r"nurs(e|ing)|rn\b|hospital|ward|patient\s*care",
        "sales_assistants":         r"retail|sales\s*assist|shop\s*(floor|assist)|customer\s*service",
    }
    def _has_occ_kw(row):
        pat = OCC_TERMS.get(row.get("occupation", ""), "")
        if not pat:
            return False
        return bool(re.search(pat, str(row.get("text", "")), re.IGNORECASE))

    df["has_occ_keyword"] = df.apply(_has_occ_kw, axis=1)

    # Reorder columns
    cols_front = ["comment_id", "occupation", "year", "month", "text", "word_count",
                  "is_au_relevant", "has_occ_keyword", "like_count", "reply_count",
                  "video_title", "video_channel", "video_id", "author", "published_at",
                  "search_query", "source"]
    df = df.reindex(columns=[c for c in cols_front if c in df.columns])

    log.info("  Final comment rows: %d", len(df))
    return df


# ── Clean transcripts ─────────────────────────────────────────────────────────
def clean_transcripts(path: Path) -> pd.DataFrame:
    log.info("Reading transcripts: %s", path)
    df = pd.read_csv(path)
    n_raw = len(df)
    log.info("  Raw rows: %d", n_raw)

    # 1. Dedup on video_id
    df = df.drop_duplicates(subset=["video_id"])
    log.info("  After dedup: %d (dropped %d)", len(df), n_raw - len(df))

    # 2. Parse dates
    df["published_at"] = pd.to_datetime(df["published_at"], errors="coerce", utc=True)
    df["year"]  = df["published_at"].dt.year.astype("Int64")

    # 3. Strip bracketed noise
    df["text"] = df["text"].apply(
        lambda t: MULTI_SPACE.sub(" ", BRACKET_NOISE.sub(" ", str(t))).strip()
        if isinstance(t, str) else ""
    )

    # 4. Recompute word count
    df["word_count"] = df["text"].apply(_word_count)

    # 5. AU relevance
    df["is_au_relevant"] = df.apply(
        lambda r: _is_au(str(r.get("text", "")),
                         f"{r.get('video_title','')} {r.get('video_channel','')}"),
        axis=1,
    )

    cols_front = ["video_id", "occupation", "year", "word_count", "is_au_relevant",
                  "text", "segment_count", "video_title", "video_channel",
                  "published_at", "search_query", "source"]
    df = df.reindex(columns=[c for c in cols_front if c in df.columns])

    log.info("  Final transcript rows: %d", len(df))
    return df


# ── Report ────────────────────────────────────────────────────────────────────
def write_report(comments: pd.DataFrame, transcripts: pd.DataFrame, path: Path):
    lines = []
    lines.append("=" * 64)
    lines.append("YOUTUBE CLEANING REPORT")
    lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append("=" * 64)

    lines.append("\n--- COMMENTS ---")
    lines.append(f"Total clean rows: {len(comments)}")
    lines.append(f"AU-relevant:      {comments['is_au_relevant'].sum()} ({comments['is_au_relevant'].mean()*100:.1f}%)")
    lines.append("\nPer occupation:")
    occ_summary = comments.groupby("occupation").agg(
        rows=("comment_id", "count"),
        au_pct=("is_au_relevant", lambda x: f"{x.mean()*100:.0f}%"),
        avg_words=("word_count", "mean"),
    )
    occ_summary["avg_words"] = occ_summary["avg_words"].round(0).astype(int)
    lines.append(occ_summary.to_string())

    lines.append("\nYear distribution:")
    lines.append(comments["year"].value_counts().sort_index().to_string())

    lines.append("\n--- TRANSCRIPTS ---")
    lines.append(f"Total transcripts: {len(transcripts)}")
    lines.append(f"AU-relevant:       {transcripts['is_au_relevant'].sum()} ({transcripts['is_au_relevant'].mean()*100:.1f}%)")
    lines.append("\nPer occupation:")
    t_summary = transcripts.groupby("occupation").agg(
        videos=("video_id", "count"),
        total_words=("word_count", "sum"),
        au_pct=("is_au_relevant", lambda x: f"{x.mean()*100:.0f}%"),
    )
    lines.append(t_summary.to_string())

    lines.append("\n--- ARIMA FEASIBILITY (comments ≥24 months) ---")
    for occ in comments["occupation"].unique():
        sub = comments[comments["occupation"] == occ]
        months = sub["month"].nunique()
        feasible = "✅" if months >= 24 else "⚠️ "
        lines.append(f"  {feasible} {occ}: {months} months, {len(sub)} comments")

    report = "\n".join(lines)
    path.write_text(report)
    print("\n" + report)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    comments_path    = RAW / "youtube_comments_all_20260520.csv"
    transcripts_path = RAW / "youtube_transcripts_all_20260520.csv"

    if not comments_path.exists():
        log.error("Comments file not found: %s", comments_path)
        return
    if not transcripts_path.exists():
        log.error("Transcripts file not found: %s", transcripts_path)
        return

    comments    = clean_comments(comments_path)
    transcripts = clean_transcripts(transcripts_path)

    # Save
    c_out = OUT / "youtube_comments_clean.csv"
    t_out = OUT / "youtube_transcripts_clean.csv"
    r_out = OUT / "cleaning_report.txt"

    comments.to_csv(c_out, index=False)
    transcripts.to_csv(t_out, index=False)
    log.info("Saved: %s", c_out)
    log.info("Saved: %s", t_out)

    write_report(comments, transcripts, r_out)
    log.info("Report: %s", r_out)


if __name__ == "__main__":
    main()
