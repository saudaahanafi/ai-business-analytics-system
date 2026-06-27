// =============================================================================
// dashboard.js  —  AI Business Analytics & Decision Support System
// =============================================================================

let revenueTrendChart     = null;
let productPerformanceChart = null;

document.addEventListener('DOMContentLoaded', function () {
    loadDemoCards();          // Populate demo businesses dynamically
    setupUploadHandlers();    // Drag-drop + file browse
    animateCounters();        // Stats band counter animation
    setAnalyticsDate();
});   

// =============================================================================
// Centralised auth + subscription guard
// Checks HTTP status code, JSON redirect field, and error message keyword.
// =============================================================================
function handleAuthErrors(response, data) {
    if (response && response.status === 401) { window.location.href = 'login.html'; return false; }
    if (response && response.status === 403) { window.location.href = 'payment.html'; return false; }
    if (data && data.redirect)               { window.location.href = data.redirect; return false; }
    if (data && data.error && data.error.toLowerCase().includes('subscription')) {
        window.location.href = 'payment.html'; return false;
    }     
    return true;
}

// =============================================================================
// DEMO CARDS — dynamically loaded from dashboard.php
// =============================================================================
const DEMO_ICONS   = ['🌿', '👗', '🏪', '📦', '💄', '🛍️'];
const DEMO_SECTORS = {
    default: ['Revenue Analytics', 'Demand Forecasting', 'AI Recommendations'],
};
const DEMO_COLORS  = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

function loadDemoCards() {
    fetch('/ai-business-analytics-system/backend/api/dashboard.php?fetch_samples=true')
        .then(response => {
            if (!handleAuthErrors(response, null)) return null;
            if (!response.ok) throw new Error('Network error: ' + response.status);
            return response.json();
        })
        .then(data => {
            if (!data) return;
            if (!handleAuthErrors(null, data)) return;

            const container = document.getElementById('demoCards');
            container.innerHTML = ''; // Clear skeletons

            if (!Array.isArray(data) || data.length === 0) {
                container.innerHTML = '<p style="text-align:center;color:var(--gray-400);grid-column:1/-1;">No demo reports available yet.</p>';
                return;
            }

            data.forEach((sample, i) => {
                const card = buildDemoCard(sample, i);
                container.appendChild(card);
            });
        })
        .catch(err => {
            console.error('Demo cards error:', err);
            const container = document.getElementById('demoCards');
            container.innerHTML = '<p style="text-align:center;color:var(--gray-400);grid-column:1/-1;">Demo reports unavailable right now.</p>';
        });
}

function buildDemoCard(sample, index) {
    const icon  = DEMO_ICONS[index % DEMO_ICONS.length];
    const color = DEMO_COLORS[index % DEMO_COLORS.length];
    const features = DEMO_SECTORS.default;

    // Guess a sector label from the company name
    const name = (sample.company_name || '').toLowerCase();
    let sector = 'Business Analytics';
    if (name.includes('fashion') || name.includes('marwa') || name.includes('cloth')) sector = 'Fashion Retail';
    else if (name.includes('secret') || name.includes('skin') || name.includes('cosm')) sector = 'Skincare / Cosmetics';
    else if (name.includes('food') || name.includes('cafe') || name.includes('restaurant')) sector = 'Food & Beverage';
    else if (name.includes('tech') || name.includes('digit')) sector = 'Technology';

    const div = document.createElement('div');
    div.className = 'demo-card';
    div.innerHTML = `
        <div class="demo-card-icon" style="background: linear-gradient(135deg, ${color}, ${color}cc)">
            ${icon}
        </div>
        <div class="demo-card-industry">${sector}</div>
        <div class="demo-card-name">${sample.company_name}</div>
        <ul class="demo-card-features">
            ${features.map(f => `<li>${f}</li>`).join('')}
        </ul>
        <button class="demo-card-btn" data-id="${sample.id}">
            <svg viewBox="0 0 20 20" fill="currentColor" width="15"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>
            View Demo Report
        </button>
    `;

    // Click either the button or the card
    div.querySelector('.demo-card-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        loadAnalyticsData(this.dataset.id, sample.company_name);
    });
    div.addEventListener('click', function () {
        loadAnalyticsData(sample.id, sample.company_name);
    });

    return div;
}

