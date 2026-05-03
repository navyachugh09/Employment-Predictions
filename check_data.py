import pandas as pd
import numpy as np

INPUT_FILE = "data/employment_projections_cleaned.xlsx"

df = pd.read_excel(INPUT_FILE, dtype={"anzsco4_code": str})
print(f"Loaded: {df.shape[0]:,} rows, {df.shape[1]} columns\n")

# --- Nulls ---
print("=== NULLS ===")
nulls = df.isnull().sum()
print(nulls if nulls.any() else "None found")

# --- Empty strings ---
print("\n=== EMPTY STRINGS ===")
str_cols = df.select_dtypes(include="object").columns
for col in str_cols:
    empty = (df[col].str.strip() == "").sum()
    if empty:
        print(f"  {col}: {empty}")
print("None found" if all((df[c].str.strip() == "").sum() == 0 for c in str_cols) else "")

# --- Duplicates ---
print("\n=== DUPLICATES ===")
print(f"  Full row duplicates:                  {df.duplicated().sum()}")
print(f"  Duplicate region+industry+anzsco4 combos: {df.duplicated(subset=['region','industry','anzsco4_code']).sum()}")

# --- Negative values ---
print("\n=== NEGATIVE VALUES ===")
check_cols = ["employment_2025", "employment_growth", "retirements", "total_new_workers"]
for col in check_cols:
    neg = (df[col] < 0).sum()
    note = " (expected: declining occupations)" if col in ("employment_growth", "total_new_workers") else ""
    print(f"  {col}: {neg}{note}")

# --- Numeric summary ---
print("\n=== NUMERIC SUMMARY ===")
print(df.describe().to_string())

# --- Extreme growth rate outliers ---
print("\n=== EXTREME GROWTH RATE OUTLIERS (abs > 50% over 10 years) ===")
outliers = df[df["annual_growth_rate_pct"].abs() > 0.5]
print(f"  Count: {len(outliers)} (typically small employment bases — check employment_2025)")
if len(outliers):
    cols = ["region", "industry", "occupation", "employment_2025", "annual_growth_rate_pct"]
    print(outliers[cols].to_string(index=False))

# --- Negligible rows ---
print("\n=== NEGLIGIBLE EMPLOYMENT ROWS (employment_2025 == 0) ===")
negligible = (df["employment_2025"] == 0).sum()
print(f"  {negligible:,} of {len(df):,} rows ({negligible/len(df)*100:.1f}%)")
print("  These are occupation/region/industry combos with no meaningful employment.")