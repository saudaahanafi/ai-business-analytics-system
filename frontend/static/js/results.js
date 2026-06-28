// Chart instances
let revenueTrendChart = null;
let productPerformanceChart = null;

// Store report data globally for download functions
let _reportData = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Set report timestamp
    const ts = document.getElementById('reportTimestamp');
    if (ts) {
        ts.textContent = 'Generated: ' + new Date().toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }
    extractAndFetchUploadId();
});

// Extract upload_id from URL and fetch data
function extractAndFetchUploadId() {
    const params = new URLSearchParams(window.location.search);
    const uploadId = params.get('upload_id');

    if (!uploadId || isNaN(uploadId)) {
        console.error('Missing or invalid upload_id');
        window.location.href = 'dashboard.html';
        return;
    }

    fetchAnalyticsData(uploadId);
}

// Fetch analytics data from backend
function fetchAnalyticsData(uploadId) {
    // FIXED PATH: Applied root-relative endpoint targeting results report processing data streams
    fetch('/ai-business-analytics-system/backend/api/results.php?upload_id=' + uploadId)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok: ' + response.status);
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            populateResultsPage(data);
        })
        .catch(error => {
            console.error('Error fetching data:', error);
            showErrorMessage('Failed to load analytics report. Please return to the dashboard.');
        });
}

// Populate all results data on the page
function populateResultsPage(data) {
    try {
        _reportData = data; // store for downloads

        const activeCurrency = data.currency || "USD";

        document.getElementById('totalRevenue').textContent = formatCurrency(data.total_revenue, activeCurrency);
        document.getElementById('netProfit').textContent = formatCurrency(data.net_profit, activeCurrency);
        document.getElementById('profitMargin').textContent = parseFloat(data.profit_margin).toFixed(1) + '%';
        document.getElementById('topProduct').textContent = data.top_product || 'N/A';

        // Populate industry badge
        document.getElementById('industryBadge').textContent = data.industry || 'General';

        // Model diagnostics — main bar
        const r2Val   = (parseFloat(data.model_r2) * 100).toFixed(2) + '%';
        const accVal  = (parseFloat(data.classifier_accuracy) * 100).toFixed(2) + '%';
        const modelName = data.selected_model || 'Advanced Analytics Model';

        document.getElementById('modelR2').textContent           = r2Val;
        document.getElementById('classifierAccuracy').textContent = accVal;
        document.getElementById('selectedModel').textContent      = modelName;

        // Executive summary duplicates
        document.getElementById('execR2').textContent       = r2Val;
        document.getElementById('execAccuracy').textContent  = accVal;
        document.getElementById('execModel').textContent     = modelName;

        // Parse and render charts
        const revenueTrendLabels = JSON.parse(data.revenue_trend_labels || '[]');
        const revenueTrendData   = JSON.parse(data.revenue_trend_data   || '[]');
        const productLabels      = JSON.parse(data.product_labels       || '[]');
        const productData        = JSON.parse(data.product_data         || '[]');

        renderRevenueChart(revenueTrendLabels, revenueTrendData, activeCurrency);
        renderProductChart(productLabels, productData, activeCurrency);

        // Parse and display insights
        const alerts          = JSON.parse(data.alerts          || '[]');
        const recommendations = JSON.parse(data.recommendations || '[]');

        displayRisks(alerts);
        displayRecommendations(recommendations);
        
        // Build and display executive summary narrative
        buildExecutiveSummaryNarrative(data, activeCurrency);

    } catch (error) {
        console.error('Error populating results:', error);
        showErrorMessage('Error displaying results. Please try again.');
    }
}

