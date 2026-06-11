<?php
if (ob_get_length()) ob_clean();
header('Content-Type: application/json');

// Step out of api/ to find backend/config/database.php
include dirname(__DIR__) . '/config/database.php';

// Action A: Fetch completed samples for dropdown
if (isset($_GET['fetch_samples']) && $_GET['fetch_samples'] === 'true') {
    try {
        $query = "SELECT id, company_name FROM uploads WHERE status = 'completed' AND id IN (1, 2) ORDER BY id DESC";
        $stmt = $pdo->query($query);
        $rows = $stmt->fetchAll();
        
        $samples = [];
        foreach ($rows as $row) {
            $samples[] = [
                'id' => intval($row['id']),
                'company_name' => $row['company_name']
            ];
        }
        echo json_encode($samples);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

// Action B: Fetch analytics report by upload_id
if (isset($_GET['upload_id'])) {
    $upload_id = intval($_GET['upload_id']);
    
    // FIXED: Added sa.currency to select string array list
    $query = "
        SELECT 
            u.id, u.user_id, u.company_name, u.uploaded_at,
            sa.total_revenue, sa.net_profit, sa.profit_margin, sa.roi, sa.currency, 
            sa.top_product, sa.revenue_trend_labels, sa.revenue_trend_data,
            sa.product_labels, sa.product_data, sa.industry,
            ar.alerts, ar.recommendations, ar.model_r2, ar.classifier_accuracy, ar.selected_model
        FROM uploads u
        INNER JOIN sales_analytics sa ON u.id = sa.upload_id
        INNER JOIN ai_predictions_results ar ON u.id = ar.upload_id
        WHERE u.id = :upload_id
    ";
    
    try {
        $stmt = $pdo->prepare($query);
        $stmt->execute(['upload_id' => $upload_id]);
        $data = $stmt->fetch();
        
        if ($data) {
            echo json_encode($data);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Report not found']);
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

// Action C: Handle file upload and sequential automated ML process stream
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['csv_file'])) {
    $company_name = isset($_POST['company_name']) ? trim($_POST['company_name']) : 'Unknown';
    $csv_file = $_FILES['csv_file'];
    
    if ($csv_file['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['error' => 'File upload failed']);
        exit;
    }
    
    // Testing Identity (Swap with session data later)
    $user_id = 1; 
    $status = 'pending';
    $uploaded_at = date('Y-m-d H:i:s');
    
    $insert_query = "
        INSERT INTO uploads (user_id, company_name, status, uploaded_at)
        VALUES (:user_id, :company_name, :status, :uploaded_at)
    ";
    
    try {
        $stmt = $pdo->prepare($insert_query);
        $stmt->execute([
            'user_id' => $user_id,
            'company_name' => $company_name,
            'status' => $status,
            'uploaded_at' => $uploaded_at
        ]);
        $upload_id = $pdo->lastInsertId();
        
        // Target paths aligned with backend root directory tree layout
        $dataset_dir = dirname(__DIR__) . '/dataset';
        if (!is_dir($dataset_dir)) {
            mkdir($dataset_dir, 0755, true);
        }
        
        $filename = 'upload_' . $upload_id . '_' . time() . '.csv';
        $saved_file_path = $dataset_dir . '/' . $filename;
        
       if (move_uploaded_file($csv_file['tmp_name'], $saved_file_path)) {
            $update_query = "UPDATE uploads SET saved_file_path = :saved_file_path WHERE id = :id";
            $update_stmt = $pdo->prepare($update_query);
            $update_stmt->execute(['saved_file_path' => $saved_file_path, 'id' => $upload_id]);
            
            // ── PROCESS A: TRIGGER CUSTOM DYNAMIC RE-TRAINING ──
            $train_script = dirname(__DIR__) . '/model/train_model.py';
            $train_cmd = "py \"" . $train_script . "\" \"" . $saved_file_path . "\" \"" . $user_id . "\" 2>&1";
            exec($train_cmd, $train_output, $train_return);

            // ── PROCESS B: EXECUTE LIVE KPI & FORECASTING INFERENCE ──
            $python_script = dirname(__DIR__) . '/ai/run_inference.py';
            $inference_cmd = "py \"" . $python_script . "\" \"" . $saved_file_path . "\" \"" . $upload_id . "\" \"" . $user_id . "\" 2>&1";
            exec($inference_cmd, $inf_output, $inf_return);

            // Clear any previous output buffer content
            if (ob_get_length()) ob_clean();

            // Check if BOTH were successful
            if ($train_return === 0 && $inf_return === 0) {
                echo json_encode(['success' => true, 'upload_id' => $upload_id]);
            } else {
                http_response_code(400); 
                $error_msg = !empty($inf_output) ? end($inf_output) : "Data processing failed.";
                echo json_encode(['error' => $error_msg]);
            }
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to save file']);
        }

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

http_response_code(400);
echo json_encode(['error' => 'Invalid request']);
?>