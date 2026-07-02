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
        const predictedTrendData = JSON.parse(data.predicted_revenue_trend_data || '[]');
        const productLabels      = JSON.parse(data.product_labels       || '[]');
        const productData        = JSON.parse(data.product_data         || '[]');

        renderRevenueChart(revenueTrendLabels, revenueTrendData, activeCurrency, predictedTrendData,
            JSON.parse(data.future_revenue_forecast || 'null'));
        renderProductChart(productLabels, productData, activeCurrency);

        // Parse and display insights
        const alerts          = JSON.parse(data.alerts          || '[]');
        const recommendations = JSON.parse(data.recommendations || '[]');

        displayRisks(alerts);
        displayRecommendations(recommendations);

        // New features
        renderHealthGauge(data);
        renderDemandBreakdownChart(JSON.parse(data.demand_breakdown || 'null'));
        renderInventoryBars(JSON.parse(data.inventory_status || '[]'));
        initPriceSimulator(
            JSON.parse(data.price_simulator_data || '{}'),
            parseFloat(data.avg_transaction_value || 0),
            activeCurrency
        );
        renderSatisfactionCard(JSON.parse(data.review_summary || 'null'), JSON.parse(data.review_theme_analysis || 'null'));
        renderForecastPills(JSON.parse(data.future_revenue_forecast || 'null'), activeCurrency);

        // Build and display executive summary narrative
        buildExecutiveSummaryNarrative(data, activeCurrency);

    } catch (error) {
        console.error('Error populating results:', error);
        showErrorMessage('Error displaying results. Please try again.');
    }
}

// Resolve a 0-100 health score: prefer the server-computed value (accurate),
// fall back to a corrected client-side calc for older reports that predate it.
function resolveHealthScore(data) {
    if (data.health_score !== undefined && data.health_score !== null && data.health_score !== '') {
        return Math.max(0, Math.min(100, Math.round(parseFloat(data.health_score))));
    }
    const margin = parseFloat((data.profit_margin || '0').toString().replace('%', ''));
    const r2  = parseFloat(data.model_r2 || 0);
    const acc = parseFloat(data.classifier_accuracy || 0);
    // NOTE: this is the corrected formula (no stray *100) — the old inline
    // version multiplied by 100 a second time and always clamped to 100.
    const score = (r2 * 40) + (acc * 40) + (Math.min(margin / 30, 1) * 20);
    return Math.max(0, Math.min(100, Math.round(score)));
}

// Animate the circular health gauge in the executive summary header
function renderHealthGauge(data) {
    const score = resolveHealthScore(data);
    const circumference = 213.6; // 2 * PI * r(34)
    const offset = circumference - (score / 100) * circumference;

    const fill = document.getElementById('healthGaugeFill');
    const valueEl = document.getElementById('healthScoreValue');
    const labelEl = document.getElementById('healthScoreLabel');
    if (!fill || !valueEl) return;

    const color = score >= 80 ? '#ffffff' : score >= 60 ? '#fef3c7' : '#fecaca';
    fill.style.stroke = color;

    requestAnimationFrame(() => {
        fill.style.strokeDashoffset = offset;
    });
    valueEl.textContent = score;
    if (labelEl) {
        labelEl.textContent = score >= 80 ? 'Strong Health' : score >= 60 ? 'Moderate Health' : 'Needs Attention';
    }
}

// Doughnut chart of Low/Medium/High predicted demand across products
let demandBreakdownChart = null;
function renderDemandBreakdownChart(breakdown) {
    const canvas = document.getElementById('demandBreakdownChart');
    if (!canvas || !breakdown) return;
    const ctx = canvas.getContext('2d');
    if (demandBreakdownChart) { demandBreakdownChart.destroy(); }

    demandBreakdownChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: breakdown.labels || ['Low', 'Medium', 'High'],
            datasets: [{
                data: breakdown.data || [0, 0, 0],
                backgroundColor: ['#38bdf8', '#f59e0b', '#ef4444'],
                borderColor: '#ffffff',
                borderWidth: 3,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#334155', font: { weight: '600', size: 12 }, padding: 14 }
                },
                tooltip: {
                    backgroundColor: 'rgba(15,23,42,0.85)',
                    padding: 12,
                    borderRadius: 8,
                    callbacks: {
                        label: function(context) {
                            return context.label + ': ' + context.parsed + ' product(s)';
                        }
                    }
                }
            }
        }
    });
}