// Build detailed executive summary narrative
function buildExecutiveSummaryNarrative(data, currency) {
    const margin = parseFloat((data.profit_margin || '0').replace('%', ''));
    const r2 = parseFloat(data.model_r2 || 0);
    const acc = parseFloat(data.classifier_accuracy || 0);
    const healthScore = Math.min(100, Math.round((r2 * 40 + acc * 40 + Math.min(margin / 30, 1) * 20) * 100));
    
    const narrativeDiv = document.querySelector('.exec-summary');
    if (!narrativeDiv) return; // No summary container in results page
    
    const summaryBody = document.createElement('div');
    summaryBody.className = 'exec-narrative';
    summaryBody.style.cssText = `
        margin-top: 16px; padding: 20px; background: rgba(14,165,233,0.04);
        border-radius: 8px; line-height: 1.6; color: #334155; font-size: 14px;
    `;
    
    const narrativePoints = [
        `<strong>Business Health Assessment:</strong> Your organization achieved a health score of <strong>${healthScore}/100</strong>, ` +
            (healthScore >= 80 ? 'indicating strong overall performance with solid financial and operational metrics.' :
             healthScore >= 60 ? 'showing moderate performance. Strategic adjustments could improve profitability and operational efficiency.' :
             'indicating challenges that require strategic intervention. Review pricing, costs, and demand patterns.'),
        
        `<strong>Financial Overview:</strong> Total revenue of <strong>${formatCurrency(data.total_revenue, currency)}</strong> with net profit of <strong>${formatCurrency(data.net_profit, currency)}</strong> yields a profit margin of <strong>${data.profit_margin}</strong>. ${
            margin < 10 ? 'Margins are compressed; consider cost optimization or premium positioning.' :
            margin < 20 ? 'Margins are moderate; focus on high-margin products and operational efficiency.' :
            'Margins are healthy; prioritize scaling revenue while maintaining cost discipline.'
        }`,
        
        `<strong>Product Focus:</strong> <strong>${data.top_product || 'N/A'}</strong> is your top revenue driver. Allocate resources to expand this product's market reach, optimize inventory, and enhance its competitive position.`,
        
        `<strong>AI Model Reliability:</strong> Our predictive engine achieved <strong>${(acc * 100).toFixed(1)}% classifier accuracy</strong> and R² score of <strong>${(r2 * 100).toFixed(1)}%</strong>, indicating ${r2 > 0.85 ? 'high' : r2 > 0.7 ? 'good' : 'moderate'} predictive power for forecasting and decision support.`
    ];
    
    summaryBody.innerHTML = narrativePoints.map(p => `<p style="margin: 12px 0;">${p}</p>`).join('');
    
    // Insert narrative after header stats if they exist
    const execStatsRow = narrativeDiv.querySelector('.exec-stats-row');
    if (execStatsRow && execStatsRow.nextSibling) {
        execStatsRow.parentNode.insertBefore(summaryBody, execStatsRow.nextSibling);
    } else if (narrativeDiv.querySelector('.exec-summary-header')) {
        narrativeDiv.appendChild(summaryBody);
    }
}

// Render revenue trend chart
function renderRevenueChart(labels, data, currencyCode) {
    const ctx = document.getElementById('revenueTrendChart').getContext('2d');

    if (revenueTrendChart) { revenueTrendChart.destroy(); }

    revenueTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `Monthly Revenue (${currencyCode.toUpperCase()})`,
                data: data,
                borderColor: '#0ea5e9',
                backgroundColor: 'rgba(14,165,233,0.08)',
                borderWidth: 2.5,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#0ea5e9',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 7,
                pointHoverBackgroundColor: '#0284c7'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#334155',
                        font: { weight: '600', size: 12 },
                        padding: 12
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15,23,42,0.85)',
                    padding: 12,
                    borderRadius: 8,
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 12 },
                    callbacks: {
                        label: function(context) {
                            return 'Revenue: ' + formatCurrency(context.parsed.y, currencyCode);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.04)' },
                    ticks: {
                        color: '#94a3b8',
                        font: { size: 11 },
                        callback: function(value) { return formatCurrency(value, currencyCode); }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 11 } }
                }
            }
        }
    });
}

