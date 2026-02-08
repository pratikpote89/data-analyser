# Data Analyser

A locally-running web app that lets you upload tabular data files (CSV, TSV, Excel) and performs automated exploratory data analysis with visualisations.

## Features

- **Upload** CSV, TSV, XLS, XLSX files (up to 50 MB)
- **Auto-detect** column types: Numerical, Categorical, or Both
- **Histograms** for numerical columns (optimal binning, bar-count labels)
- **Bar charts** for categorical columns (value counts)
- **Missing value** detection per column
- **Outlier detection** using the IQR method (row numbers + values)

## Setup

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run the app
python app.py

# 3. Open in browser
# http://localhost:5000
```

## Project Structure

```
data-analyser/
├── app.py              # Flask backend (upload + analyse endpoints)
├── analysis.py         # Core analysis logic (categorise, charts, outliers)
├── requirements.txt    # Python dependencies
├── sample_data.csv     # Sample test file
├── templates/
│   └── index.html      # Single-page UI
├── static/
│   ├── style.css       # Dark-theme styling
│   └── script.js       # Frontend logic
└── uploads/            # Temporary file storage
```

## Usage

1. Click **Upload** → pick a CSV or Excel file
2. Click **Analyse** → view results in the analysis panel below
3. Each column shows its type, chart, missing values, and outliers