// Visual stock-level bars per product
function renderInventoryBars(inventoryStatus) {
    const container = document.getElementById('inventoryBarsList');
    if (!container) return;

    if (!inventoryStatus || inventoryStatus.length === 0) {
        container.innerHTML = '<p class="inv-loading">No inventory data available for this upload.</p>';
        return;
    }

    const maxScale = Math.max(...inventoryStatus.map(i => i.stock), inventoryStatus[0].med_thresh * 2, 1);

    container.innerHTML = inventoryStatus.map(item => {
        const pct = item.level === 'untracked' ? 4 : Math.max(4, Math.min(100, Math.round((item.stock / maxScale) * 100)));
        const levelText = {
            healthy: 'Healthy', medium: 'Restock soon', high: 'Critical', untracked: 'Not tracked'
        }[item.level] || 'Unknown';
        return `
            <div class="inv-bar-row">
                <div class="inv-bar-top">
                    <span class="inv-bar-product">${item.product}</span>
                    <span class="inv-bar-stock">${item.level === 'untracked' ? levelText : item.stock + ' units · ' + levelText}</span>
                </div>
                <div class="inv-bar-track">
                    <div class="inv-bar-fill ${item.level}" style="width:${pct}%;"></div>
                </div>
            </div>
        `;
    }).join('');
}

// ── Price What-If Simulator ─────────────────────────────────────
let _simData = {};
let _simAvgTxnValue = 0;
let _simCurrency = 'USD';

function initPriceSimulator(priceSimData, avgTxnValue, currency) {
    _simData = priceSimData || {};
    _simAvgTxnValue = avgTxnValue || 0;
    _simCurrency = currency || 'USD';

    const select = document.getElementById('simProductSelect');
    if (!select) return;

    const productNames = Object.keys(_simData);
    if (productNames.length === 0) {
        select.innerHTML = '<option>No product data available</option>';
        return;
    }

    select.innerHTML = productNames.map(p => `<option value="${p}">${p}</option>`).join('');
    runPriceSimulator();
}

// Simple, transparent constant-elasticity (-1) estimate: % change in price
// produces an inverse % change in quantity, so revenue impact is a function
// of price^2 relative to the baseline — clearly labeled as directional only.
function runPriceSimulator() {
    const select = document.getElementById('simPriceSlider');
    const productSelect = document.getElementById('simProductSelect');
    if (!select || !productSelect) return;

    const pctChange = parseInt(select.value, 10) || 0;
    const product = productSelect.value;
    const stats = _simData[product];

    document.getElementById('simPriceLabel').textContent = (pctChange > 0 ? '+' : '') + pctChange + '%';

    if (!stats) {
        document.getElementById('simNewPrice').textContent = '--';
        document.getElementById('simRevenueImpact').textContent = '--';
        document.getElementById('simCustomerImpact').textContent = '--';
        return;
    }

    const priceMultiplier = 1 + (pctChange / 100);
    const elasticity = stats.elasticity_assumed || -1;
    const qtyMultiplier = Math.max(0, 1 + elasticity * (pctChange / 100));

    const baseRevenue = stats.avg_price * stats.avg_qty;
    const newPrice = stats.avg_price * priceMultiplier;
    const newQty = stats.avg_qty * qtyMultiplier;
    const newRevenue = newPrice * newQty;
    const revenueDelta = newRevenue - baseRevenue;
    const revenueDeltaPct = baseRevenue > 0 ? (revenueDelta / baseRevenue) * 100 : 0;

    document.getElementById('simNewPrice').textContent = formatCurrency(newPrice, _simCurrency);

    const impactEl = document.getElementById('simRevenueImpact');
    impactEl.textContent = (revenueDelta >= 0 ? '+' : '') + formatCurrency(revenueDelta, _simCurrency) +
        ' (' + (revenueDeltaPct >= 0 ? '+' : '') + revenueDeltaPct.toFixed(1) + '%)';
    impactEl.style.color = revenueDelta >= 0 ? 'var(--success)' : 'var(--danger)';

    if (_simAvgTxnValue > 0) {
        const orders = revenueDelta / _simAvgTxnValue;
        const ordersText = (orders >= 0 ? '+' : '') + Math.round(orders) + ' orders';
        document.getElementById('simCustomerImpact').textContent = ordersText;
    } else {
        document.getElementById('simCustomerImpact').textContent = 'N/A';
    }
}