// Render product performance chart
function renderProductChart(labels, data, currencyCode) {
    const ctx = document.getElementById('productPerformanceChart').getContext('2d');

    if (productPerformanceChart) { productPerformanceChart.destroy(); }

    productPerformanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sales Volume',
                data: data,
                backgroundColor: 'rgba(14,165,233,0.75)',
                borderColor: '#0284c7',
                borderWidth: 1,
                borderRadius: 6,
                borderSkipped: false,
                hoverBackgroundColor: '#0284c7'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#334155',
                        font: { weight: '600', size: 12 },
                        padding: 12
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15,23,42,0.85)',
                    padding: 12,
                    borderRadius: 8,
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 12 },
                    callbacks: {
                        label: function(context) {
                            return 'Volume: ' + context.parsed.y.toLocaleString() + ' units';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.04)' },
                    ticks: { color: '#94a3b8', font: { size: 11 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 11 } }
                }
            }
        }
    });
}

// Display operational risks/alerts
function displayRisks(alerts) {
    const risksList = document.getElementById('risksList');
    const risksCount = document.getElementById('risksCount');
    risksList.innerHTML = '';

    if (Array.isArray(alerts) && alerts.length > 0) {
        if (risksCount) risksCount.textContent = alerts.length;
        alerts.forEach(alert => {
            const li = document.createElement('li');
            li.textContent = alert;
            risksList.appendChild(li);
        });
    } else {
        if (risksCount) risksCount.textContent = '0';
        const li = document.createElement('li');
        li.textContent = 'No critical operational risks identified. All systems operating normally.';
        li.style.background = '#f0fdf4';
        li.style.borderColor = '#10b981';
        risksList.appendChild(li);
    }
}

// Display AI recommendations
function displayRecommendations(recommendations) {
    const recList  = document.getElementById('recommendationsList');
    const recsCount = document.getElementById('recsCount');
    recList.innerHTML = '';

    if (Array.isArray(recommendations) && recommendations.length > 0) {
        if (recsCount) recsCount.textContent = recommendations.length;
        recommendations.forEach(rec => {
            const li = document.createElement('li');
            li.textContent = rec;
            recList.appendChild(li);
        });
    } else {
        if (recsCount) recsCount.textContent = '0';
        const li = document.createElement('li');
        li.textContent = 'Recommendations will be generated after further analysis.';
        recList.appendChild(li);
    }
}

function formatCurrency(value, currencyCode = 'USD') {
    if (!value) value = 0;
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode.toUpperCase().trim(),
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(parseFloat(value));
    } catch (e) {
        return currencyCode + ' ' + parseFloat(value).toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    }
}

