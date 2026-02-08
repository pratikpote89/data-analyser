(() => {
  const btnUpload  = document.getElementById('btn-upload');
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

  let analysisData = null;   // store full result for click handling
  let activeCol    = null;   // currently selected column name

  /* ── Helpers ───────────────────────────────────────────── */
  let fadeTimer = null;
  function showStatus(msg, type = 'info') {
    if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
    statusEl.textContent = msg;
    statusEl.className = `status ${type}`;
    statusEl.classList.remove('hidden');

    // Success messages auto-vanish after 3.5s; errors stay
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

  /* ── Upload ────────────────────────────────────────────── */
  btnUpload.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    hideStatus();
    resultsEl.classList.add('hidden');
    contentEl.innerHTML = '';
    detailEl.innerHTML = '';
    btnAnalyse.disabled = true;
    analysisData = null;
    activeCol = null;

    const formData = new FormData();
    formData.append('file', file);

    try {
      showStatus('Uploading…', 'info');
      const res = await fetch('/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.ok) {
        showStatus(`File "${data.filename}" uploaded successfully.`, 'success');
        fileName.textContent = data.filename;
        fileBadge.classList.remove('hidden');
        btnAnalyse.disabled = false;
      } else {
        showStatus(data.error || 'Upload failed.', 'error');
      }
    } catch (err) {
      showStatus('Network error during upload.', 'error');
    }
  });

  /* ── Clear file ────────────────────────────────────────── */
  btnClear.addEventListener('click', () => {
    fileInput.value = '';
    fileBadge.classList.add('hidden');
    btnAnalyse.disabled = true;
    hideStatus();
    resultsEl.classList.add('hidden');
    contentEl.innerHTML = '';
    detailEl.innerHTML = '';
    analysisData = null;
    activeCol = null;
  });

  /* ── Analyse ───────────────────────────────────────────── */
  btnAnalyse.addEventListener('click', async () => {
    hideStatus();
    resultsEl.classList.add('hidden');
    contentEl.innerHTML = '';
    detailEl.innerHTML = '';
    analysisData = null;
    activeCol = null;
    showLoader();

    try {
      const res = await fetch('/analyse');
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
      renderSummary(r);

    } catch (err) {
      hideLoader();
      showStatus('Network error during analysis.', 'error');
    }
  });

  /* ── Render summary + clickable column tags ────────────── */
  function renderSummary(r) {
    let html = '';

    // Summary cards
    html += `<div class="summary-grid">
      <div class="summary-card"><div class="label">Total Rows</div><div class="value">${r.rows.toLocaleString()}</div></div>
      <div class="summary-card"><div class="label">Total Columns</div><div class="value">${r.columns}</div></div>
    </div>`;

    // Data preview table
    if (r.preview && r.preview.length > 0) {
      html += `<div class="preview-section">`;
      html += `<h3 class="section-title">Data Preview <span class="section-hint">first ${r.preview.length} rows</span></h3>`;
      html += `<div class="preview-scroll"><table class="preview-table"><thead><tr>`;
      r.preview_columns.forEach(col => {
        html += `<th>${escHtml(String(col))}</th>`;
      });
      html += `</tr></thead><tbody>`;
      r.preview.forEach(row => {
        html += `<tr>`;
        r.preview_columns.forEach(col => {
          const val = row[col] !== undefined && row[col] !== null ? String(row[col]) : '';
          html += `<td>${escHtml(val)}</td>`;
        });
        html += `</tr>`;
      });
      html += `</tbody></table></div></div>`;
    }

    // Column names as clickable tags with dtype badges
    html += `<div class="col-list"><h3 class="section-title">Columns <span class="section-hint">click a column to view its analysis</span></h3><div class="col-tags">`;
    r.column_names.forEach(name => {
      const colData = r.column_analysis.find(c => c.name === name);
      const dtype = colData ? colData.dtype : '';
      const unique = colData ? colData.unique : '';
      html += `<span class="col-tag" data-col="${escHtml(name)}">
        <span class="col-tag-name">${escHtml(name)}</span>
        <span class="col-tag-meta">${escHtml(dtype)} · ${unique} unique</span>
      </span>`;
    });
    html += `</div></div>`;

    contentEl.innerHTML = html;
    resultsEl.classList.remove('hidden');

    // Attach click listeners to column tags
    contentEl.querySelectorAll('.col-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        const colName = tag.getAttribute('data-col');
        selectColumn(colName);
      });
    });
  }

  /* ── Select a column and show its detail ───────────────── */
  function selectColumn(colName) {
    // Toggle: clicking the same column again closes the panel
    if (activeCol === colName) {
      activeCol = null;
      detailEl.innerHTML = '';
      contentEl.querySelectorAll('.col-tag').forEach(t => t.classList.remove('active'));
      return;
    }

    activeCol = colName;

    // Highlight active tag
    contentEl.querySelectorAll('.col-tag').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-col') === colName);
    });

    // Find analysis for this column
    const col = analysisData.column_analysis.find(c => c.name === colName);
    if (!col) {
      detailEl.innerHTML = '';
      return;
    }

    renderColumnDetail(col);
  }

  /* ── Render per-column detail panel ────────────────────── */
  function renderColumnDetail(col) {
    const badgeClass = col.category === 'Numerical' ? 'num'
                     : col.category === 'Categorical' ? 'cat' : 'both';

    let html = `<div class="col-detail-panel">`;
    html += `<div class="col-section">`;
    html += `<div class="col-header">
      <h3>${escHtml(col.name)}</h3>
      <span class="badge ${badgeClass}">${escHtml(col.category)}</span>
      <span class="badge dtype">${escHtml(col.dtype)}</span>
    </div>`;

    // Quick info row: unique count
    html += `<div class="quick-info">`;
    html += `<span class="quick-chip">Unique values: <strong>${col.unique}</strong></span>`;
    html += `<span class="quick-chip">Missing: <strong>${col.missing}</strong></span>`;
    html += `</div>`;

    // Basic stats for numerical columns
    if (col.stats && Object.keys(col.stats).length > 0) {
      html += `<div class="stats-grid">`;
      const labels = { min: 'Min', max: 'Max', mean: 'Mean', median: 'Median', std: 'Std Dev' };
      for (const [key, label] of Object.entries(labels)) {
        if (col.stats[key] !== undefined) {
          html += `<div class="stat-card">
            <div class="stat-label">${label}</div>
            <div class="stat-value">${col.stats[key].toLocaleString()}</div>
          </div>`;
        }
      }
      html += `</div>`;
    }

    // Charts
    if (col.chart) {
      html += `<img class="chart-img" src="data:image/png;base64,${col.chart}" alt="Chart for ${escHtml(col.name)}" />`;
    }
    if (col.chart2) {
      html += `<img class="chart-img" src="data:image/png;base64,${col.chart2}" alt="Bar chart for ${escHtml(col.name)}" />`;
    }

    // Outliers
    if (col.outliers && col.outliers.length > 0) {
      html += `<p class="info-row"><strong>Outliers detected: ${col.outliers.length}</strong></p>`;
      html += `<table class="outlier-table"><thead><tr><th>Row #</th><th>Value</th></tr></thead><tbody>`;
      col.outliers.forEach(o => {
        html += `<tr><td>${o.row}</td><td>${o.value}</td></tr>`;
      });
      html += `</tbody></table>`;
    } else if (col.category === 'Numerical' || col.category === 'Both Numerical and Categorical') {
      html += `<p class="info-row" style="color:var(--muted);">No outliers detected.</p>`;
    }

    html += `</div></div>`;
    detailEl.innerHTML = html;
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
