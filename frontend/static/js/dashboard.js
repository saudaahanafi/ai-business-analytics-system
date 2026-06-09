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
    fetch('../../backend/api/dashboard.php?fetch_samples=true')
        .then(response => response.json())
        .then(data => {
            const selector = document.getElementById('sampleSelector');
            
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
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
        }
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const fileName = e.target.files[0].name;
            console.log('File selected:', fileName);
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
    statusDiv.innerHTML = '<span class="spinner"></span> Processing your data...';

    fetch('../../backend/api/dashboard.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            statusDiv.className = 'status-message success';
            statusDiv.textContent = 'Upload successful! Redirecting...';
            
            setTimeout(() => {
                window.location.href = 'results.html?upload_id=' + data.upload_id;
            }, 1500);
        } else {
            throw new Error(data.error || 'Upload failed');
        }
    })
    .catch(error => {
        console.error('Upload error:', error);
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
    fetch('../../backend/api/dashboard.php?upload_id=' + uploadId)
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
    // Populate KPI cards
    document.getElementById('totalRevenue').textContent = formatCurrency(data.total_revenue);
    document.getElementById('netProfit').textContent = formatCurrency(data.net_profit);
    document.getElementById('profitMargin').textContent = (parseFloat(data.profit_margin) * 100).toFixed(2) + '%';
    document.getElementById('topProduct').textContent = data.top_product || 'N/A';

    // Parse and display charts
    try {
        const revenueTrendLabels = JSON.parse(data.revenue_trend_labels);
        const revenueTrendValues = JSON.parse(data.revenue_trend_data);
        const productLabels = JSON.parse(data.product_labels);
        const productValues = JSON.parse(data.product_data);

        renderRevenueChart(revenueTrendLabels, revenueTrendValues);
        renderProductChart(productLabels, productValues);
    } catch (error) {
        console.error('Error parsing chart data:', error);
    }

    // Parse and display insights
    try {
        const alerts = JSON.parse(data.alerts);
        const recommendations = JSON.parse(data.recommendations);
        
        displayAlerts(alerts);
        displayRecommendations(recommendations);
    } catch (error) {
        console.error('Error parsing insights:', error);
    }

    // Display model diagnostics
    document.getElementById('modelR2').textContent = (parseFloat(data.model_r2) * 100).toFixed(2) + '%';
    document.getElementById('classifierAccuracy').textContent = (parseFloat(data.classifier_accuracy) * 100).toFixed(2) + '%';
    document.getElementById('selectedModel').textContent = data.selected_model || 'N/A';
}

// Render revenue trend chart
function renderRevenueChart(labels, data) {
    const ctx = document.getElementById('revenueTrendChart').getContext('2d');
    
    if (revenueTrendChart) {
        revenueTrendChart.destroy();
    }

    revenueTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Revenue',
                data: data,
                borderColor: '#0066cc',
                backgroundColor: 'rgba(0, 102, 204, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#0066cc',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

// Render product performance chart
function renderProductChart(labels, data) {
    const ctx = document.getElementById('productPerformanceChart').getContext('2d');
    
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
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Display alerts/risks
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
        const li = document.createElement('li');
        li.textContent = 'No critical risks identified';
        list.appendChild(li);
    }
}

// Display recommendations
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
        const li = document.createElement('li');
        li.textContent = 'Check back after data analysis';
        list.appendChild(li);
    }
}

// Helper function to format currency
function formatCurrency(value) {
    if (!value) return '$0.00';
    const num = parseFloat(value);
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}