// Build detailed executive summary narrative
function buildExecutiveSummaryNarrative(data, currency) {
    const margin = parseFloat((data.profit_margin || '0').replace('%', ''));
    const r2 = parseFloat(data.model_r2 || 0);
    const acc = parseFloat(data.classifier_accuracy || 0);
    const healthScore = resolveHealthScore(data);

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

// Customer satisfaction card — only shown if the CSV included a Rating column
function renderSatisfactionCard(reviewSummary, themeAnalysis) {
    const card = document.getElementById('satisfactionCard');
    if (!card) return;

    if (!reviewSummary || reviewSummary.overall_avg_rating === undefined) {
        card.style.display = 'none';
        return;
    }
    card.style.display = '';

    const avg = reviewSummary.overall_avg_rating;
    document.getElementById('avgRatingValue').textContent = avg.toFixed(1);
    document.getElementById('avgRatingStars').textContent = '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg));
    document.getElementById('ratingCount').textContent = reviewSummary.review_count + ' rating(s)';

    const dist = reviewSummary.rating_distribution || {};
    const maxCount = Math.max(...Object.values(dist), 1);
    const distEl = document.getElementById('ratingDistribution');
    distEl.innerHTML = [5, 4, 3, 2, 1].map(star => {
        const count = dist[String(star)] || 0;
        const pct = Math.round((count / maxCount) * 100);
        return `
            <div class="dist-row">
                <span class="dist-label">${star}★</span>
                <div class="dist-track"><div class="dist-fill" style="width:${pct}%;"></div></div>
                <span>${count}</span>
            </div>
        `;
    }).join('');

    const productRatings = reviewSummary.product_avg_rating || {};
    const lowRated = Object.entries(productRatings).filter(([, r]) => r < 3.0).map(([p]) => p);
    const atRiskEl = document.getElementById('atRiskProducts');
    if (lowRated.length > 0) {
        atRiskEl.className = 'at-risk-products visible';
        atRiskEl.textContent = '⚠ Below 3★ average: ' + lowRated.join(', ');
    } else {
        atRiskEl.className = 'at-risk-products';
        atRiskEl.textContent = '';
    }

    // Keyword-based review theme analysis (only present if CSV had a Review column)
    const themesEl = document.getElementById('feedbackThemes');
    if (!themesEl) return;

    if (!themeAnalysis || !themeAnalysis.theme_counts || Object.keys(themeAnalysis.theme_counts).length === 0) {
        themesEl.innerHTML = '';
        return;
    }

    const sortedThemes = Object.entries(themeAnalysis.theme_counts).sort((a, b) => b[1] - a[1]);
    let html = '<div style="font-size:0.75rem;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.04em;margin-top:6px;">Common Feedback Themes</div>';
    html += sortedThemes.map(([theme, count]) => `
        <div class="feedback-theme-row">
            <span class="feedback-theme-name">${theme}</span>
            <span class="feedback-theme-count">${count} mention(s)</span>
        </div>
    `).join('');

    const quotes = themeAnalysis.sample_quotes || {};
    const quoteEntries = Object.entries(quotes).slice(0, 2);
    if (quoteEntries.length > 0) {
        html += quoteEntries.map(([product, quote]) => `
            <div class="feedback-quote">"${quote}" — ${product}</div>
        `).join('');
    }

    themesEl.innerHTML = html;
}

// Forecast pills — next N months, forward of the historical data
function renderForecastPills(forecast, currencyCode) {
    const container = document.getElementById('forecastPills');
    const methodText = document.getElementById('forecastMethodText');
    if (!container) return;

    if (!forecast || !forecast.labels || forecast.labels.length === 0) {
        container.innerHTML = '<p class="inv-loading">Not enough historical data to forecast yet.</p>';
        return;
    }

    if (methodText && forecast.method) {
        methodText.textContent = 'Method: ' + forecast.method;
    }

    container.innerHTML = forecast.labels.map((label, i) => `
        <div class="forecast-pill">
            <span class="forecast-pill-month">${label}</span>
            <span class="forecast-pill-value">${formatCurrency(forecast.data[i], currencyCode)}</span>
        </div>
    `).join('');
}

// Render revenue trend chart (actual vs predicted vs future forecast)
function renderRevenueChart(labels, data, currencyCode, predictedData, forecast) {
    const ctx = document.getElementById('revenueTrendChart').getContext('2d');

    if (revenueTrendChart) { revenueTrendChart.destroy(); }

    let chartLabels = labels;
    let actualSeries = data;
    let predictedSeries = predictedData || [];
    const datasets = [];

    if (forecast && forecast.labels && forecast.labels.length > 0) {
        chartLabels = labels.concat(forecast.labels);
        actualSeries = data.concat(new Array(forecast.labels.length).fill(null));
        if (predictedSeries.length > 0) {
            predictedSeries = predictedSeries.concat(new Array(forecast.labels.length).fill(null));
        }
        // bridge the forecast line to the last actual point so it looks continuous
        const forecastSeries = new Array(labels.length - 1).fill(null)
            .concat([data[data.length - 1]])
            .concat(forecast.data);

        datasets.push({
            label: `Forecast Revenue (${currencyCode.toUpperCase()})`,
            data: forecastSeries,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16,185,129,0.05)',
            borderWidth: 2,
            borderDash: [2, 3],
            tension: 0.4,
            fill: false,
            pointBackgroundColor: '#10b981',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 6
        });
    }

    datasets.unshift({
        label: `Actual Revenue (${currencyCode.toUpperCase()})`,
        data: actualSeries,
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
    });

    if (predictedSeries.length > 0) {
        datasets.splice(1, 0, {
            label: `Predicted Revenue (${currencyCode.toUpperCase()})`,
            data: predictedSeries,
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139,92,246,0.05)',
            borderWidth: 2,
            borderDash: [6, 4],
            tension: 0.4,
            fill: false,
            pointBackgroundColor: '#8b5cf6',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#7c3aed'
        });
    }

    revenueTrendChart = new Chart(ctx, {
        type: 'line',
        data: { labels: chartLabels, datasets: datasets },
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
                            if (context.parsed.y === null) return null;
                            return context.dataset.label.split(' (')[0] + ': ' + formatCurrency(context.parsed.y, currencyCode);
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
        ['Business Health Score', resolveHealthScore(d) + ' / 100'],
        [],
        ['MODEL DIAGNOSTICS'],
        ['Model Engine',         d.selected_model         || 'N/A'],
        ['R² Score',             (parseFloat(d.model_r2)             * 100).toFixed(2) + '%'],
        ['Classifier Accuracy',  (parseFloat(d.classifier_accuracy)  * 100).toFixed(2) + '%'],
        [],
        ['REVENUE TREND (Actual vs Predicted)'],
        ['Period', 'Actual Revenue', 'Predicted Revenue'],
        ...buildTrendRows(d),
        [],
        ['PRODUCT PERFORMANCE'],
        ['Product', 'Sales Volume'],
        ...buildProductRows(d),
        [],
        ['PREDICTED DEMAND BREAKDOWN'],
        ...buildDemandRows(d),
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
        const predVals = JSON.parse(d.predicted_revenue_trend_data || '[]');
        return labels.map((l, i) => [l, vals[i] || 0, predVals[i] !== undefined ? predVals[i] : 'N/A']);
    } catch { return [['N/A', 'N/A', 'N/A']]; }
}

