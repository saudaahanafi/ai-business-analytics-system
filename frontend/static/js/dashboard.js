/**
 * dashboard.js
 *
 * This file handles:
 *  1. CSV upload UI (drag & drop, file picker, form submit)
 *  2. Chart rendering (called by Jamal's backend response OR loadDashboard())
 *  3. KPI, alerts, and recommendation population
 *
 * ─── FOR JAMAL ───────────────────────────────────────────────────────────────
 * When the backend is ready, replace the two TODO sections below:
 *
 *  TODO A — upload form POST → ../backend/upload_data.php
 *  TODO B — loadDashboard()  → fetch from ../backend/generate_report.php
 *
 * Expected JSON shape from generate_report.php:
 * {
 *   "kpis": {
 *     "revenue":     "₦1,250,000",
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
 *   "alerts":          ["Argan Oil stock low", ...],
 *   "recommendations": ["Increase Argan Oil stock", ...]
 * }
 * ─────────────────────────────────────────────────────────────────────────────
 */
 
let revenueChart = null;
let productChart  = null;
 
// ─── UPLOAD UI ───────────────────────────────────────────────────────────────
 
const uploadZone     = document.getElementById('uploadZone');
const csvFileInput   = document.getElementById('csvFile');
const uploadFilename = document.getElementById('uploadFilename');
const btnUpload      = document.getElementById('btnUpload');
const uploadForm     = document.getElementById('uploadForm');
const uploadStatus   = document.getElementById('uploadStatus');
const uploadStatusText = document.getElementById('uploadStatusText');
 
// File chosen via picker
csvFileInput.addEventListener('change', () => {
    const file = csvFileInput.files[0];
    if (file) {
        uploadFilename.textContent = file.name;
        btnUpload.disabled = false;
        uploadZone.classList.add('upload-zone--ready');
    }
});
 
// Drag & drop
uploadZone.addEventListener('dragover', e => {
    e.preventDefault();
    uploadZone.classList.add('upload-zone--drag');
});
uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('upload-zone--drag');
});
uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('upload-zone--drag');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
        csvFileInput.files = e.dataTransfer.files;
        uploadFilename.textContent = file.name;
        btnUpload.disabled = false;
        uploadZone.classList.add('upload-zone--ready');
    } else {
        alert('Please upload a .csv file.');
    }
});
 
// Form submit
uploadForm.addEventListener('submit', e => {
    e.preventDefault();
 
    uploadStatus.hidden = false;
    uploadStatusText.textContent = 'Processing your data...';
    btnUpload.disabled = true;
 
    // ─── TODO A (Jamal): replace this block with real fetch ──────────────────
    //
    // const formData = new FormData(uploadForm);
    // fetch('../backend/upload_data.php', { method: 'POST', body: formData })
    //     .then(res => res.json())
    //     .then(data => {
    //         uploadStatusText.textContent = 'Upload complete! Loading dashboard...';
    //         applyData(data);
    //     })
    //     .catch(err => {
    //         uploadStatusText.textContent = 'Upload failed. Please try again.';
    //         btnUpload.disabled = false;
    //         console.error(err);
    //     });
    //
    // ─────────────────────────────────────────────────────────────────────────
    // TEMP: simulate processing delay (remove once backend is connected)
    setTimeout(() => {
        uploadStatusText.textContent = 'Backend not connected yet — data will appear here once Jamal links the PHP.';
        btnUpload.disabled = false;
    }, 1500);
});
 
// ─── DASHBOARD LOADER ─────────────────────────────────────────────────────────
 
document.getElementById('company').addEventListener('change', function () {
    const company = this.value;
    if (!company) return;
    loadDashboard(company);
});
 
function loadDashboard(company) {
    // ─── TODO B (Jamal): replace with real fetch ─────────────────────────────
    //
    // fetch(`../backend/generate_report.php?company=${encodeURIComponent(company)}`)
    //     .then(res => res.json())
    //     .then(data => applyData(data))
    //     .catch(err => console.error('Failed to load report:', err));
    //
    // ─────────────────────────────────────────────────────────────────────────
    console.log('loadDashboard called for:', company, '— awaiting backend connection');
}
 
// ─── DATA RENDERER ────────────────────────────────────────────────────────────
// Jamal calls this with the JSON from generate_report.php
 
function applyData(data) {
    renderKPIs(data.kpis);
    renderRevenueChart(data.revenue_trend.labels, data.revenue_trend.data);
    renderProductChart(data.products.labels, data.products.data);
    renderAlerts(data.alerts);
    renderRecs(data.recommendations);
}
 
// ─── KPIs ─────────────────────────────────────────────────────────────────────
 
function renderKPIs(kpis) {
    setText('kpi-revenue',    kpis.revenue);
    setText('kpi-margin',     kpis.margin);
    setText('kpi-roi',        kpis.roi);
    setText('kpi-top-product', kpis.top_product);
}
 
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? '--';
}
 
// ─── CHARTS ───────────────────────────────────────────────────────────────────
 
function renderRevenueChart(labels, data) {
    document.getElementById('revenueEmpty').hidden = true;
 
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
                borderWidth: 2,
                pointRadius: 5,
                tension: 0.35,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { ticks: { callback: v => '₦' + (v/1000).toFixed(0) + 'k' } }
            }
        }
    });
}
 
function renderProductChart(labels, data) {
    document.getElementById('productEmpty').hidden = true;
 
    const ctx = document.getElementById('productChart');
    if (productChart) productChart.destroy();
 
    productChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Revenue',
                data,
                backgroundColor: 'rgba(31,60,136,0.75)',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { ticks: { callback: v => '₦' + (v/1000).toFixed(0) + 'k' } }
            }
        }
    });
}
 
// ─── ALERTS & RECS ────────────────────────────────────────────────────────────
 
function renderAlerts(alerts) {
    const list = document.getElementById('alerts-list');
    if (!alerts || alerts.length === 0) {
        list.innerHTML = '<li class="empty-state">No alerts at this time</li>';
        return;
    }
    list.innerHTML = alerts.map(a => `<li>${a}</li>`).join('');
}
 
function renderRecs(recs) {
    const list = document.getElementById('rec-list');
    if (!recs || recs.length === 0) {
        list.innerHTML = '<li class="empty-state">No recommendations yet</li>';
        return;
    }
    list.innerHTML = recs.map(r => `<li>${r}</li>`).join('');
}
 