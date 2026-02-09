import pandas as pd
import numpy as np
import os
import logging
import traceback

# ── Logger setup ──────────────────────────────────────────────
LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s | %(levelname)-7s | %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(LOG_DIR, 'analysis.log'), encoding='utf-8'),
        logging.StreamHandler(),
    ]
)
log = logging.getLogger('data_analyser')

# ── High-cardinality threshold (for STRING columns only) ──────
STRING_CARDINALITY_THRESHOLD = 0.85


# ──────────────────────────────────────────────────────────────
#  COLUMN CLASSIFICATION
# ──────────────────────────────────────────────────────────────
def classify_column(series: pd.Series, col_name: str, total_rows: int) -> str:
    """
    Classify into: Numerical, String, Date, or Skipped.
    Skipped = identifier columns (sequential integer IDs or high-cardinality strings).
    No mixed type category.

    IMPORTANT: Continuous numerical data (salary, scores, etc.) is NEVER skipped.
    Only sequential integer IDs are skipped among numerical columns.
    """
    clean = series.dropna()
    if clean.empty:
        log.debug(f"  [{col_name}] all NaN → String")
        return "String"

    unique = clean.nunique()
    ratio = unique / total_rows if total_rows > 0 else 0

    # ── Check if date ─────────────────────────────────────────
    if _is_date_column(clean, col_name):
        log.debug(f"  [{col_name}] detected as Date (unique={unique})")
        return "Date"

    # ── Check if numeric ──────────────────────────────────────
    numeric_vals = pd.to_numeric(clean, errors='coerce')
    num_ratio = numeric_vals.notna().sum() / len(clean)

    if num_ratio >= 0.8:
        # Only skip if it looks like a sequential integer ID
        if _is_sequential_id(numeric_vals.dropna(), col_name, ratio, unique):
            log.debug(f"  [{col_name}] Sequential integer ID → Skipped")
            return "Skipped"
        log.debug(f"  [{col_name}] → Numerical (num_ratio={num_ratio:.2%}, unique={unique})")
        return "Numerical"

    # ── String ────────────────────────────────────────────────
    if ratio > STRING_CARDINALITY_THRESHOLD and unique > 50:
        log.debug(f"  [{col_name}] String high cardinality ({ratio:.2%}) → Skipped (likely ID/name)")
        return "Skipped"

    log.debug(f"  [{col_name}] → String (unique={unique})")
    return "String"


def _is_sequential_id(numeric_clean: pd.Series, col_name: str,
                       ratio: float, unique: int) -> bool:
    """
    Detect sequential integer IDs (e.g. Employee_ID = 1,2,3,...5000).
    Must satisfy ALL of:
      1. Very high cardinality (>95% unique AND unique > 100)
      2. All values are integers (no decimals)
      3. Values look sequential: sorted diffs are mostly 1, or
         column name contains 'id'/'key'/'index'/'code'/'no'/'num'
    """
    if ratio < 0.95 or unique <= 100:
        return False

    # Must be all-integer (no fractional parts)
    if not all(v == int(v) for v in numeric_clean.head(200)):
        return False

    # Column name hints
    id_hints = ['_id', 'id_', 'key', 'index', 'idx', 'code', '_no', '_num',
                'serial', 'pk', 'fk', 'identifier']
    name_lower = col_name.lower()
    if name_lower == 'id' or any(h in name_lower for h in id_hints):
        log.debug(f"  [{col_name}] Name matches ID pattern")
        return True

    # Check if sequential: sort and look at diffs
    try:
        sorted_vals = numeric_clean.sort_values().values
        diffs = np.diff(sorted_vals)
        if len(diffs) > 0:
            # Sequential if most diffs are equal (constant step like 1,2,3...)
            most_common_diff = pd.Series(diffs).mode().iloc[0] if len(diffs) > 0 else 0
            sequential_pct = (diffs == most_common_diff).sum() / len(diffs)
            if sequential_pct > 0.90 and most_common_diff > 0:
                log.debug(f"  [{col_name}] Sequential pattern detected (step={most_common_diff}, {sequential_pct:.0%} consistent)")
                return True
    except Exception:
        pass

    return False