// =============================================================================
// UPLOAD HANDLERS
// =============================================================================
function setupUploadHandlers() {
    const dropZone   = document.getElementById('dropZone');
    const fileInput  = document.getElementById('fileInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const fileName   = document.getElementById('dropFileName');

    dropZone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
        dropZone.addEventListener(ev, e => e.preventDefault(), false);
    });

    dropZone.addEventListener('dragover',  () => dropZone.classList.add('dragover'));
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

    dropZone.addEventListener('drop', e => {
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files;
            fileName.textContent = '📄 ' + e.dataTransfer.files[0].name;
        }
    });

    fileInput.addEventListener('change', function () {
        if (this.files.length > 0) {
            fileName.textContent = '📄 ' + this.files[0].name;
        }
    });

    analyzeBtn.addEventListener('click', handleUpload);
}

function handleUpload() {
    const fileInput   = document.getElementById('fileInput');
    const companyName = document.getElementById('companyName').value.trim();
    const statusDiv   = document.getElementById('uploadStatus');

    if (!fileInput.files.length) {
        showStatus(statusDiv, 'error', 'Please select a CSV file first.');
        return;
    }
    if (!companyName) {
        showStatus(statusDiv, 'error', 'Please enter your business name.');
        return;
    }

    const formData = new FormData();
    formData.append('csv_file', fileInput.files[0]);
    formData.append('company_name', companyName);

    // Show pipeline animation
    showPipeline();

    fetch('/ai-business-analytics-system/backend/api/dashboard.php', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!handleAuthErrors(response, null)) { hidePipeline(); return null; }
        if (!response.ok) return response.json().then(err => { throw new Error(err.error || 'Server error'); });
        return response.json();
    })
    .then(data => {
        hidePipeline();
        if (!data) return;
        if (!handleAuthErrors(null, data)) return;

        if (data.success) {
            showStatus(statusDiv, 'success', '✓ Analysis complete! Redirecting to your report…');
            setTimeout(() => {
                window.location.href = 'results.html?upload_id=' + data.upload_id;
            }, 1500);
        } else {
            throw new Error(data.error || 'Upload failed. Check your CSV column headers.');
        }
    })
    .catch(error => {
        hidePipeline();
        showStatus(statusDiv, 'error', error.message);
        console.error('Upload error:', error);
    });
}

function showStatus(div, type, msg) {
    div.className = 'upload-status ' + type;
    div.innerHTML = (type === 'loading' ? '<span class="spinner"></span>' : '') + msg;
}

// =============================================================================
// PIPELINE ANIMATION
// =============================================================================
let pipelineTimer = null;

function showPipeline() {
    const overlay = document.getElementById('pipelineOverlay');
    const steps   = document.querySelectorAll('.step-item');
    overlay.classList.add('active');

    // Reset all steps
    steps.forEach(s => { s.className = 'step-item pending'; });

    let i = 0;
    function tick() {
        if (i > 0) steps[i - 1].className = 'step-item done';
        if (i < steps.length) {
            steps[i].className = 'step-item active';
            i++;
            // Vary delay to feel more realistic
            const delay = i < 3 ? 400 : i < 6 ? 600 : 800;
            pipelineTimer = setTimeout(tick, delay);
        }
    }
    tick();
}

function hidePipeline() {
    clearTimeout(pipelineTimer);
    const overlay = document.getElementById('pipelineOverlay');
    const steps   = document.querySelectorAll('.step-item');
    steps.forEach(s => { s.className = 'step-item done'; });
    setTimeout(() => { overlay.classList.remove('active'); }, 600);
}

