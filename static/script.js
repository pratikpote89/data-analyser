(() => {
  const btnAnalyse = document.getElementById('btn-analyse');
  const fileInput   = document.getElementById('file-input');
  const fileBadge   = document.getElementById('file-badge');
  const fileName    = document.getElementById('file-name');
  const btnClear    = document.getElementById('btn-clear');
  const statusEl    = document.getElementById('status');
  const loaderEl    = document.getElementById('loader');
  const resultsEl   = document.getElementById('results');
  const contentEl   = document.getElementById('results-content');
  const detailEl    = document.getElementById('col-detail');
  const bgVisuals   = document.getElementById('bg-visuals');

  let analysisData = null;
  let activeCol    = null;
  let chartInstances = [];  // track Chart.js instances for cleanup

  /* ── Chart color palette ───────────────────────────────── */
  const COLORS = [
    '#3b82f6', '#8b5cf6', '#14b8a6', '#f43f5e', '#f59e0b',
    '#0ea5e9', '#ec4899', '#10b981', '#6366f1', '#f97316',
  ];
  const COLORS_ALPHA = COLORS.map(c => c + '22');

  /* ── Helpers ───────────────────────────────────────────── */
  let fadeTimer = null;
  function showStatus(msg, type = 'info') {
    if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
    statusEl.textContent = msg;
    statusEl.className = `status ${type}`;
    statusEl.classList.remove('hidden');

    if (type === 'success') {
      statusEl.classList.add('auto-fade');
      fadeTimer = setTimeout(() => {
        statusEl.classList.add('hidden');
        statusEl.classList.remove('auto-fade');
      }, 3500);
    }
  }
  function hideStatus() { statusEl.classList.add('hidden'); }
  function showLoader() { loaderEl.classList.remove('hidden'); }
  function hideLoader() { loaderEl.classList.add('hidden'); }

  function destroyCharts() {
    chartInstances.forEach(c => c.destroy());
    chartInstances = [];
  }

  /* ── Analyse button → open file picker ─────────────────── */
  btnAnalyse.addEventListener('click', () => fileInput.click());

  /* ── File selected → upload + analyse ──────────────────── */
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    hideStatus();
    resultsEl.classList.add('hidden');
    contentEl.innerHTML = '';
    detailEl.innerHTML = '';
    destroyCharts();
    analysisData = null;
    activeCol = null;

    fileName.textContent = file.name;
    fileBadge.classList.remove('hidden');

    const formData = new FormData();
    formData.append('file', file);

    try {
      showLoader();
      const res = await fetch('/analyse', { method: 'POST', body: formData });
      const data = await res.json();
      hideLoader();

      if (!data.ok) {
        showStatus(data.error || 'Analysis failed.', 'error');
        return;
      }

      const r = data.result;
      if (!r.valid) {
        showStatus(r.message, 'error');
        return;
      }

      showStatus(r.message, 'success');
      analysisData = r;

      // Fade out background visuals
      bgVisuals.classList.add('fade-out');

      renderSummary(r);

    } catch (err) {
      hideLoader();
      showStatus('Network error. Please try again.', 'error');
    }
  });

  /* ── Clear file ────────────────────────────────────────── */
  btnClear.addEventListener('click', () => {
    fileInput.value = '';
    fileBadge.classList.add('hidden');
    hideStatus();
    resultsEl.classList.add('hidden');
    contentEl.innerHTML = '';
    detailEl.innerHTML = '';
    destroyCharts();
    analysisData = null;
    activeCol = null;
    bgVisuals.classList.remove('fade-out');
  });

  /* ── Render summary ────────────────────────────────────── */
  function renderSummary(r) {
    let html = '';

    // Summary cards
    html += `<div class="summary-grid">
      <div class="summary-card"><div class="label">Total Rows</div><div class="value">${r.rows.toLocaleString()}</div></div>
      <div class="summary-card"><div class="label">Total Columns</div><div class="value">${r.columns}</div></div>
    </div>`;

    // Data preview (5 rows)
    if (r.preview && r.preview.length > 0) {
      html += `<div class="preview-section">`;
      html += `<h3 class="section-title">Data Preview <span class="section-hint">first ${r.preview.length} rows</span></h3>`;
      html += `<div class="preview-scroll"><table class="preview-table"><thead><tr>`;
      r.preview_columns.forEach(col => { html += `<th>${esc(String(col))}</th>`; });
      html += `</tr></thead><tbody>`;
      r.preview.forEach(row => {
        html += `<tr>`;
        r.preview_columns.forEach(col => {
          const val = row[col] != null ? String(row[col]) : '';
          html += `<td>${esc(val)}</td>`;
        });
        html += `</tr>`;
      });
      html += `</tbody></table></div></div>`;
    }

    // Column tags – 5 per row, 2-row scroll window
    html += `<div class="col-list"><h3 class="section-title">Columns <span class="section-hint">click to view analysis</span></h3>`;
    html += `<div class="col-tags-scroll"><div class="col-tags">`;
    r.column_names.forEach(name => {
      const cd = r.column_analysis.find(c => c.name === name);
      const dtype = cd ? cd.dtype : '';
      const unique = cd ? cd.unique : '';
      html += `<span class="col-tag" data-col="${esc(name)}">
        <span class="col-tag-name">${esc(name)}</span>
        <span class="col-tag-meta">${esc(dtype)} · ${unique} uniq</span>
      </span>`;
    });
    html += `</div></div></div>`;

    contentEl.innerHTML = html;
    resultsEl.classList.remove('hidden');

    contentEl.querySelectorAll('.col-tag').forEach(tag => {
      tag.addEventListener('click', () => selectColumn(tag.getAttribute('data-col')));
    });
  }

  /* ── Select column ─────────────────────────────────────── */
  function selectColumn(colName) {
    if (activeCol === colName) {
      activeCol = null;
      detailEl.innerHTML = '';
      destroyCharts();
      contentEl.querySelectorAll('.col-tag').forEach(t => t.classList.remove('active'));
      return;
    }

    activeCol = colName;
    contentEl.querySelectorAll('.col-tag').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-col') === colName);
    });

    const col = analysisData.column_analysis.find(c => c.name === colName);
    if (!col) { detailEl.innerHTML = ''; return; }

    renderColumnDetail(col);
  }

  /* ── Column detail panel ───────────────────────────────── */
  function renderColumnDetail(col) {
    destroyCharts();

    const badgeClass = col.category === 'Numerical' ? 'num'
                     : col.category === 'Categorical' ? 'cat' : 'both';

    let html = `<div class="col-detail-panel"><div class="col-section">`;

    // Header
    html += `<div class="col-header">
      <h3>${esc(col.name)}</h3>
      <span class="badge ${badgeClass}">${esc(col.category)}</span>
      <span class="badge dtype">${esc(col.dtype)}</span>
    </div>`;

    // Quick chips
    html += `<div class="quick-info">
      <span class="quick-chip">Unique values: <strong>${col.unique}</strong></span>
      <span class="quick-chip">Missing: <strong>${col.missing}</strong></span>
    </div>`;

    // Stats
    if (col.stats && Object.keys(col.stats).length > 0) {
      html += `<div class="stats-grid">`;
      const labels = { min: 'Min', max: 'Max', mean: 'Mean', median: 'Median', std: 'Std Dev' };
      for (const [key, label] of Object.entries(labels)) {
        if (col.stats[key] !== undefined) {
          html += `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${col.stats[key].toLocaleString()}</div></div>`;
        }
      }
      html += `</div>`;
    }

    // Chart containers (Chart.js will render into these)
    if (col.chart && col.chart.type) {
      html += `<div class="chart-container"><canvas id="chart-primary"></canvas></div>`;
    }
    if (col.chart2 && col.chart2.type) {
      html += `<div class="chart-container"><canvas id="chart-secondary"></canvas></div>`;
    }

    // Outliers
    const ol = col.outliers;
    if (ol && ol.total > 0) {
      html += `<p class="info-row"><strong>Outliers detected: ${ol.total}</strong></p>`;
      html += `<table class="outlier-table"><thead><tr><th>Row #</th><th>Value</th></tr></thead><tbody>`;
      ol.rows.forEach(o => { html += `<tr><td>${o.row}</td><td>${o.value}</td></tr>`; });
      html += `</tbody></table>`;
      if (ol.total > 5) {
        html += `<div class="outlier-note">Showing 5 of ${ol.total} outliers. Decision thresholds — Lower: <strong>${ol.lower_threshold}</strong> | Upper: <strong>${ol.upper_threshold}</strong> (IQR method: Q1 − 1.5×IQR, Q3 + 1.5×IQR)</div>`;
      }
    } else if (col.category === 'Numerical' || col.category === 'Both Numerical and Categorical') {
      html += `<p class="info-row" style="color:var(--muted);">No outliers detected.</p>`;
    }

    html += `</div></div>`;
    detailEl.innerHTML = html;

    // Render charts after DOM update
    requestAnimationFrame(() => {
      if (col.chart && col.chart.type) renderChart('chart-primary', col.chart);
      if (col.chart2 && col.chart2.type) renderChart('chart-secondary', col.chart2);
    });
  }

  /* ── Chart.js rendering ────────────────────────────────── */
  function renderChart(canvasId, chartData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const numBars = chartData.labels.length;

    if (chartData.type === 'histogram') {
      const chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: chartData.labels,
          datasets: [{
            data: chartData.values,
            backgroundColor: COLORS[0] + 'cc',
            borderColor: COLORS[0],
            borderWidth: 1,
            borderRadius: 3,
          }]
        },
        options: chartOptions(chartData, numBars, false),
      });
      chartInstances.push(chart);
    }
    else if (chartData.type === 'bar') {
      const bgColors = chartData.labels.map((_, i) => COLORS[i % COLORS.length] + 'cc');
      const bdColors = chartData.labels.map((_, i) => COLORS[i % COLORS.length]);

      const chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: chartData.labels.map(l => l.length > 18 ? l.slice(0, 16) + '…' : l),
          datasets: [{
            data: chartData.values,
            backgroundColor: bgColors,
            borderColor: bdColors,
            borderWidth: 1,
            borderRadius: 4,
          }]
        },
        options: chartOptions(chartData, numBars, true),
      });
      chartInstances.push(chart);
    }
  }

  function chartOptions(chartData, numBars, showFullLabel) {
    return {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: chartData.title,
          font: { size: 14, weight: '700', family: 'Outfit' },
          color: '#1a1d2e',
          padding: { bottom: 12 },
        },
        tooltip: {
          backgroundColor: '#1a1d2e',
          titleFont: { size: 11, family: 'JetBrains Mono' },
          bodyFont: { size: 12, family: 'Outfit' },
          cornerRadius: 6,
          padding: 10,
          callbacks: {
            label: function(ctx) {
              return `Count: ${ctx.parsed.y.toLocaleString()}`;
            }
          }
        },
        // No datalabels plugin — hover only
      },
      scales: {
        x: {
          title: {
            display: true,
            text: chartData.x_label,
            font: { size: 11, weight: '600', family: 'Outfit' },
            color: '#6c7389',
          },
          ticks: {
            font: { size: numBars > 20 ? 7 : 9, family: 'JetBrains Mono' },
            color: '#6c7389',
            maxRotation: numBars > 12 ? 45 : 0,
            autoSkip: true,
            maxTicksLimit: 25,
          },
          grid: { display: false },
        },
        y: {
          title: {
            display: true,
            text: chartData.y_label,
            font: { size: 11, weight: '600', family: 'Outfit' },
            color: '#6c7389',
          },
          ticks: {
            font: { size: 9, family: 'JetBrains Mono' },
            color: '#6c7389',
            precision: 0,
          },
          grid: { color: '#f3f4f6', drawBorder: false },
          beginAtZero: true,
        }
      },
      animation: { duration: 600, easing: 'easeOutQuart' },
    };
  }

  /* ── Util ──────────────────────────────────────────────── */
  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