def _is_date_column(clean: pd.Series, col_name: str) -> bool:
    """Heuristic: try parsing a sample as dates."""
    try:
        # Check dtype first
        if pd.api.types.is_datetime64_any_dtype(clean):
            return True

        # Check column name hints
        date_hints = ['date', 'time', 'timestamp', 'created', 'updated', 'dt',
                      'dob', 'birth', 'start', 'end', 'expiry', 'due']
        name_lower = col_name.lower()
        has_hint = any(h in name_lower for h in date_hints)

        # Try parsing a sample
        sample = clean.head(50).astype(str)
        parsed = pd.to_datetime(sample, errors='coerce', format='mixed')
        parse_ratio = parsed.notna().sum() / len(sample)

        if parse_ratio >= 0.8:
            return True
        if has_hint and parse_ratio >= 0.5:
            return True

        return False
    except Exception:
        return False


# ──────────────────────────────────────────────────────────────
#  CHART DATA BUILDERS
# ──────────────────────────────────────────────────────────────
def histogram_data(series: pd.Series, col_name: str) -> dict:
    """Histogram bins + counts as JSON."""
    try:
        clean = pd.to_numeric(series.dropna(), errors='coerce').dropna()
        if clean.empty or len(clean) < 2:
            return {}

        q75, q25 = np.percentile(clean, [75, 25])
        iqr = q75 - q25
        if iqr > 0:
            bin_width = 2 * iqr * (len(clean) ** (-1 / 3))
            n_bins = max(int(np.ceil((clean.max() - clean.min()) / bin_width)), 5)
        else:
            n_bins = min(int(np.sqrt(len(clean))), 30)
        n_bins = min(n_bins, 50)

        counts, edges = np.histogram(clean, bins=n_bins)
        labels = [f"{round(float(edges[i]),1)} – {round(float(edges[i+1]),1)}"
                  for i in range(len(counts))]

        return {
            "type": "histogram",
            "title": f"Distribution of {col_name}",
            "labels": labels,
            "values": [int(c) for c in counts],
            "x_label": col_name,
            "y_label": "Frequency",
        }
    except Exception as e:
        log.error(f"  [{col_name}] histogram_data error: {e}")
        return {}


def bar_chart_data(series: pd.Series, col_name: str) -> dict:
    """Bar chart categories + counts as JSON."""
    try:
        clean = series.dropna().astype(str)
        if clean.empty:
            return {}

        value_counts = clean.value_counts().head(30)  # cap at 30 categories
        return {
            "type": "bar",
            "title": f"Value Counts of {col_name}",
            "labels": value_counts.index.tolist(),
            "values": [int(c) for c in value_counts.values],
            "x_label": col_name,
            "y_label": "Count",
        }
    except Exception as e:
        log.error(f"  [{col_name}] bar_chart_data error: {e}")
        return {}


def detect_outliers(series: pd.Series) -> dict:
    """IQR-based outlier detection."""
    try:
        numeric = pd.to_numeric(series, errors='coerce')
        clean = numeric.dropna()
        if clean.empty or len(clean) < 4:
            return {"rows": [], "total": 0}

        q1 = clean.quantile(0.25)
        q3 = clean.quantile(0.75)
        iqr = q3 - q1
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr

        outliers = []
        for idx, val in numeric.items():
            if pd.notna(val) and (val < lower or val > upper):
                outliers.append({"row": int(idx) + 1, "value": round(float(val), 1)})

        return {
            "rows": outliers[:5],
            "total": len(outliers),
            "lower_threshold": round(float(lower), 1),
            "upper_threshold": round(float(upper), 1),
        }
    except Exception as e:
        log.error(f"  detect_outliers error: {e}")
        return {"rows": [], "total": 0}


def boxplot_data(series: pd.Series) -> dict:
    """Five-number summary + outlier points for box plot."""
    try:
        clean = pd.to_numeric(series, errors='coerce').dropna()
        if clean.empty or len(clean) < 4:
            return {}

        q1 = float(clean.quantile(0.25))
        q3 = float(clean.quantile(0.75))
        iqr = q3 - q1
        whisker_lo = float(clean[clean >= q1 - 1.5 * iqr].min())
        whisker_hi = float(clean[clean <= q3 + 1.5 * iqr].max())
        bp_outliers = clean[(clean < q1 - 1.5 * iqr) | (clean > q3 + 1.5 * iqr)]

        return {
            "min": round(whisker_lo, 1),
            "q1": round(q1, 1),
            "median": round(float(clean.median()), 1),
            "q3": round(q3, 1),
            "max": round(whisker_hi, 1),
            "outliers": [round(float(v), 1) for v in bp_outliers.values[:50]],
        }
    except Exception as e:
        log.error(f"  boxplot_data error: {e}")
        return {}


