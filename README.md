# Victorian Employment Outlook

Official employment projections tell you *which* Victorian occupations are growing and shrinking. They don't tell you how people working in them actually feel about it.

This project pairs the two: Jobs and Skills Australia projections for 2025–35 alongside sentiment and topic analysis of what people say online about those same occupations, presented through an interactive dashboard.

---

## The question

Victoria's projections identify clear winners and losers over the next decade. The three fastest-growing occupations by new workers needed:

| Occupation | New workers 2025–35 | Annual growth |
|---|---|---|
| Aged and disabled carers | ~64,900 | +2.9% |
| Sales assistants (general) | ~52,000 | +1.4% |
| Registered nurses | ~43,000 | +2.3% |

And three in decline:

| Occupation | Change 2025–35 | Annual change | Likely driver |
|---|---|---|---|
| Commercial cleaners | −1,622 | −0.46% | Automation |
| Education aides | −1,160 | −0.33% | — |
| Motor mechanics | −978 | −0.33% | EV transition |

The hypothesis: high-growth and declining occupations should show distinct sentiment profiles, and topic modelling should surface different concerns in each group. A job growing by 2.9% a year isn't necessarily a job people are happy in — aged care being the obvious case.

---

## Pipeline

```
Jobs & Skills Australia projections  →  select 3 growth + 3 declining occupations
                                                    ↓
                    YouTube comments + video transcripts per occupation
                                                    ↓
                                          cleaning & tagging
                                                    ↓
                    ┌───────────────────┬───────────────────┐
              VADER sentiment     BERT sentiment      LDA topic modelling
                    └───────────────────┴───────────────────┘
                                                    ↓
                              ARIMA forecast of monthly sentiment
                                                    ↓
                                     interactive dashboard
```

### Collection
YouTube comments and video transcripts for each of the six target occupations.

### Cleaning
Deduplication on ID, date parsing and validation, non-English removal via `langdetect`, spam filtering on word count (under 5 or over 500), HTML entity stripping, and removal of bracketed transcript noise like `[Music]`. Rows are then tagged for Australian/Victorian relevance and for occupation keywords, with a cleaning report written out so the drop rate at each stage is visible.

### Sentiment — measured two ways
This is deliberate. **VADER** is lexicon-based and fast; **BERT** (`cardiffnlp/twitter-roberta-base-sentiment-latest`) is a fine-tuned transformer.

To make them comparable, the BERT compound score is derived as `P(positive) − P(negative)`, putting it on the same [−1, +1] scale as VADER's compound. Where the two methods agree, the signal is more trustworthy; where they diverge, it flags text one of them is handling badly — typically sarcasm or domain-specific language, which VADER's lexicon misses.

### Topic modelling
LDA (`sklearn`) over cleaned transcripts, per occupation, with a custom stopword list on top of the standard English set to remove conversational filler that dominates spoken transcripts — *just, like, really, yeah, actually* — which otherwise swamp the topics.

### Forecasting
ARIMA on the monthly BERT sentiment series per occupation. Order `(p,d,q)` is selected by grid search over 18 combinations, chosen by AIC rather than assumed. Forecasts run 12 months ahead with 95% confidence intervals.

---

## Dashboard

A multi-page interactive dashboard:

| Page | Shows |
|---|---|
| `index` | Overview |
| `industry` | Projections by industry |
| `occupation` | Occupation-level detail |
| `geographic` | Regional breakdown |
| `sentiment` | Sentiment over time with ARIMA forecasts |
| `topic_modelling` | Topics per occupation |

Built with HTML/JS, charting libraries and a Gulp build.

---

## Running it

```bash
pip install -r requirements.txt

python youtube_collection.py        # collect comments and transcripts
python youtube_cleaning.py          # clean and tag
python youtube_sentiment.py         # VADER
python youtube_bert_sentiment.py    # BERT
python youtube_topic_modelling.py   # LDA
python youtube_arima_forecast.py    # ARIMA forecasts
python export_sentiment_json.py     # export for the dashboard

# then serve public/
```

---

## Notes on method

**Two sentiment models rather than one.** Running both VADER and BERT gives a cross-check. A single method's output has no obvious failure signal; two methods disagreeing tells you where to look.

**ARIMA order is searched, not assumed.** Grid search over `(p,d,q)` selected by AIC, rather than defaulting to a common order and hoping.

**Cleaning is reported, not silent.** The pipeline writes a report of what was kept and dropped at each stage, so the sample the analysis runs on is inspectable.

---

## Limitations

- YouTube comments are not a representative sample of any workforce. They skew toward people motivated to comment, and toward whatever the video's audience is.
- Sentiment about an *occupation topic* is not the same as sentiment *among workers in it*.
- Monthly series are short, which limits how much ARIMA can reasonably be asked to do — the confidence intervals widen quickly.
- Both sentiment models are trained on general or Twitter English, not occupational discussion.

---

## Data

Employment projections: `employment_projections_data_2025-35.xlsx` (Jobs and Skills Australia, Victoria).
