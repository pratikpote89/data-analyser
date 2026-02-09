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
  let chartInstances = [];

  const COLORS = [
    '#3b82f6', '#8b5cf6', '#14b8a6', '#f43f5e', '#f59e0b',
    '#0ea5e9', '#ec4899', '#10b981', '#6366f1', '#f97316',
  ];

  const CATEGORY_ORDER = ['Numerical', 'String', 'Date', 'Skipped', 'Error'];
  const CATEGORY_ICONS = {
    Numerical: '🔢', String: '🔤', Date: '📅', Skipped: '⏭️', Error: '⚠️'
  };
  const CATEGORY_LABELS = {
    Numerical: 'Numerical', String: 'String / Categorical',
    Date: 'Date / Timestamp', Skipped: 'Skipped (Identifiers)', Error: 'Errors'
  };

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
  function destroyCharts() { chartInstances.forEach(c => c.destroy()); chartInstances = []; }

  /* ── Analyse button ────────────────────────────────────── */
  btnAnalyse.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    hideStatus(); resultsEl.classList.add('hidden');
    contentEl.innerHTML = ''; detailEl.innerHTML = '';
    destroyCharts(); analysisData = null; activeCol = null;
    fileName.textContent = file.name;
    fileBadge.classList.remove('hidden');
    const formData = new FormData();
    formData.append('file', file);
    try {
      showLoader();
      const res = await fetch('/analyse', { method: 'POST', body: formData });

      let data;
      try { data = await res.json(); }
      catch (parseErr) {
        hideLoader();
        showStatus('Server returned an invalid response. Check the log file.', 'error');
        return;
      }

      hideLoader();
      if (!data.ok) { showStatus(data.error || 'Analysis failed.', 'error'); return; }
      const r = data.result;
      if (!r.valid) { showStatus(r.message, 'error'); return; }
      showStatus(r.message, 'success');
      analysisData = r;
      bgVisuals.classList.add('fade-out');
      renderSummary(r);
    } catch (err) {
      hideLoader();
      showStatus('Network error. Please check your connection and try again.', 'error');
    }
  });

  /* ── Clear ─────────────────────────────────────────────── */
  btnClear.addEventListener('click', () => {
    fileInput.value = ''; fileBadge.classList.add('hidden');
    hideStatus(); resultsEl.classList.add('hidden');
    contentEl.innerHTML = ''; detailEl.innerHTML = '';
    destroyCharts(); analysisData = null; activeCol = null;
    bgVisuals.classList.remove('fade-out');
  });

  /* ══════════════════════════════════════════════════════════
     RENDER SUMMARY
     ══════════════════════════════════════════════════════════ */
  function renderSummary(r) {
    let html = '';

    // Summary cards
    const dq = r.data_quality;
    const qualColor = dq.overall >= 90 ? 'var(--teal)' : dq.overall >= 70 ? 'var(--amber)' : 'var(--rose)';
    html += `<div class="summary-grid">
      <div class="summary-card"><div class="label">Total Rows</div><div class="value">${r.rows.toLocaleString()}</div></div>
      <div class="summary-card"><div class="label">Total Columns</div><div class="value">${r.columns}</div></div>
      <div class="summary-card"><div class="label">Data Quality</div><div class="value" style="color:${qualColor}">${dq.overall}%</div></div>
      <div class="summary-card"><div class="label">Missing Cells</div><div class="value" style="font-size:1.2rem">${dq.total_missing.toLocaleString()} <span style="font-size:.7rem;color:var(--muted)">/ ${dq.total_cells.toLocaleString()}</span></div></div>
    </div>`;

    // Sheet info for Excel
    if (r.sheet_names && r.sheet_names.length > 1) {
      html += `<div class="sheet-info">📊 Excel file has ${r.sheet_names.length} sheets: <strong>${r.sheet_names.join(', ')}</strong>. Analysing first sheet.</div>`;
    }

    // Log messages / warnings
    if (r.log_messages && r.log_messages.length > 0) {
      html += `<div class="log-messages">`;
      html += `<h3 class="section-title">⚠️ Notices</h3>`;
      r.log_messages.forEach(msg => {
        html += `<div class="log-msg">${esc(msg)}</div>`;
      });
      html += `</div>`;
    }

    // Data preview
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

    // ── Column tags grouped by category ──────────────────────
    html += `<div class="col-list">`;
    html += `<h3 class="section-title">Columns <span class="section-hint">grouped by type — click to view analysis</span></h3>`;

    // Group columns
    const groups = {};
    r.column_analysis.forEach(cd => {
      const cat = cd.category || 'Error';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(cd);
    });

    CATEGORY_ORDER.forEach(cat => {
      const cols = groups[cat];
      if (!cols || cols.length === 0) return;

      const icon = CATEGORY_ICONS[cat] || '';
      const label = CATEGORY_LABELS[cat] || cat;
      const isClickable = cat !== 'Error';

      html += `<div class="col-group">`;
      html += `<div class="col-group-header">${icon} ${label} <span class="col-group-count">${cols.length}</span></div>`;
      html += `<div class="col-tags-scroll"><div class="col-tags">`;

      cols.forEach(cd => {
        const qCol = cd.quality >= 99 ? 'var(--teal)' : cd.quality >= 90 ? 'var(--amber)' : 'var(--rose)';
        const cls = cat === 'Skipped' ? 'col-tag skipped' : cat === 'Error' ? 'col-tag errored' : 'col-tag';

        if (cat === 'Skipped') {
          html += `<span class="${cls}" title="${esc(cd.skip_reason || '')}">
            <span class="col-tag-name">${esc(cd.name)}</span>
            <span class="col-tag-meta">${esc(cd.dtype)} · ${cd.unique} uniq</span>
          </span>`;
        } else if (cat === 'Error') {
          html += `<span class="${cls}" title="${esc(cd.error || 'Unknown error')}">
            <span class="col-tag-name">${esc(cd.name)}</span>
            <span class="col-tag-meta">Error</span>
          </span>`;
        } else {
          html += `<span class="${cls}" data-col="${esc(cd.name)}">
            <span class="col-tag-name">${esc(cd.name)}</span>
            <span class="col-tag-meta">${esc(cd.dtype)} · ${cd.unique} uniq · <span style="color:${qCol}">${cd.quality}%</span></span>
          </span>`;
        }
      });
      html += `</div></div></div>`;
    });
    html += `</div>`;

    // Correlation heatmap
    if (r.correlation && r.correlation.columns && r.correlation.columns.length >= 2) {
      html += `<div class="heatmap-section">`;
      html += `<h3 class="section-title">Correlation Heatmap <span class="section-hint">numerical columns</span></h3>`;
      html += `<div class="heatmap-scroll"><canvas id="heatmap-canvas"></canvas></div>`;
      html += `</div>`;
    }

    contentEl.innerHTML = html;
    resultsEl.classList.remove('hidden');

    // Attach column click (only for clickable tags)
    contentEl.querySelectorAll('.col-tag[data-col]').forEach(tag => {
      tag.addEventListener('click', () => selectColumn(tag.getAttribute('data-col')));
    });

    // Draw heatmap
    if (r.correlation && r.correlation.columns && r.correlation.columns.length >= 2) {
      requestAnimationFrame(() => drawHeatmap(r.correlation));
    }
  }

  /* ══════════════════════════════════════════════════════════
     CORRELATION HEATMAP
     ══════════════════════════════════════════════════════════ */
  function drawHeatmap(corr) {
    const canvas = document.getElementById('heatmap-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cols = corr.columns;
    const matrix = corr.matrix;
    const n = cols.length;

    const dpr = window.devicePixelRatio || 1;
    const labelWidth = 110;
    const cellSize = Math.min(52, Math.max(30, Math.floor(500 / n)));
    const topPad = 90;
    const w = labelWidth + n * cellSize + 60;
    const h = topPad + n * cellSize + 10;

    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);

    // Column labels (top)
    ctx.save();
    ctx.font = '600 10px JetBrains Mono'; ctx.fillStyle = '#6c7389'; ctx.textAlign = 'left';
    for (let j = 0; j < n; j++) {
      ctx.save();
      ctx.translate(labelWidth + j * cellSize + cellSize / 2, topPad - 8);
      ctx.rotate(-Math.PI / 3);
      ctx.fillText(trunc(cols[j], 14), 0, 0);
      ctx.restore();
    }
    ctx.restore();

    // Row labels (left)
    ctx.font = '600 10px JetBrains Mono'; ctx.fillStyle = '#6c7389'; ctx.textAlign = 'right';
    for (let i = 0; i < n; i++) {
      ctx.fillText(trunc(cols[i], 14), labelWidth - 8, topPad + i * cellSize + cellSize / 2 + 4);
    }

    // Cells
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const val = matrix[i][j];
        const x = labelWidth + j * cellSize, y = topPad + i * cellSize;
        ctx.fillStyle = corrColor(val);
        ctx.beginPath(); roundRect(ctx, x+1, y+1, cellSize-2, cellSize-2, 3); ctx.fill();
        ctx.fillStyle = Math.abs(val) > 0.6 ? '#ffffff' : '#374151';
        ctx.font = `600 ${cellSize > 38 ? 10 : 8}px JetBrains Mono`;
        ctx.fillText(val.toFixed(2), x + cellSize / 2, y + cellSize / 2);
      }
    }

    // Legend
    const legX = labelWidth + n * cellSize + 15, legY = topPad, legH = n * cellSize;
    const grad = ctx.createLinearGradient(0, legY, 0, legY + legH);
    grad.addColorStop(0, '#1e40af'); grad.addColorStop(0.5, '#f8f9fc'); grad.addColorStop(1, '#be123c');
    ctx.fillStyle = grad; ctx.fillRect(legX, legY, 14, legH);
    ctx.strokeStyle = '#dce1eb'; ctx.strokeRect(legX, legY, 14, legH);
    ctx.font = '500 9px JetBrains Mono'; ctx.fillStyle = '#6c7389'; ctx.textAlign = 'left';
    ctx.fillText('+1', legX + 18, legY + 5);
    ctx.fillText(' 0', legX + 18, legY + legH / 2 + 3);
    ctx.fillText('−1', legX + 18, legY + legH);
  }

  function corrColor(val) {
    const t = (val + 1) / 2;
    if (t >= 0.5) {
      const s = (t - 0.5) * 2;
      return `rgb(${Math.round(248-s*218)},${Math.round(249-s*185)},${Math.round(252-s*77)})`;
    } else {
      const s = t * 2;
      return `rgb(${Math.round(190-s*(190-248))},${Math.round(18-s*(18-249))},${Math.round(60-s*(60-252))})`;
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
  }

  function trunc(s, max) { return s.length > max ? s.slice(0, max-1) + '…' : s; }

  /* ── Select column ─────────────────────────────────────── */
  function selectColumn(colName) {
    if (activeCol === colName) {
      activeCol = null; detailEl.innerHTML = ''; destroyCharts();
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

  /* ══════════════════════════════════════════════════════════
     COLUMN DETAIL PANEL
     ══════════════════════════════════════════════════════════ */
  function renderColumnDetail(col) {
    destroyCharts();

    const badgeMap = { Numerical: 'num', String: 'cat', Date: 'date' };
    const badgeClass = badgeMap[col.category] || 'cat';
    const qCol = col.quality >= 99 ? 'var(--teal)' : col.quality >= 90 ? 'var(--amber)' : 'var(--rose)';

    let html = `<div class="col-detail-panel"><div class="col-section">`;

    // Header
    html += `<div class="col-header">
      <h3>${esc(col.name)}</h3>
      <span class="badge ${badgeClass}">${esc(col.category)}</span>
      <span class="badge dtype">${esc(col.dtype)}</span>
      <span class="badge quality" style="background:${qCol}15;color:${qCol}">Quality: ${col.quality}%</span>
    </div>`;

    // Quick chips
    html += `<div class="quick-info">
      <span class="quick-chip">Unique values: <strong>${col.unique}</strong></span>
      <span class="quick-chip">Missing: <strong>${col.missing}</strong></span>
    </div>`;

    // Error message
    if (col.error) {
      html += `<div class="error-note">⚠️ Error analysing this column: ${esc(col.error)}</div>`;
      html += `</div></div>`;
      detailEl.innerHTML = html;
      return;
    }

    // ── DATE: only min and max ───────────────────────────────
    if (col.category === 'Date') {
      if (col.stats && col.stats.min) {
        html += `<div class="stats-grid" style="grid-template-columns:repeat(2,1fr)">
          <div class="stat-card"><div class="stat-label">Earliest</div><div class="stat-value">${esc(col.stats.min)}</div></div>
          <div class="stat-card"><div class="stat-label">Latest</div><div class="stat-value">${esc(col.stats.max)}</div></div>
        </div>`;
      }
      html += `</div></div>`;
      detailEl.innerHTML = html;
      return;
    }

    // ── NUMERICAL: stats + box plot + histogram + outliers ────
    if (col.category === 'Numerical') {
      // Stats
      if (col.stats && Object.keys(col.stats).length > 0) {
        html += `<div class="stats-grid">`;
        const labels = { min: 'Min', max: 'Max', mean: 'Mean', median: 'Median', std: 'Std Dev' };
        for (const [key, label] of Object.entries(labels)) {
          if (col.stats[key] !== undefined) {
            html += `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${Number(col.stats[key]).toLocaleString()}</div></div>`;
          }
        }
        html += `</div>`;
      }

      // Box plot
      if (col.boxplot && col.boxplot.q1 !== undefined) {
        html += `<div class="chart-container" style="max-height:180px;"><canvas id="boxplot-canvas"></canvas></div>`;
      }

      // Histogram
      if (col.chart && col.chart.type) {
        html += `<div class="chart-container"><canvas id="chart-primary"></canvas></div>`;
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
      } else {
        html += `<p class="info-row" style="color:var(--muted);">No outliers detected.</p>`;
      }
    }

    // ── STRING: bar chart ────────────────────────────────────
    if (col.category === 'String') {
      if (col.chart && col.chart.type) {
        html += `<div class="chart-container"><canvas id="chart-primary"></canvas></div>`;
      }
    }

    html += `</div></div>`;
    detailEl.innerHTML = html;

    // Render charts
    requestAnimationFrame(() => {
      if (col.boxplot && col.boxplot.q1 !== undefined) drawBoxPlot(col.boxplot, col.name);
      if (col.chart && col.chart.type) renderChart('chart-primary', col.chart);
    });
  }

  /* ══════════════════════════════════════════════════════════
     BOX PLOT
     ══════════════════════════════════════════════════════════ */
  function drawBoxPlot(bp, colName) {
    const canvas = document.getElementById('boxplot-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = 700, H = 130;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = '100%'; canvas.style.maxWidth = W + 'px'; canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

    const padL = 50, padR = 50, padT = 32, padB = 30;
    const plotW = W - padL - padR;
    const midY = padT + (H - padT - padB) / 2;
    const boxH = 36;

    const allVals = [bp.min, bp.max, ...bp.outliers];
    const dataMin = Math.min(...allVals), dataMax = Math.max(...allVals);
    const range = dataMax - dataMin || 1;
    const margin = range * 0.05;
    const lo = dataMin - margin, hi = dataMax + margin;
    const scale = (v) => padL + ((v - lo) / (hi - lo)) * plotW;

    ctx.font = '700 12px Outfit'; ctx.fillStyle = '#1a1d2e'; ctx.textAlign = 'left';
    ctx.fillText(`Box Plot of ${colName}`, padL, 18);

    // Whiskers
    ctx.strokeStyle = '#6c7389'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(scale(bp.min), midY); ctx.lineTo(scale(bp.max), midY); ctx.stroke();
    const capH = boxH * 0.6;
    [bp.min, bp.max].forEach(v => {
      ctx.beginPath(); ctx.moveTo(scale(v), midY - capH/2); ctx.lineTo(scale(v), midY + capH/2); ctx.stroke();
    });

    // Box
    const x1 = scale(bp.q1), x3 = scale(bp.q3);
    const grad = ctx.createLinearGradient(x1, 0, x3, 0);
    grad.addColorStop(0, '#3b82f6'); grad.addColorStop(1, '#8b5cf6');
    ctx.fillStyle = grad; ctx.globalAlpha = 0.2;
    ctx.beginPath(); roundRect(ctx, x1, midY-boxH/2, x3-x1, boxH, 4); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2;
    ctx.beginPath(); roundRect(ctx, x1, midY-boxH/2, x3-x1, boxH, 4); ctx.stroke();

    // Median
    ctx.strokeStyle = '#f43f5e'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(scale(bp.median), midY-boxH/2); ctx.lineTo(scale(bp.median), midY+boxH/2); ctx.stroke();

    // Outlier dots
    ctx.fillStyle = '#f43f5e';
    bp.outliers.forEach(v => { ctx.beginPath(); ctx.arc(scale(v), midY, 3.5, 0, Math.PI*2); ctx.fill(); });

    // Labels
    ctx.font = '500 9px JetBrains Mono'; ctx.fillStyle = '#6c7389'; ctx.textAlign = 'center';
    const labelY = midY + boxH/2 + 16;
    [[bp.min,`Min: ${bp.min}`],[bp.q1,`Q1: ${bp.q1}`],[bp.median,`Med: ${bp.median}`],[bp.q3,`Q3: ${bp.q3}`],[bp.max,`Max: ${bp.max}`]]
      .forEach(([v,lbl]) => ctx.fillText(lbl, scale(v), labelY));
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
        data: { labels: chartData.labels, datasets: [{ data: chartData.values, backgroundColor: COLORS[0]+'cc', borderColor: COLORS[0], borderWidth: 1, borderRadius: 3 }] },
        options: chartOpts(chartData, numBars),
      });
      chartInstances.push(chart);
    } else if (chartData.type === 'bar') {
      const bg = chartData.labels.map((_,i) => COLORS[i%COLORS.length]+'cc');
      const bd = chartData.labels.map((_,i) => COLORS[i%COLORS.length]);
      const chart = new Chart(ctx, {
        type: 'bar',
        data: { labels: chartData.labels.map(l => l.length>18 ? l.slice(0,16)+'…' : l), datasets: [{ data: chartData.values, backgroundColor: bg, borderColor: bd, borderWidth: 1, borderRadius: 4 }] },
        options: chartOpts(chartData, numBars),
      });
      chartInstances.push(chart);
    }
  }

  function chartOpts(cd, numBars) {
    return {
      responsive: true, maintainAspectRatio: true, aspectRatio: 2,
      plugins: {
        legend: { display: false },
        title: { display: true, text: cd.title, font: { size: 14, weight: '700', family: 'Outfit' }, color: '#1a1d2e', padding: { bottom: 12 } },
        tooltip: { backgroundColor: '#1a1d2e', titleFont: { size: 11, family: 'JetBrains Mono' }, bodyFont: { size: 12, family: 'Outfit' }, cornerRadius: 6, padding: 10,
          callbacks: { label: (c) => `Count: ${c.parsed.y.toLocaleString()}` } },
      },
      scales: {
        x: { title: { display: true, text: cd.x_label, font: { size: 11, weight: '600', family: 'Outfit' }, color: '#6c7389' },
             ticks: { font: { size: numBars>20?7:9, family: 'JetBrains Mono' }, color: '#6c7389', maxRotation: numBars>12?45:0, autoSkip: true, maxTicksLimit: 25 }, grid: { display: false } },
        y: { title: { display: true, text: cd.y_label, font: { size: 11, weight: '600', family: 'Outfit' }, color: '#6c7389' },
             ticks: { font: { size: 9, family: 'JetBrains Mono' }, color: '#6c7389', precision: 0 }, grid: { color: '#f3f4f6', drawBorder: false }, beginAtZero: true },
      },
      animation: { duration: 600, easing: 'easeOutQuart' },
    };
  }

  function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
})();
