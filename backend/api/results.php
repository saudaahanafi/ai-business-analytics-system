<?php
header('Content-Type: application/json');

// Include database connection - dynamically steps out of backend/api/ and looks in backend/config/
include dirname(__DIR__) . '/config/database.php';

// Handle results query by upload_id
if (isset($_GET['upload_id'])) {
    $upload_id = intval($_GET['upload_id']);
    
    // SQL query using the clean PDO named placeholder (:upload_id)
    $query = "
        SELECT 
            u.id, u.user_id, u.company_name, u.uploaded_at, u.saved_file_path,
            sa.total_revenue, sa.net_profit, sa.profit_margin, sa.roi, 
            sa.top_product, sa.revenue_trend_labels, sa.revenue_trend_data,
            sa.product_labels, sa.product_data, sa.industry,
            ar.alerts, ar.recommendations, ar.model_r2, ar.classifier_accuracy, ar.selected_model
        FROM uploads u
        INNER JOIN sales_analytics sa ON u.id = sa.upload_id
        INNER JOIN ai_predictions_results ar ON u.id = ar.upload_id
        WHERE u.id = :upload_id
    ";
    
    try {
        // Swapped out $conn->prepare() for your PDO instance $pdo->prepare()
        $stmt = $pdo->prepare($query);
        
        // Execute with the bound named parameter array
        $stmt->execute(['upload_id' => $upload_id]);
        
        // Fetch the associated data row
        $data = $stmt->fetch();
        
        if ($data) {
            echo json_encode($data);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Analytics report not found for the specified upload ID']);
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    
} else {
    http_response_code(400);
    echo json_encode(['error' => 'Missing required parameter: upload_id']);
}

// Note: You do not need explicit connection close statements (like $conn->close()) with PDO. 
// PHP automatically destroys the connection object cleanly when the script finishes executing!
?>