// =============================================================================
// LOAD ANALYTICS DATA
// =============================================================================
function loadAnalyticsData(uploadId, companyName) {
    // Scroll to analytics section
    document.getElementById('analyticsSection').classList.remove('hidden');
    document.getElementById('analyticsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });

    fetch('/ai-business-analytics-system/backend/api/dashboard.php?upload_id=' + uploadId)
        .then(response => {
            if (!handleAuthErrors(response, null)) return null;
            if (!response.ok) throw new Error('Network error');
            return response.json();
        })
        .then(data => {
            if (!data) return;
            if (!handleAuthErrors(null, data)) return;
            populateAnalytics(data, companyName);
        })
        .catch(error => {
            console.error('Analytics error:', error);
            document.getElementById('uploadStatus').textContent = 'Error loading analytics data.';
        });
}

// =============================================================================
// POPULATE ANALYTICS UI
// =============================================================================
function populateAnalytics(data, companyName) {
    const currency = data.currency || 'USD';

    // Header
    document.getElementById('analyticsCompanyName').textContent =
        (companyName || data.company_name || 'Business') + ' — Analytics Report';
    document.getElementById('analyticsDate').textContent =
        'Generated ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    // KPIs
    document.getElementById('totalRevenue').textContent = formatCurrency(data.total_revenue, currency);
    document.getElementById('netProfit').textContent    = formatCurrency(data.net_profit, currency);
    document.getElementById('profitMargin').textContent = data.profit_margin || '0%';
    document.getElementById('topProduct').textContent   = data.top_product || 'N/A';

    // Business Health Score (derived)
    const r2  = parseFloat(data.model_r2 || 0);
    const acc = parseFloat(data.classifier_accuracy || 0);
    const margin = parseFloat((data.profit_margin || '0').replace('%', ''));
    const healthScore = Math.min(100, Math.round((r2 * 40 + acc * 40 + Math.min(margin / 30, 1) * 20) * 100));
    document.getElementById('businessHealth').textContent   = healthScore + ' / 100';
    document.getElementById('execHealthScore').textContent  = healthScore + ' / 100';
    document.getElementById('modelAccuracyKpi').textContent = (acc * 100).toFixed(1) + '%';

    // Charts
    try {
        renderRevenueChart(JSON.parse(data.revenue_trend_labels), JSON.parse(data.revenue_trend_data), currency);
        renderProductChart(JSON.parse(data.product_labels), JSON.parse(data.product_data), currency);
    } catch (e) { console.error('Chart parse error:', e); }

    // Insights
    try {
        displayAlerts(JSON.parse(data.alerts));
        displayRecommendations(JSON.parse(data.recommendations));
    } catch (e) { console.error('Insights parse error:', e); }

    // Executive Summary
    buildExecutiveSummary(data, healthScore, currency);

    // Diagnostics
    document.getElementById('modelR2').textContent           = (r2 * 100).toFixed(2) + '%';
    document.getElementById('classifierAccuracy').textContent = (acc * 100).toFixed(2) + '%';
    document.getElementById('selectedModel').textContent      = data.selected_model || 'N/A';
}

// =============================================================================
// EXECUTIVE SUMMARY
// =============================================================================
function buildExecutiveSummary(data, healthScore, currency) {
    const body = document.getElementById('execSummaryBody');
    const margin = parseFloat((data.profit_margin || '0').replace('%', ''));

    const points = [
        `Business Health Score is <strong>${healthScore}/100</strong> — ` +
            (healthScore >= 80 ? 'indicating strong overall performance.' :
             healthScore >= 60 ? 'showing moderate performance with room for improvement.' :
             'requiring strategic intervention to improve key metrics.'),

        `Total revenue stands at <strong>${formatCurrency(data.total_revenue, currency)}</strong> with a net profit of <strong>${formatCurrency(data.net_profit, currency)}</strong>, yielding a profit margin of <strong>${data.profit_margin || 'N/A'}</strong>.`,

        `Top-performing product: <strong>${data.top_product || 'N/A'}</strong>. Focus marketing and inventory investment on this product to maximise return.`,

        margin < 15
            ? `Profit margin is below 15%. <strong>Recommendation:</strong> Review cost structure and pricing strategy to improve margins.`
            : `Profit margins are healthy at ${data.profit_margin}. Sustaining this performance requires consistent inventory management and demand forecasting.`,

        `AI model achieved <strong>${(parseFloat(data.classifier_accuracy || 0) * 100).toFixed(1)}% classifier accuracy</strong> and an R² score of <strong>${(parseFloat(data.model_r2 || 0) * 100).toFixed(1)}%</strong>, indicating ${parseFloat(data.model_r2 || 0) > 0.85 ? 'high' : 'moderate'} predictive reliability.`
    ];

    body.innerHTML = points.map(p => `<p>${p}</p>`).join('');
}

// =============================================================================
// CHARTS
// =============================================================================
function renderRevenueChart(labels, data, currencyCode) {
    const ctx = document.getElementById('revenueTrendChart').getContext('2d');
    if (revenueTrendChart) revenueTrendChart.destroy();
    revenueTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Revenue (' + currencyCode.toUpperCase() + ')',
                data,
                borderColor: '#0ea5e9',
                backgroundColor: 'rgba(14,165,233,0.08)',
                borderWidth: 2.5,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#0ea5e9',
                pointRadius: 4,
                pointHoverRadius: 6,
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#f1f5f9' },
                    ticks: { callback: v => formatCurrency(v, currencyCode), font: { size: 11 } }
                },
                x: { grid: { display: false }, ticks: { font: { size: 11 } } }
            }
        }
    });
}

