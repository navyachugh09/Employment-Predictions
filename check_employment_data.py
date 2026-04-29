import pandas as pd
import numpy as np
 
INPUT_FILE = "data/employment_projections_data_2025-35.xlsx"
OUTPUT_FILE = "data/employment_projections_cleaned.xlsx"
 
# --- Load ---
df = pd.read_excel(INPUT_FILE, sheet_name="Employment Projections 2025-35", header=0)
print(f"Loaded: {df.shape[0]:,} rows, {df.shape[1]} columns")
 
# --- 1. Rename columns to clean snake_case names ---
df.columns = [
    "region",
    "industry",
    "anzsco4_code",
    "occupation",
    "employment_2025",
    "annual_growth_rate_pct",
    "employment_growth",
    "retirements",
    "total_new_workers",
]
 
# --- 2. Strip whitespace from string columns ---
for col in ["region", "industry", "occupation"]:
    df[col] = df[col].str.strip()
 
# --- 3. Replace 1e-8 placeholder values with 0 ---
# These are used as near-zero sentinels for occupations with negligible employment
PLACEHOLDER = 1e-8
numeric_cols = ["employment_2025", "annual_growth_rate_pct", "employment_growth", "retirements", "total_new_workers"]
placeholder_mask = (df[numeric_cols] == PLACEHOLDER)
placeholder_rows_before = placeholder_mask.any(axis=1).sum()
df[numeric_cols] = df[numeric_cols].replace(PLACEHOLDER, 0.0)
# Also zero out near-zero noise on rows that were placeholders (values like 2e-9)
tiny_threshold = 1e-6
for col in numeric_cols:
    df.loc[df[col].abs() < tiny_threshold, col] = 0.0
print(f"Replaced placeholder values in {placeholder_rows_before:,} rows")
 
# --- 4. Cast ANZSCO code to string with zero-padding (4 digits) ---
df["anzsco4_code"] = df["anzsco4_code"].astype(str).str.zfill(4)
 
# --- 5. Round numeric columns to sensible precision ---
df["employment_2025"] = df["employment_2025"].round(2)
df["annual_growth_rate_pct"] = df["annual_growth_rate_pct"].round(6)
df["employment_growth"] = df["employment_growth"].round(2)
df["retirements"] = df["retirements"].round(2)
df["total_new_workers"] = df["total_new_workers"].round(2)
 
# --- 6. Add derived flag: is_negligible ---
# Flag occupations with no meaningful employment in a region/industry combo
df["is_negligible"] = (df["employment_2025"] == 0).astype(int)
 
# --- 7. Verification ---
assert df.isnull().sum().sum() == 0, "Unexpected nulls found"
assert (df["employment_2025"] < 0).sum() == 0, "Negative employment found"
tol_check = (df["total_new_workers"] - (df["employment_growth"] + df["retirements"])).abs()
assert (tol_check > 0.1).sum() == 0, "total_new_workers != employment_growth + retirements"
print("All verification checks passed")
 
# --- Summary ---
print(f"\nCleaned: {df.shape[0]:,} rows")
print(f"  Negligible-employment rows flagged: {df['is_negligible'].sum():,}")
print(f"  Regions: {df['region'].nunique()}")
print(f"  Industries: {df['industry'].nunique()}")
print(f"  Unique occupations: {df['occupation'].nunique()}")
 
# --- Save ---
df.to_excel(OUTPUT_FILE, index=False, sheet_name="Employment Projections 2025-35")
print(f"\nSaved to: {OUTPUT_FILE}")
 