# ──────────────────────────────────────────────────────────────
#  READ FILE  (handles multi-sheet Excel)
# ──────────────────────────────────────────────────────────────
def read_file(filepath: str) -> tuple:
    """
    Returns (df, sheet_info, error_msg).
    sheet_info is a list of sheet names for Excel files (empty for CSV).
    """
    ext = os.path.splitext(filepath)[1].lower()
    log.info(f"Reading file: {filepath} (ext={ext})")

    try:
        if ext in ('.xls', '.xlsx', '.xlsm'):
            xls = pd.ExcelFile(filepath)
            sheet_names = xls.sheet_names
            log.info(f"  Excel file has {len(sheet_names)} sheet(s): {sheet_names}")

            if len(sheet_names) == 0:
                return None, [], "Excel file contains no sheets."

            # Read first sheet
            df = pd.read_excel(xls, sheet_name=sheet_names[0])
            log.info(f"  Using sheet '{sheet_names[0]}': {df.shape[0]} rows × {df.shape[1]} cols")

            if df.empty or df.shape[1] < 1:
                # Try other sheets
                for sname in sheet_names[1:]:
                    try:
                        df2 = pd.read_excel(xls, sheet_name=sname)
                        if not df2.empty and df2.shape[1] >= 1:
                            log.info(f"  First sheet empty, using '{sname}': {df2.shape[0]} rows × {df2.shape[1]} cols")
                            return df2, sheet_names, None
                    except Exception as e2:
                        log.warning(f"  Error reading sheet '{sname}': {e2}")
                return None, sheet_names, f"All {len(sheet_names)} sheets are empty or unreadable."

            return df, sheet_names, None

        elif ext == '.tsv':
            df = pd.read_csv(filepath, sep='\t')
            log.info(f"  TSV parsed: {df.shape[0]} rows × {df.shape[1]} cols")
            return df, [], None

        else:
            # Try CSV with different encodings
            for enc in ['utf-8', 'latin-1', 'cp1252']:
                try:
                    df = pd.read_csv(filepath, encoding=enc)
                    log.info(f"  CSV parsed (encoding={enc}): {df.shape[0]} rows × {df.shape[1]} cols")
                    return df, [], None
                except UnicodeDecodeError:
                    continue
                except Exception as e:
                    log.warning(f"  CSV parse attempt (encoding={enc}) failed: {e}")
                    continue

            return None, [], "Could not parse CSV file. Check the file encoding and format."

    except Exception as e:
        log.error(f"  read_file error: {e}\n{traceback.format_exc()}")
        return None, [], f"Error reading file: {str(e)}"