function renderProductChart(labels, data, currencyCode) {
    const ctx = document.getElementById('productPerformanceChart').getContext('2d');
    if (productPerformanceChart) productPerformanceChart.destroy();

    const colors = ['#0ea5e9','#38bdf8','#7dd3fc','#0284c7','#0369a1','#06b6d4'];

    productPerformanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Revenue (' + currencyCode.toUpperCase() + ')',
                data,
                backgroundColor: labels.map((_, i) => colors[i % colors.length]),
                borderRadius: 6,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#f1f5f9' },
                    ticks: { callback: v => formatCurrency(v, currencyCode), font: { size: 11 } }
                },
                x: { grid: { display: false }, ticks: { font: { size: 11 } } }
            }
        }
    });
}

// =============================================================================
// INSIGHTS
// =============================================================================
function displayAlerts(alerts) {
    const list = document.getElementById('risksList');
    list.innerHTML = '';
    if (Array.isArray(alerts) && alerts.length > 0) {
        alerts.forEach(a => {
            const li = document.createElement('li');
            li.textContent = a;
            list.appendChild(li);
        });
    } else {
        list.innerHTML = '<li>No critical risks identified at this time.</li>';
    }
}

function displayRecommendations(recs) {
    const list = document.getElementById('recommendationsList');
    list.innerHTML = '';
    if (Array.isArray(recs) && recs.length > 0) {
        recs.forEach(r => {
            const li = document.createElement('li');
            li.textContent = r;
            list.appendChild(li);
        });
    } else {
        list.innerHTML = '<li>Upload data to generate AI recommendations.</li>';
    }
}

// =============================================================================
// CURRENCY FORMATTER
// =============================================================================
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
        return currencyCode + ' ' + parseFloat(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
}

// =============================================================================
// COUNTER ANIMATION (stats band)
// =============================================================================
function animateCounters() {
    const counters = document.querySelectorAll('.stat-num[data-target]');
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el     = entry.target;
            const target = parseInt(el.dataset.target, 10);
            const duration = 1600;
            const step     = Math.ceil(target / (duration / 16));
            let current    = 0;
            const timer = setInterval(() => {
                current = Math.min(current + step, target);
                el.textContent = current.toLocaleString();
                if (current >= target) clearInterval(timer);
            }, 16);
            observer.unobserve(el);
        });
    }, { threshold: 0.4 });
    counters.forEach(c => observer.observe(c));
}

// =============================================================================
// SET ANALYTICS DATE
// =============================================================================
function setAnalyticsDate() {
    const el = document.getElementById('analyticsDate');
    if (el) el.textContent = 'Generated ' + new Date().toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
}
