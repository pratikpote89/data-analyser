# Data Analyser

A locally-running web app that performs automated exploratory data analysis on tabular data files. Upload a CSV, TSV, or Excel file and get instant insights — no coding required.

![Python](https://img.shields.io/badge/Python-3.9+-blue) ![Flask](https://img.shields.io/badge/Flask-Backend-green) ![Chart.js](https://img.shields.io/badge/Chart.js-Interactive_Charts-orange)

## Features

- **One-click workflow** — Click Analyse, pick a file, and get results instantly. No separate upload step.
- **File support** — CSV, TSV, XLS, XLSX files up to 500 MB.
- **Data preview** — First 5 rows shown in a scrollable table.
- **Column-level analysis** — Click any column name to drill into its details:
  - **Auto-categorisation** as Numerical, Categorical, or Both.
  - **Data type and unique value count** displayed on each column tag.
  - **Basic statistics** (Min, Max, Mean, Median, Std Dev) for numerical columns.
  - **Interactive charts** — Histograms for numerical data, bar charts for categorical data. Hover over any bar to see its count (no clutter from permanent labels).
  - **Missing value count** per column.
  - **Outlier detection** using the IQR method. Displays up to 5 outlier rows with decision threshold values (lower and upper bounds).
- **Animated landing page** — Background visuals (charts, graphs, data icons) that fade away once analysis begins.
- **Responsive design** — Works on desktop and mobile screens.

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/pratikpote89/data-analyser.git
cd data-analyser

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run the app
python app.py

# 4. Open in browser
# http://localhost:5000
```

Or double-click **launch.bat** (Windows) to start the app and open your browser automatically.

## Project Structure

```
data-analyser/
├── app.py              # Flask backend (single /analyse endpoint)
├── analysis.py         # Core analysis (categorise, stats, outliers, chart data)
├── requirements.txt    # Python dependencies (Flask, Pandas, NumPy, openpyxl)
├── launch.bat          # Windows desktop launcher
├── sample_data.csv     # 5,000-row test dataset (20 columns)
├── templates/
│   └── index.html      # Single-page UI with Chart.js CDN
├── static/
│   ├── style.css       # Styling with vibrant colour palette
│   └── script.js       # Frontend logic + Chart.js rendering
└── uploads/            # Temporary file storage (auto-created)
```

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, Flask |
| Data processing | Pandas, NumPy |
| Charts | Chart.js (loaded via CDN, rendered in browser) |
| Frontend | HTML, CSS, vanilla JavaScript |

## Sample Data

The included `sample_data.csv` contains 5,000 rows × 20 columns of synthetic employee data with intentional missing values and outliers for testing:

**Columns**: Employee_ID, First_Name, Last_Name, Age, Gender, Department, Job_Level, Years_Experience, Annual_Salary, Monthly_Bonus, Satisfaction_Score, Performance_Rating, Projects_Completed, Overtime_Hours, Sick_Days_Taken, Remote_Work_Pct, Education_Level, City, Engagement_Index, Attrition_Risk

## License

MIT