# ──────────────────────────────────────────────────────────────
#  MAIN ANALYSIS
# ──────────────────────────────────────────────────────────────
def analyse_file(filepath: str) -> dict:
    log.info("=" * 60)
    log.info(f"ANALYSIS START: {os.path.basename(filepath)}")
    log.info("=" * 60)

    # ── Read file ─────────────────────────────────────────────
    df, sheet_names, read_error = read_file(filepath)

    if read_error or df is None:
        msg = read_error or "Could not read file. Please check the format."
        log.error(f"  FILE READ FAILED: {msg}")
        return {"valid": False, "message": msg}

    if df.empty or df.shape[1] < 1:
        log.error("  DataFrame is empty after reading")
        return {"valid": False, "message": "The file appears to be empty or has no columns."}

    log.info(f"  DataFrame shape: {df.shape[0]} rows × {df.shape[1]} columns")
    log.info(f"  Columns: {df.columns.tolist()}")

    # ── Data quality ──────────────────────────────────────────
    total_cells = int(df.shape[0] * df.shape[1])
    total_missing = int(df.isna().sum().sum())
    overall_quality = round((1 - total_missing / total_cells) * 100, 1) if total_cells > 0 else 100.0
    log.info(f"  Data quality: {overall_quality}% ({total_missing} missing of {total_cells} cells)")

    result = {
        "valid": True,
        "message": "File analysed successfully",
        "rows": int(df.shape[0]),
        "columns": int(df.shape[1]),
        "sheet_names": sheet_names,
        "column_names": df.columns.tolist(),
        "preview": [],
        "preview_columns": df.columns.tolist(),
        "data_quality": {
            "overall": overall_quality,
            "total_cells": total_cells,
            "total_missing": total_missing,
        },
        "correlation": {},
        "column_analysis": [],
        "log_messages": [],
    }

    # ── Preview ───────────────────────────────────────────────
    try:
        preview_df = df.head(5).copy()
        for c in preview_df.columns:
            preview_df[c] = preview_df[c].apply(
                lambda v: str(v) if pd.notna(v) else ""
            )
        result["preview"] = preview_df.to_dict(orient="records")
    except Exception as e:
        log.error(f"  Preview generation error: {e}")
        result["log_messages"].append(f"Could not generate preview: {e}")

    # ── Per-column analysis ───────────────────────────────────
    total_rows = len(df)
    for col in df.columns:
        try:
            series = df[col]
            category = classify_column(series, col, total_rows)
            missing = int(series.isna().sum())
            unique = int(series.nunique())
            dtype = str(series.dtype)
            quality = round((1 - missing / total_rows) * 100, 1) if total_rows > 0 else 100.0

            col_entry = {
                "name": col,
                "category": category,
                "dtype": dtype,
                "unique": unique,
                "quality": quality,
                "stats": {},
                "boxplot": {},
                "missing": missing,
                "chart": {},
                "chart2": {},
                "outliers": {"rows": [], "total": 0},
            }

            if category == "Skipped":
                col_entry["skip_reason"] = f"High cardinality ({unique} unique of {total_rows} rows — likely an identifier)"
                log.info(f"  [{col}] SKIPPED: high cardinality")
                result["column_analysis"].append(col_entry)
                result["log_messages"].append(f"Column '{col}' skipped: high cardinality (likely ID/key)")
                continue

            if category == "Numerical":
                numeric_clean = pd.to_numeric(series, errors='coerce').dropna()
                if len(numeric_clean) > 0:
                    col_entry["stats"] = {
                        "min":    round(float(numeric_clean.min()), 1),
                        "max":    round(float(numeric_clean.max()), 1),
                        "mean":   round(float(numeric_clean.mean()), 1),
                        "median": round(float(numeric_clean.median()), 1),
                        "std":    round(float(numeric_clean.std()), 1),
                    }
                    col_entry["boxplot"] = boxplot_data(series)
                    col_entry["chart"] = histogram_data(series, col)
                    col_entry["outliers"] = detect_outliers(series)
                log.info(f"  [{col}] Numerical analysis complete")

            elif category == "String":
                col_entry["chart"] = bar_chart_data(series, col)
                log.info(f"  [{col}] String analysis complete")

            elif category == "Date":
                try:
                    dates = pd.to_datetime(series, errors='coerce', format='mixed')
                    valid_dates = dates.dropna()
                    if len(valid_dates) > 0:
                        col_entry["stats"] = {
                            "min": str(valid_dates.min().strftime('%Y-%m-%d')),
                            "max": str(valid_dates.max().strftime('%Y-%m-%d')),
                        }
                    log.info(f"  [{col}] Date analysis complete (min={col_entry['stats'].get('min')}, max={col_entry['stats'].get('max')})")
                except Exception as e:
                    log.error(f"  [{col}] Date parse error: {e}")
                    result["log_messages"].append(f"Column '{col}': date parsing error — {e}")

            result["column_analysis"].append(col_entry)

        except Exception as e:
            log.error(f"  [{col}] Column analysis FAILED: {e}\n{traceback.format_exc()}")
            result["column_analysis"].append({
                "name": col,
                "category": "Error",
                "dtype": str(df[col].dtype),
                "unique": 0,
                "quality": 0,
                "stats": {},
                "boxplot": {},
                "missing": 0,
                "chart": {},
                "chart2": {},
                "outliers": {"rows": [], "total": 0},
                "error": str(e),
            })
            result["log_messages"].append(f"Column '{col}' analysis failed: {e}")

    # ── Correlation matrix (Numerical columns only) ───────────
    try:
        num_cols = [c["name"] for c in result["column_analysis"] if c["category"] == "Numerical"]
        if len(num_cols) >= 2:
            num_df = df[num_cols].apply(pd.to_numeric, errors='coerce')
            corr = num_df.corr()
            result["correlation"] = {
                "columns": num_cols,
                "matrix": [[round(float(corr.iloc[i, j]), 2) for j in range(len(num_cols))]
                            for i in range(len(num_cols))],
            }
            log.info(f"  Correlation matrix: {len(num_cols)}×{len(num_cols)}")
    except Exception as e:
        log.error(f"  Correlation matrix error: {e}")
        result["log_messages"].append(f"Correlation matrix error: {e}")

    analysed = sum(1 for c in result["column_analysis"] if c["category"] not in ("Skipped", "Error"))
    skipped = sum(1 for c in result["column_analysis"] if c["category"] == "Skipped")
    errors = sum(1 for c in result["column_analysis"] if c["category"] == "Error")
    log.info(f"  ANALYSIS COMPLETE: {analysed} analysed, {skipped} skipped, {errors} errors")
    log.info("=" * 60)

    return result
