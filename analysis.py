import pandas as pd
import numpy as np
import os


def categorise_column(series: pd.Series) -> str:
    clean = series.dropna()
    if clean.empty:
        return "Categorical"

    numeric_vals = pd.to_numeric(clean, errors='coerce')
    num_count = numeric_vals.notna().sum()
    total = len(clean)
    non_num_count = total - num_count

    if non_num_count == 0:
        if clean.nunique() < 10:
            return "Categorical"
        return "Numerical"

    if num_count == 0:
        return "Categorical"

    return "Both Numerical and Categorical"


def histogram_data(series: pd.Series, col_name: str) -> dict:
    """Return histogram bin edges and counts as JSON-friendly dict."""
    clean = pd.to_numeric(series.dropna(), errors='coerce').dropna()
    if clean.empty:
        return {}

    # Optimal bins – Freedman-Diaconis with fallback
    q75, q25 = np.percentile(clean, [75, 25])
    iqr = q75 - q25
    if iqr > 0:
        bin_width = 2 * iqr * (len(clean) ** (-1 / 3))
        n_bins = max(int(np.ceil((clean.max() - clean.min()) / bin_width)), 5)
    else:
        n_bins = min(int(np.sqrt(len(clean))), 30)
    n_bins = min(n_bins, 50)

    counts, edges = np.histogram(clean, bins=n_bins)

    # Build labels as range strings
    labels = []
    for i in range(len(counts)):
        lo = round(float(edges[i]), 1)
        hi = round(float(edges[i + 1]), 1)
        labels.append(f"{lo} – {hi}")

    return {
        "type": "histogram",
        "title": f"Distribution of {col_name}",
        "labels": labels,
        "values": [int(c) for c in counts],
        "x_label": col_name,
        "y_label": "Frequency",
    }


def bar_chart_data(series: pd.Series, col_name: str) -> dict:
    """Return bar chart categories and counts as JSON-friendly dict."""
    clean = series.dropna().astype(str)
    if clean.empty:
        return {}

    value_counts = clean.value_counts()
    return {
        "type": "bar",
        "title": f"Value Counts of {col_name}",
        "labels": value_counts.index.tolist(),
        "values": [int(c) for c in value_counts.values],
        "x_label": col_name,
        "y_label": "Count",
    }


def detect_outliers(series: pd.Series) -> dict:
    """Detect outliers using IQR. Returns dict with rows, thresholds, and truncation info."""
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

    total = len(outliers)
    display = outliers[:5]

    return {
        "rows": display,
        "total": total,
        "lower_threshold": round(float(lower), 1),
        "upper_threshold": round(float(upper), 1),
    }


def analyse_file(filepath: str) -> dict:
    ext = os.path.splitext(filepath)[1].lower()

    try:
        if ext in ('.xls', '.xlsx', '.xlsm'):
            df = pd.read_excel(filepath)
        elif ext == '.tsv':
            df = pd.read_csv(filepath, sep='\t')
        else:
            df = pd.read_csv(filepath)
    except Exception:
        return {"valid": False,
                "message": "Please upload the file in a correct format"}

    if df.empty or df.shape[1] < 1:
        return {"valid": False,
                "message": "Please upload the file in a correct format"}

    result = {
        "valid": True,
        "message": "Uploaded file is in correct format",
        "rows": int(df.shape[0]),
        "columns": int(df.shape[1]),
        "column_names": df.columns.tolist(),
        "preview": df.head(5).fillna("").to_dict(orient="records"),
        "preview_columns": df.columns.tolist(),
        "column_analysis": [],
    }

    for col in df.columns:
        series = df[col]
        category = categorise_column(series)
        missing = int(series.isna().sum())
        unique = int(series.nunique())
        dtype = str(series.dtype)

        # Basic stats (rounded to 1 decimal)
        stats = {}
        numeric_clean = pd.to_numeric(series, errors='coerce').dropna()
        if category in ("Numerical", "Both Numerical and Categorical") and len(numeric_clean) > 0:
            stats = {
                "min":    round(float(numeric_clean.min()), 1),
                "max":    round(float(numeric_clean.max()), 1),
                "mean":   round(float(numeric_clean.mean()), 1),
                "median": round(float(numeric_clean.median()), 1),
                "std":    round(float(numeric_clean.std()), 1),
            }

        # Chart data as JSON (not images)
        chart = {}
        chart2 = {}
        if category == "Numerical":
            chart = histogram_data(series, col)
        elif category == "Categorical":
            chart = bar_chart_data(series, col)
        else:
            chart = histogram_data(series, col)
            chart2 = bar_chart_data(series, col)

        # Outliers
        outliers = detect_outliers(series) if category in ("Numerical", "Both Numerical and Categorical") else {"rows": [], "total": 0}

        result["column_analysis"].append({
            "name": col,
            "category": category,
            "dtype": dtype,
            "unique": unique,
            "stats": stats,
            "missing": missing,
            "missing_msg": f"Total missing values are : {missing}",
            "chart": chart,
            "chart2": chart2,
            "outliers": outliers,
        })

    return result
