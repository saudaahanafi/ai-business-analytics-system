/**
 * results.js
 * Reads upload_id from URL → fetches data from backend → populates results page.
 *
 * URL format: results.html?upload_id=123
 *
 * The page already shows placeholder "--" values and empty state messages.
 * When data arrives, this script replaces them with real values and draws charts.
 *
 * ─── FOR JAMAL ────────────────────────────────────────────────────────────────
 * Uncomment the fetch block below and point it at get_report.php.
 *
 * Expected JSON from get_report.php:
 * {
 *   "company_name": "Moroccan Secrets",
 *   "industry":     "Skincare",
 *   "created_at":   "2024-06-09",
 *   "kpis": {
 *     "revenue":     "₦1,250,000",
 *     "net_profit":  "₦400,000",
 *     "margin":      "32%",
 *     "roi":         "48%",
 *     "top_product": "Beldi Soap"
 *   },
 *   "revenue_trend": {
 *     "labels": ["January", "February", "March"],
 *     "data":   [1800000, 1300000, 2100000]
 *   },
 *   "products": {
 *     "labels": ["Beldi Soap", "Argan Oil", ...],
 *     "data":   [522500, 504000, ...]
 *   },
 *   "alerts": [
 *     { "message": "Argan Oil stock low", "level": "high" }
 *   ],
 *   "recommendations": ["Promote Beldi Soap", "Restock Argan Oil"],
 *   "model_performance": {
 *     "r2": 0.97, "mae": 1250.5, "accuracy": 0.93, "model": "Random Forest"
 *   }
 * }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const params   = new URLSearchParams(window.location.search);
const uploadId = params.get('upload_id');

let revenueChart = null;
let productChart  = null;

window.addEventListener('DOMContentLoaded', () => {

    // ── TODO (Jamal): uncomment when get_report.php is ready ──────────────────
    //
    // if (!uploadId) return; // no upload_id in URL, just show placeholders
    //
    // fetch(`../backend/api/get_report.php?upload_id=${encodeURIComponent(uploadId)}`)
    //     .then(res => {
    //         if (!res.ok) throw new Error('Server error');
    //         return res.json();
    //     })
    //     .then(data => populateResults(data))
    //     .catch(err => console.error('Could not load results:', err));
    //
    // ─────────────────────────────────────────────────────────────────────────
});

// ─── POPULATE ALL SECTIONS ────────────────────────────────────────────────────
// Jamal: call this with his JSON response — it fills everything in automatically
function populateResults(data) {

    // ── Header ────────────────────────────────────────────────────────────────
    setText('results-company-name', data.company_name);

    if (data.industry) {
        const badge = document.getElementById('results-industry');
        badge.textContent = data.industry;
        badge.hidden = false;
    }
    if (data.created_at) {
        setText('results-date', data.created_at);
    }

    // ── KPIs ──────────────────────────────────────────────────────────────────
    setText('kpi-revenue',     data.kpis.revenue);
    setText('kpi-margin',      data.kpis.margin);
    setText('kpi-roi',         data.kpis.roi);
    setText('kpi-top-product', data.kpis.top_product);

    if (data.kpis.net_profit) {
        setText('kpi-revenue-sub', `Net profit: ${data.kpis.net_profit}`);
    }

    // ── Charts ────────────────────────────────────────────────────────────────
    if (data.revenue_trend && data.revenue_trend.labels.length > 0) {
        renderRevenueChart(data.revenue_trend.labels, data.revenue_trend.data);
    }
    if (data.products && data.products.labels.length > 0) {
        renderProductChart(data.products.labels, data.products.data);
    }

    // ── Alerts ────────────────────────────────────────────────────────────────
    if (data.alerts && data.alerts.length > 0) {
        renderAlerts(data.alerts);
    }

    // ── Recommendations ───────────────────────────────────────────────────────
    if (data.recommendations && data.recommendations.length > 0) {
        renderRecs(data.recommendations);
    }

    // ── Model performance ─────────────────────────────────────────────────────
    if (data.model_performance) {
        const p = data.model_performance;
        setText('model-r2',   p.r2       ?? '--');
        setText('model-mae',  p.mae      ?? '--');
        setText('model-acc',  p.accuracy ? (p.accuracy * 100).toFixed(1) + '%' : '--');
        setText('model-name', p.model    ?? '--');

        // Show model badge in recs footer
        const badge = document.getElementById('model-badge');
        if (badge && p.model) {
            badge.textContent = p.model;
            badge.hidden = false;
        }

        // Show model performance section
        document.getElementById('modelSection').hidden = false;
    }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function setText(id, value) {
    const el = document.getElementById(id);
    if (el && value !== null && value !== undefined) el.textContent = value;
}

// ─── ALERTS ───────────────────────────────────────────────────────────────────
function renderAlerts(alerts) {
    const list = document.getElementById('alerts-list');
    // Supports both string array and object array { message, level }
    list.innerHTML = alerts.map(a => {
        const msg   = typeof a === 'string' ? a : a.message;
        const level = typeof a === 'object' ? (a.level || 'low') : 'low';
        return `
            <li class="alert-item alert-item--${level}">
                <span class="alert-dot alert-dot--${level}"></span>
                ${msg}
            </li>`;
    }).join('');
}

// ─── RECOMMENDATIONS ──────────────────────────────────────────────────────────
function renderRecs(recs) {
    const list = document.getElementById('rec-list');
    list.innerHTML = recs.map((r, i) => `
        <li class="rec-item">
            <span class="rec-num">${String(i + 1).padStart(2, '0')}</span>
            ${r}
        </li>`
    ).join('');
}

// ─── REVENUE CHART ────────────────────────────────────────────────────────────
function renderRevenueChart(labels, data) {
    // Hide empty state, show canvas
    document.getElementById('revenueEmpty').hidden = true;
    document.getElementById('revenueChartContainer').hidden = false;

    const ctx = document.getElementById('revenueChart');
    if (revenueChart) revenueChart.destroy();

    revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Revenue',
                data,
                borderColor: '#1f3c88',
                backgroundColor: 'rgba(31,60,136,0.08)',
                borderWidth: 2.5,
                pointRadius: 5,
                pointBackgroundColor: '#1f3c88',
                tension: 0.35,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false } },
                y: {
                    grid: { color: '#f0f2f8' },
                    ticks: { callback: v => '₦' + (v / 1000).toFixed(0) + 'k' }
                }
            }
        }
    });
}

// ─── PRODUCT CHART ────────────────────────────────────────────────────────────
function renderProductChart(labels, data) {
    // Hide empty state, show canvas
    document.getElementById('productEmpty').hidden = true;
    document.getElementById('productChartContainer').hidden = false;

    const ctx = document.getElementById('productChart');
    if (productChart) productChart.destroy();

    const colors = [
        'rgba(31,60,136,0.8)',  'rgba(26,158,106,0.8)',
        'rgba(201,123,0,0.8)',  'rgba(201,74,48,0.8)',
        'rgba(124,61,201,0.8)', 'rgba(14,159,168,0.8)'
    ];

    productChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Revenue',
                data,
                backgroundColor: labels.map((_, i) => colors[i % colors.length]),
                borderRadius: 5,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    grid: { color: '#f0f2f8' },
                    ticks: { callback: v => '₦' + (v / 1000).toFixed(0) + 'k' }
                },
                y: { grid: { display: false } }
            }
        }
    });
}