// Show error message
function showErrorMessage(message) {
    const wrapper = document.querySelector('.results-wrapper');
    if (wrapper) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            background:#fff5f5;color:#ef4444;border:1px solid #fecaca;
            border-left:4px solid #ef4444;border-radius:12px;
            padding:18px 20px;font-size:14px;font-weight:500;
        `;
        errorDiv.textContent = '⚠ ' + message;
        wrapper.insertBefore(errorDiv, wrapper.firstChild);
    }
}

/* ═══════════════════════════════════════════════
   DOWNLOAD MODAL
════════════════════════════════════════════════ */
function openDownloadModal() {
    document.getElementById('downloadModal').classList.add('open');
}

function closeDownloadModal() {
    document.getElementById('downloadModal').classList.remove('open');
}

function closeDownloadModalOutside(e) {
    if (e.target === document.getElementById('downloadModal')) {
        closeDownloadModal();
    }
}

/* ── CSV Export ──────────────────────────────────────────────── */
function downloadCSV() {
    if (!_reportData) { alert('No report data available yet.'); return; }

    const d = _reportData;
    const currency = d.currency || 'USD';

    const rows = [
        ['Analytics Report Export', new Date().toLocaleString()],
        [],
        ['FINANCIAL SUMMARY'],
        ['Metric', 'Value'],
        ['Total Revenue',    formatCurrency(d.total_revenue, currency)],
        ['Net Profit',       formatCurrency(d.net_profit,    currency)],
        ['Profit Margin',    parseFloat(d.profit_margin).toFixed(1) + '%'],
        ['Top Product',      d.top_product || 'N/A'],
        ['Industry',         d.industry    || 'General'],
        [],
        ['MODEL DIAGNOSTICS'],
        ['Model Engine',         d.selected_model         || 'N/A'],
        ['R² Score',             (parseFloat(d.model_r2)             * 100).toFixed(2) + '%'],
        ['Classifier Accuracy',  (parseFloat(d.classifier_accuracy)  * 100).toFixed(2) + '%'],
        [],
        ['REVENUE TREND'],
        ['Period', 'Revenue'],
        ...buildTrendRows(d),
        [],
        ['PRODUCT PERFORMANCE'],
        ['Product', 'Sales Volume'],
        ...buildProductRows(d),
        [],
        ['RISKS & WARNINGS'],
        ...buildListRows(d.alerts),
        [],
        ['RECOMMENDATIONS'],
        ...buildListRows(d.recommendations),
    ];

    const csv = rows.map(r => r.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, 'analytics-report.csv');
    closeDownloadModal();
}

function buildTrendRows(d) {
    try {
        const labels = JSON.parse(d.revenue_trend_labels || '[]');
        const vals   = JSON.parse(d.revenue_trend_data   || '[]');
        return labels.map((l, i) => [l, vals[i] || 0]);
    } catch { return [['N/A', 'N/A']]; }
}

function buildProductRows(d) {
    try {
        const labels = JSON.parse(d.product_labels || '[]');
        const vals   = JSON.parse(d.product_data   || '[]');
        return labels.map((l, i) => [l, vals[i] || 0]);
    } catch { return [['N/A', 'N/A']]; }
}

function buildListRows(jsonStr) {
    try {
        const items = Array.isArray(jsonStr) ? jsonStr : JSON.parse(jsonStr || '[]');
        return items.length > 0 ? items.map(item => [item]) : [['None identified']];
    } catch { return [['N/A']]; }
}

/* ── HTML Report Export ──────────────────────────────────────── */
function downloadHTML() {
    if (!_reportData) { alert('No report data available yet.'); return; }

    const d = _reportData;
    const currency  = d.currency || 'USD';
    const industry  = d.industry || 'General';
    const generated = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });

    let alerts = [];
    let recs   = [];
    try { alerts = Array.isArray(d.alerts)          ? d.alerts          : JSON.parse(d.alerts          || '[]'); } catch {}
    try { recs   = Array.isArray(d.recommendations) ? d.recommendations : JSON.parse(d.recommendations || '[]'); } catch {}

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Analytics Report — ${industry}</title>
<style>
  body{font-family:system-ui,sans-serif;margin:0;padding:40px;background:#f8fafc;color:#1e293b;}
  h1{font-size:2rem;font-weight:800;color:#0c4a6e;margin-bottom:4px;}
  .meta{font-size:0.85rem;color:#64748b;margin-bottom:32px;}
  .badge{display:inline-block;background:#e0f2fe;color:#0284c7;border-radius:999px;padding:4px 14px;font-size:0.78rem;font-weight:700;margin-bottom:24px;}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px;}
  .kpi{background:#fff;border:1px solid #e2e8f0;border-top:3px solid #0ea5e9;border-radius:12px;padding:20px;}
  .kpi-l{font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:6px;}
  .kpi-v{font-size:1.6rem;font-weight:800;color:#0f172a;}
  .section{margin-bottom:32px;}
  .section h2{font-size:1rem;font-weight:700;color:#0369a1;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #e2e8f0;}
  table{width:100%;border-collapse:collapse;font-size:0.875rem;}
  th{text-align:left;padding:10px 12px;background:#f1f5f9;color:#475569;font-weight:700;font-size:0.75rem;text-transform:uppercase;}
  td{padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#334155;}
  ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px;}
  .risk-li{background:#fff5f5;border-left:3px solid #ef4444;padding:10px 14px;border-radius:6px;font-size:0.875rem;color:#475569;}
  .rec-li{background:#f0fdf4;border-left:3px solid #10b981;padding:10px 14px;border-radius:6px;font-size:0.875rem;color:#475569;}
  .diag{display:flex;gap:32px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;margin-bottom:16px;}
  .diag-item span:first-child{font-size:0.72rem;font-weight:700;text-transform:uppercase;color:#94a3b8;display:block;margin-bottom:4px;}
  .diag-item span:last-child{font-size:1.1rem;font-weight:800;color:#0369a1;}
  .footer{margin-top:48px;font-size:0.75rem;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:16px;}
  @media print{body{background:#fff;}@page{margin:2cm;}}
</style>
</head>
<body>
<h1>Analytics Report</h1>
<div class="meta">Generated: ${generated}</div>
<div class="badge">Industry: ${industry}</div>

<div class="kpis">
  <div class="kpi"><div class="kpi-l">Total Revenue</div><div class="kpi-v">${formatCurrency(d.total_revenue, currency)}</div></div>
  <div class="kpi"><div class="kpi-l">Net Profit</div><div class="kpi-v">${formatCurrency(d.net_profit, currency)}</div></div>
  <div class="kpi"><div class="kpi-l">Profit Margin</div><div class="kpi-v">${parseFloat(d.profit_margin).toFixed(1)}%</div></div>
  <div class="kpi"><div class="kpi-l">Top Product</div><div class="kpi-v" style="font-size:1.1rem">${d.top_product || 'N/A'}</div></div>
</div>

<div class="diag">
  <div class="diag-item"><span>Model Engine</span><span>${d.selected_model || 'N/A'}</span></div>
  <div class="diag-item"><span>R² Score</span><span>${(parseFloat(d.model_r2) * 100).toFixed(2)}%</span></div>
  <div class="diag-item"><span>Classifier Accuracy</span><span>${(parseFloat(d.classifier_accuracy) * 100).toFixed(2)}%</span></div>
</div>

<div class="section">
  <h2>Revenue Trend</h2>
  <table><tr><th>Period</th><th>Revenue</th></tr>
  ${buildTrendRows(d).map(r => `<tr><td>${r[0]}</td><td>${formatCurrency(r[1], currency)}</td></tr>`).join('')}
  </table>
</div>

<div class="section">
  <h2>Product Performance</h2>
  <table><tr><th>Product</th><th>Sales Volume (units)</th></tr>
  ${buildProductRows(d).map(r => `<tr><td>${r[0]}</td><td>${Number(r[1]).toLocaleString()}</td></tr>`).join('')}
  </table>
</div>

<div class="section">
  <h2>Operational Risks & Warnings</h2>
  <ul>${alerts.length > 0 ? alerts.map(a => `<li class="risk-li">⚠ ${a}</li>`).join('') : '<li class="rec-li">No critical risks identified.</li>'}</ul>
</div>

<div class="section">
  <h2>Strategic Recommendations</h2>
  <ul>${recs.length > 0 ? recs.map(r => `<li class="rec-li">✓ ${r}</li>`).join('') : '<li class="rec-li">No recommendations generated.</li>'}</ul>
</div>

<div class="footer">AnalyticsGateway — AI-Powered Business Intelligence · Report exported ${generated}</div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    triggerDownload(blob, 'analytics-report.html');
    closeDownloadModal();
}

/* ── Utility ─────────────────────────────────────────────────── */
function triggerDownload(blob, filename) {
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}    
      