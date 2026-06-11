// =============================================================================
// dashboard.js
// AI Business Analytics — Frontend Interaction & Render Script
// =============================================================================

// Chart instances
let revenueTrendChart = null;
let productPerformanceChart = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadSampleSelector();
    setupUploadHandlers();
    setupSampleSelectorListener();
});

// Load completed samples for dropdown
function loadSampleSelector() {
    // FIXED PATH: Converted to root-relative path to prevent 404 HTML response drops
    fetch('/ai-business-analytics-system/backend/api/dashboard.php?fetch_samples=true')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok: ' + response.status);
            }
            return response.json();
        })
        .then(data => {
            const selector = document.getElementById('sampleSelector');
            if (selector) selector.innerHTML = '<option value="">-- Select a Business Sample --</option>';
            
            if (Array.isArray(data)) {
                data.forEach(sample => {
                    const option = document.createElement('option');
                    option.value = sample.id;
                    option.textContent = sample.company_name;
                    selector.appendChild(option);
                });
            }
        })
        .catch(error => console.error('Error loading samples:', error));
}

// Setup file upload handlers
function setupUploadHandlers() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const analyzeBtn = document.getElementById('analyzeBtn');

    // Click to browse
    dropZone.addEventListener('click', () => fileInput.click());

    // Drag and drop events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => e.preventDefault(), false);
    });

    dropZone.addEventListener('dragover', () => {
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
        }
    });

    // Analyze button click
    analyzeBtn.addEventListener('click', handleUpload);
}

// Handle file upload
function handleUpload() {
    const fileInput = document.getElementById('fileInput');
    const companyName = document.getElementById('companyName').value.trim();
    const statusDiv = document.getElementById('uploadStatus');

    if (!fileInput.files.length) {
        statusDiv.className = 'status-message error';
        statusDiv.textContent = 'Please select a CSV file';
        return;
    }

    if (!companyName) {
        statusDiv.className = 'status-message error';
        statusDiv.textContent = 'Please enter a business name';
        return;
    }

    const formData = new FormData();
    formData.append('csv_file', fileInput.files[0]);
    formData.append('company_name', companyName);

    statusDiv.className = 'status-message loading';
    statusDiv.innerHTML = '<span class="spinner"></span> Processing data analytics pipeline...';

    // FIXED PATH: Converted to root-relative path targeting backend file processing operations
    fetch('/ai-business-analytics-system/backend/api/dashboard.php', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err.error || 'Server error'); });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            statusDiv.className = 'status-message success';
            statusDiv.textContent = 'Upload successful! Redirecting to report...';
            
            setTimeout(() => {
                window.location.href = 'results.html?upload_id=' + data.upload_id;
            }, 1500);
        } else {
            const errorMessage = data.error ? `Upload failed: ${data.error}` : 'Upload failed: Check your CSV column headers.';
        throw new Error(errorMessage);
        } 
    })
    .catch(error => {
        console.error('Upload execution error details:', error);
        statusDiv.className = 'status-message error';
        statusDiv.textContent = 'Error: ' + error.message;
    });
}

// Setup sample selector listener
function setupSampleSelectorListener() {
    const selector = document.getElementById('sampleSelector');
    const analyticsSection = document.getElementById('analyticsSection');

    selector.addEventListener('change', function() {
        const selectedId = this.value;
        
        if (!selectedId) {
            analyticsSection.classList.add('hidden');
            return;
        }

        analyticsSection.classList.remove('hidden');
        loadAnalyticsData(selectedId);
    });
}

// Load and display analytics data
function loadAnalyticsData(uploadId) {
    // FIXED PATH: Applied absolute project endpoint mapping path here
    fetch('/ai-business-analytics-system/backend/api/dashboard.php?upload_id=' + uploadId)
        .then(response => response.json())
        .then(data => populateAnalytics(data))
        .catch(error => {
            console.error('Error loading analytics:', error);
            document.getElementById('uploadStatus').className = 'status-message error';
            document.getElementById('uploadStatus').textContent = 'Error loading analytics data';
        });
}

// Populate analytics UI with data
function populateAnalytics(data) {
    const activeCurrency = data.currency || "USD";

    document.getElementById('totalRevenue').textContent = formatCurrency(data.total_revenue, activeCurrency);
    document.getElementById('netProfit').textContent = formatCurrency(data.net_profit, activeCurrency);
    document.getElementById('profitMargin').textContent = data.profit_margin || '0%';
    document.getElementById('topProduct').textContent = data.top_product || 'N/A';

    try {
        const revenueTrendLabels = JSON.parse(data.revenue_trend_labels);
        const revenueTrendValues = JSON.parse(data.revenue_trend_data);
        const productLabels = JSON.parse(data.product_labels);
        const productValues = JSON.parse(data.product_data);

        renderRevenueChart(revenueTrendLabels, revenueTrendValues, activeCurrency);
        renderProductChart(productLabels, productValues, activeCurrency);
    } catch (error) {
        console.error('Error parsing chart data:', error);
    }

    try {
        const alerts = JSON.parse(data.alerts);
        const recommendations = JSON.parse(data.recommendations);
        
        displayAlerts(alerts);
        displayRecommendations(recommendations);
    } catch (error) {
        console.error('Error parsing insights:', error);
    }

    document.getElementById('modelR2').textContent = (parseFloat(data.model_r2) * 100).toFixed(2) + '%';
    document.getElementById('classifierAccuracy').textContent = (parseFloat(data.classifier_accuracy) * 100).toFixed(2) + '%';
    document.getElementById('selectedModel').textContent = data.selected_model || 'N/A';
}

function renderRevenueChart(labels, data, currencyCode) {
    const ctx = document.getElementById('revenueTrendChart').getContext('2d');
    if (revenueTrendChart) revenueTrendChart.destroy();

    revenueTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `Revenue Timeline (${currencyCode.toUpperCase()})`,
                data: data,
                borderColor: '#0066cc',
                backgroundColor: 'rgba(0, 102, 204, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            scales: { 
                y: { 
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value, currencyCode);
                        }
                    }
                } 
            }
        }
    });
}

function renderProductChart(labels, data, currencyCode) {
    const ctx = document.getElementById('productPerformanceChart').getContext('2d');
    if (productPerformanceChart) productPerformanceChart.destroy();

    productPerformanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: `Product Revenue Performance (${currencyCode.toUpperCase()})`,
                data: data,
                backgroundColor: '#0066cc'
            }]
        },
        options: { 
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value, currencyCode);
                        }
                    }
                }
            }
        }
    });
}

function displayAlerts(alerts) {
    const list = document.getElementById('risksList');
    list.innerHTML = '';
    if (Array.isArray(alerts) && alerts.length > 0) {
        alerts.forEach(alert => {
            const li = document.createElement('li');
            li.textContent = alert;
            list.appendChild(li);
        });
    } else {
        list.innerHTML = '<li>No critical risks identified</li>';
    }
}

function displayRecommendations(recommendations) {
    const list = document.getElementById('recommendationsList');
    list.innerHTML = '';
    if (Array.isArray(recommendations) && recommendations.length > 0) {
        recommendations.forEach(rec => {
            const li = document.createElement('li');
            li.textContent = rec;
            list.appendChild(li);
        });
    } else {
        list.innerHTML = '<li>Check back after data analysis</li>';
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