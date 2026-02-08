import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import seaborn as sns
import io
import base64
import os

# ── Global theme ─────────────────────────────────────────────────────
sns.set_theme(
    style="whitegrid",
    rc={
        "figure.facecolor":  "#ffffff",
        "axes.facecolor":    "#ffffff",
        "axes.edgecolor":    "#d1d5db",
        "axes.labelcolor":   "#374151",
        "text.color":        "#374151",
        "xtick.color":       "#6b7280",
        "ytick.color":       "#6b7280",
        "grid.color":        "#f3f4f6",
        "grid.linestyle":    "--",
        "font.family":       "sans-serif",
        "font.size":         11,
    }
)

PALETTE = sns.color_palette([
    "#0d9373", "#5b3fcc", "#e05d44", "#f59e0b",
    "#06b6d4", "#8b5cf6", "#ec4899", "#10b981",
    "#3b82f6", "#f97316",
])


def _fig_to_base64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=140, bbox_inches='tight',
                facecolor=fig.get_facecolor())
    buf.seek(0)
    encoded = base64.b64encode(buf.read()).decode('utf-8')
    plt.close(fig)
    return encoded


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


def make_histogram(series: pd.Series, col_name: str) -> str:
    clean = pd.to_numeric(series.dropna(), errors='coerce').dropna()
    if clean.empty:
        return ""

    fig, ax = plt.subplots(figsize=(7, 4))

    # Optimal bins – Freedman-Diaconis with fallback
    q75, q25 = np.percentile(clean, [75, 25])
    iqr = q75 - q25
    if iqr > 0:
        bin_width = 2 * iqr * (len(clean) ** (-1 / 3))
        n_bins = max(int(np.ceil((clean.max() - clean.min()) / bin_width)), 5)
    else:
        n_bins = min(int(np.sqrt(len(clean))), 30)
    n_bins = min(n_bins, 50)

    sns.histplot(clean, bins=n_bins, kde=False, color=PALETTE[0],
                 edgecolor="#ffffff", linewidth=.8, alpha=.75, ax=ax)

    # Annotate bar counts
    for patch in ax.patches:
        h = patch.get_height()
        if h > 0:
            ax.text(patch.get_x() + patch.get_width() / 2, h,
                    f'{int(h)}', ha='center', va='bottom',
                    fontsize=8, fontweight='600', color='#374151')

    ax.set_xlabel(col_name, fontweight='600', fontsize=11)
    ax.set_ylabel('Frequency', fontweight='600', fontsize=11)
    ax.set_title(f'Distribution of {col_name}', fontweight='700',
                 fontsize=13, pad=12, color='#111827')
    ax.yaxis.set_major_locator(ticker.MaxNLocator(integer=True))
    sns.despine(left=True, bottom=True)
    fig.tight_layout()
    return _fig_to_base64(fig)


def make_bar_chart(series: pd.Series, col_name: str) -> str:
    clean = series.dropna().astype(str)
    if clean.empty:
        return ""

    value_counts = clean.value_counts()
    categories = value_counts.index.tolist()
    counts = value_counts.values

    fig, ax = plt.subplots(figsize=(7, 4))

    colors = [PALETTE[i % len(PALETTE)] for i in range(len(categories))]
    bars = ax.bar(categories, counts, color=colors, edgecolor="#ffffff",
                  linewidth=.8, alpha=.85)

    # Annotate bar counts
    for bar, count in zip(bars, counts):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height(),
                f'{int(count)}', ha='center', va='bottom',
                fontsize=9, fontweight='600', color='#374151')

    # Truncate long labels
    labels = [c if len(c) <= 18 else c[:16] + '…' for c in categories]
    ax.set_xticks(range(len(categories)))
    ax.set_xticklabels(labels, rotation=30, ha='right', fontsize=9)
    ax.set_xlabel(col_name, fontweight='600', fontsize=11)
    ax.set_ylabel('Count', fontweight='600', fontsize=11)
    ax.set_title(f'Value Counts of {col_name}', fontweight='700',
                 fontsize=13, pad=12, color='#111827')
    ax.yaxis.set_major_locator(ticker.MaxNLocator(integer=True))
    sns.despine(left=True, bottom=True)
    fig.tight_layout()
    return _fig_to_base64(fig)


def detect_outliers(series: pd.Series) -> list[dict]:
    numeric = pd.to_numeric(series, errors='coerce')
    clean = numeric.dropna()
    if clean.empty or len(clean) < 4:
        return []

    q1 = clean.quantile(0.25)
    q3 = clean.quantile(0.75)
    iqr = q3 - q1
    lower = q1 - 1.5 * iqr
    upper = q3 + 1.5 * iqr

    outliers = []
    for idx, val in numeric.items():
        if pd.notna(val) and (val < lower or val > upper):
            outliers.append({"row": int(idx) + 1, "value": round(float(val), 4)})
    return outliers


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
        "column_analysis": [],
    }

    for col in df.columns:
        series = df[col]
        category = categorise_column(series)
        missing = int(series.isna().sum())

        if category == "Both Numerical and Categorical":
            result["column_analysis"].append({
                "name": col,
                "category": category,
                "missing": missing,
                "missing_msg": f"Total missing values are : {missing}",
                "chart": make_histogram(series, col),
                "chart2": make_bar_chart(series, col),
                "outliers": detect_outliers(series),
            })
            continue

        chart = ""
        if category == "Numerical":
            chart = make_histogram(series, col)
        elif category == "Categorical":
            chart = make_bar_chart(series, col)

        outliers = detect_outliers(series) if category == "Numerical" else []

        result["column_analysis"].append({
            "name": col,
            "category": category,
            "missing": missing,
            "missing_msg": f"Total missing values are : {missing}",
            "chart": chart,
            "chart2": "",
            "outliers": outliers,
        })

    return result