function buildDemandRows(d) {
    try {
        const breakdown = JSON.parse(d.demand_breakdown || 'null');
        if (!breakdown) return [['No demand data available']];
        return breakdown.labels.map((label, i) => [label + ' Demand', breakdown.data[i] + ' product(s)']);
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

    // Extract executive summary narrative from the DOM
    const narrativeDiv = document.querySelector('.exec-narrative');
    const executiveSummaryHTML = narrativeDiv ? narrativeDiv.innerHTML : '';

    // Convert Chart.js canvas elements to base64 images
    let revenueChartImg = '';
    let productChartImg = '';
    
    try {
        if (revenueTrendChart && revenueTrendChart.canvas) {
            revenueChartImg = revenueTrendChart.toBase64Image();
        }
    } catch (e) {
        console.warn('Could not convert revenue chart to image:', e);
    }
    
    try {
        if (productPerformanceChart && productPerformanceChart.canvas) {
            productChartImg = productPerformanceChart.toBase64Image();
        }
    } catch (e) {
        console.warn('Could not convert product chart to image:', e);
    }

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

${executiveSummaryHTML ? `<div class="section exec-summary-export">${executiveSummaryHTML}</div>` : ''}

<div class="section">
  <h2>Revenue Trend</h2>
  ${revenueChartImg ? `<img src="${revenueChartImg}" style="width:100%;max-width:800px;height:auto;border-radius:8px;margin-bottom:16px;"/>` : '<p>Chart data unavailable.</p>'}
  <table style="margin-top:16px;"><tr><th>Period</th><th>Revenue</th></tr>
  ${buildTrendRows(d).map(r => `<tr><td>${r[0]}</td><td>${formatCurrency(r[1], currency)}</td></tr>`).join('')}
  </table>
</div>

<div class="section">
  <h2>Product Performance</h2>
  ${productChartImg ? `<img src="${productChartImg}" style="width:100%;max-width:800px;height:auto;border-radius:8px;margin-bottom:16px;"/>` : '<p>Chart data unavailable.</p>'}
  <table style="margin-top:16px;"><tr><th>Product</th><th>Sales Volume (units)</th></tr>
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