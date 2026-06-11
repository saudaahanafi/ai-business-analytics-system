// Chart instances
let revenueTrendChart = null;
let productPerformanceChart = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
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
        const activeCurrency = data.currency || "USD";

        document.getElementById('totalRevenue').textContent = formatCurrency(data.total_revenue, activeCurrency);
        document.getElementById('netProfit').textContent = formatCurrency(data.net_profit, activeCurrency);
        document.getElementById('profitMargin').textContent = parseFloat(data.profit_margin) .toFixed(1) + '%';  
        document.getElementById('topProduct').textContent = data.top_product || 'N/A';

        // Populate industry badge
        document.getElementById('industryBadge').textContent = data.industry || 'General';

        // Parse and render charts
        const revenueTrendLabels = JSON.parse(data.revenue_trend_labels || '[]');
        const revenueTrendData = JSON.parse(data.revenue_trend_data || '[]');
        const productLabels = JSON.parse(data.product_labels || '[]');
        const productData = JSON.parse(data.product_data || '[]');

        renderRevenueChart(revenueTrendLabels, revenueTrendData, activeCurrency);
        renderProductChart(productLabels, productData, activeCurrency);

        // Parse and display insights
        const alerts = JSON.parse(data.alerts || '[]');
        const recommendations = JSON.parse(data.recommendations || '[]');

        displayRisks(alerts);
        displayRecommendations(recommendations);

        // Display model diagnostics
        document.getElementById('modelR2').textContent = (parseFloat(data.model_r2) * 100).toFixed(2) + '%';
        document.getElementById('classifierAccuracy').textContent = (parseFloat(data.classifier_accuracy) * 100).toFixed(2) + '%';
        document.getElementById('selectedModel').textContent = data.selected_model || 'Advanced Analytics Model';

    } catch (error) {
        console.error('Error populating results:', error);
        showErrorMessage('Error displaying results. Please try again.');
    }
}

// Render revenue trend chart
function renderRevenueChart(labels, data, currencyCode) {
    const ctx = document.getElementById('revenueTrendChart').getContext('2d');

    // Clear old chart if exists
    if (revenueTrendChart) {
        revenueTrendChart.destroy();
    }

    revenueTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `Monthly Revenue (${currencyCode.toUpperCase()})`,
                data: data,
                borderColor: '#0066cc',
                backgroundColor: 'rgba(0, 102, 204, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#0066cc',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7,
                pointHoverBackgroundColor: '#003d99'
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
                        color: '#1a1a1a',
                        font: {
                            weight: '600',
                            size: 14
                        },
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    borderRadius: 6,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
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
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        color: '#666666',
                        font: { size: 12 },
                        callback: function(value) {
                            return formatCurrency(value, currencyCode);
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#666666',
                        font: { size: 12 }
                    }
                }
            }
        }
    });
}

// Render product performance chart
function renderProductChart(labels, data, currencyCode) {
    const ctx = document.getElementById('productPerformanceChart').getContext('2d');

    // Clear old chart if exists
    if (productPerformanceChart) {
        productPerformanceChart.destroy();
    }

    productPerformanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sales Volume',
                data: data,
                backgroundColor: '#0066cc',
                borderColor: '#003d99',
                borderWidth: 1,
                borderRadius: 8,
                borderSkipped: false,
                hoverBackgroundColor: '#003d99'
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
                        color: '#1a1a1a',
                        font: {
                            weight: '600',
                            size: 14
                        },
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    borderRadius: 6,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
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
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        color: '#666666',
                        font: { size: 12 }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#666666',
                        font: { size: 12 }
                    }
                }
            }
        }
    });
}

// Display operational risks/alerts
function displayRisks(alerts) {
    const risksList = document.getElementById('risksList');
    risksList.innerHTML = '';

    if (Array.isArray(alerts) && alerts.length > 0) {
        alerts.forEach(alert => {
            const li = document.createElement('li');
            li.textContent = alert;
            risksList.appendChild(li);
        });
    } else {
        const li = document.createElement('li');
        li.textContent = 'No critical operational risks identified. All systems operating normally.';
        risksList.appendChild(li);
    }
}

// Display AI recommendations
function displayRecommendations(recommendations) {
    const recList = document.getElementById('recommendationsList');
    recList.innerHTML = '';

    if (Array.isArray(recommendations) && recommendations.length > 0) {
        recommendations.forEach(rec => {
            const li = document.createElement('li');
            li.textContent = rec;
            recList.appendChild(li);
        });
    } else {
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
    const resultsContent = document.querySelector('.results-content');
    if (resultsContent) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
            border-radius: 8px;
            padding: 16px;
            margin: 20px 0;
            font-size: 14px;
        `;
        errorDiv.textContent = message;
        resultsContent.insertBefore(errorDiv, resultsContent.firstChild);
    }
}