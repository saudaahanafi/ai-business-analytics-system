<?php
// =============================================================
// backend/api/dashboard.php
// AI Business Analytics System — Dashboard API
// =============================================================

session_start();

header('Content-Type: application/json');

// ══════════════════════════════════════════════════════════════
//  FAIL-SECURE GATEKEEPER
//  Runs before any business logic. Three independent layers:
//  1. Session auth    — is the user logged in?
//  2. DB re-verify    — is the subscription truly active?
//  3. Expiry check    — has it lapsed since the session was set?
// ══════════════════════════════════════════════════════════════

// Layer 1: Authentication
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode([
        'error'    => 'Authentication required.',
        'redirect' => '/ai-business-analytics-system/login.html'
    ]);
    exit;
}

// Load DB — needed for Layer 2
require_once dirname(__DIR__) . '/config/database.php';

$user_id = (int) $_SESSION['user_id'];

// Layer 2: Re-read subscription directly from the database.
// We do NOT trust $_SESSION['subscription_status'] alone because the
// session could be stale (plan cancelled, expired on another device, etc.).
try {
    $sub_check = $pdo->prepare("
        SELECT subscription_status, subscription_plan, subscription_expiry
        FROM users
        WHERE id = :user_id
        LIMIT 1
    ");
    $sub_check->execute(['user_id' => $user_id]);
    $sub = $sub_check->fetch();

} catch (PDOException $e) {
    // Cannot verify — deny access (fail-secure: deny on uncertainty)
    error_log("Dashboard gatekeeper DB error for user {$user_id}: " . $e->getMessage());
    http_response_code(503);
    echo json_encode([
        'error' => 'Service temporarily unavailable. Please try again shortly.'
    ]);
    exit;
}

// Layer 3: Status + expiry validation
$is_active  = $sub && $sub['subscription_status'] === 'active';
$is_expired = $sub
    && !empty($sub['subscription_expiry'])
    && strtotime($sub['subscription_expiry']) < time();

if (!$is_active || $is_expired) {
    http_response_code(403);
    echo json_encode([
        'error'    => 'An active subscription is required to access the dashboard.',
        'redirect' => '/ai-business-analytics-system/payment.html'
    ]);
    exit;
}

// ── END GATEKEEPER ────────────────────────────────────────────
// All requests below this line are from authenticated, subscribed users.

if (ob_get_length()) ob_clean();

// ──────────────────────────────────────────────────────────────
// Action A: Fetch completed sample uploads for dropdown
// ──────────────────────────────────────────────────────────────
if (isset($_GET['fetch_samples']) && $_GET['fetch_samples'] === 'true') {
    try {
        $query = "
            SELECT id, company_name
            FROM uploads
            WHERE status = 'completed'
              AND id IN (1, 2)
            ORDER BY id DESC
        ";
        $stmt = $pdo->query($query);
        $rows = $stmt->fetchAll();

        $samples = [];
        foreach ($rows as $row) {
            $samples[] = [
                'id'           => intval($row['id']),
                'company_name' => $row['company_name'],
            ];
        }

        echo json_encode($samples);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

// ──────────────────────────────────────────────────────────────
// Action B: Fetch analytics report by upload_id
// ──────────────────────────────────────────────────────────────
if (isset($_GET['upload_id'])) {
    $upload_id = intval($_GET['upload_id']);

    $query = "
        SELECT
            u.id, u.user_id, u.company_name, u.uploaded_at,
            sa.total_revenue, sa.net_profit, sa.profit_margin, sa.roi, sa.currency,
            sa.top_product, sa.revenue_trend_labels, sa.revenue_trend_data,
            sa.product_labels, sa.product_data, sa.industry,
            ar.alerts, ar.recommendations, ar.model_r2, ar.classifier_accuracy, ar.selected_model
        FROM uploads u
        INNER JOIN sales_analytics sa      ON u.id = sa.upload_id
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
            echo json_encode(['error' => 'Report not found.']);
        }

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

// ──────────────────────────────────────────────────────────────
// Action C: Handle CSV file upload and trigger ML pipeline
// ──────────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['csv_file'])) {

    $company_name = isset($_POST['company_name']) ? trim($_POST['company_name']) : 'Unknown';
    $csv_file     = $_FILES['csv_file'];

    if ($csv_file['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['error' => 'File upload failed.']);
        exit;
    }

    $status      = 'pending';
    $uploaded_at = date('Y-m-d H:i:s');

    $insert_query = "
        INSERT INTO uploads (user_id, company_name, status, uploaded_at)
        VALUES (:user_id, :company_name, :status, :uploaded_at)
    ";

    try {
        $stmt = $pdo->prepare($insert_query);
        $stmt->execute([
            'user_id'      => $user_id,
            'company_name' => $company_name,
            'status'       => $status,
            'uploaded_at'  => $uploaded_at,
        ]);
        $upload_id = $pdo->lastInsertId();

        // Ensure dataset directory exists
        $dataset_dir = dirname(__DIR__) . '/dataset';
        if (!is_dir($dataset_dir)) {
            mkdir($dataset_dir, 0755, true);
        }

        $filename        = 'upload_' . $upload_id . '_' . time() . '.csv';
        $saved_file_path = $dataset_dir . '/' . $filename;

        if (move_uploaded_file($csv_file['tmp_name'], $saved_file_path)) {

            // Persist the saved file path
            $update_stmt = $pdo->prepare(
                "UPDATE uploads SET saved_file_path = :saved_file_path WHERE id = :id"
            );
            $update_stmt->execute([
                'saved_file_path' => $saved_file_path,
                'id'              => $upload_id,
            ]);

            // ── PROCESS A: Custom dynamic re-training ─────────────
            $train_script = dirname(__DIR__) . '/model/train_model.py';
            $train_cmd    = "py \"" . $train_script . "\" \"" . $saved_file_path . "\" \"" . $user_id . "\" 2>&1";
            exec($train_cmd, $train_output, $train_return);

            // ── PROCESS B: Live KPI & forecasting inference ────────
            $python_script = dirname(__DIR__) . '/ai/run_inference.py';
            $inference_cmd = "py \"" . $python_script . "\" \"" . $saved_file_path . "\" \"" . $upload_id . "\" \"" . $user_id . "\" 2>&1";
            exec($inference_cmd, $inf_output, $inf_return);

            if (ob_get_length()) ob_clean();

            if ($train_return === 0 && $inf_return === 0) {
                echo json_encode([
                    'success'   => true,
                    'upload_id' => $upload_id,
                ]);
            } else {
                http_response_code(400);
                $error_msg = !empty($inf_output) ? end($inf_output) : 'Data processing failed.';
                echo json_encode(['error' => $error_msg]);
            }

        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to save uploaded file.']);
        }

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

// ── Catch-all for unrecognised requests ───────────────────────
http_response_code(400);
echo json_encode(['error' => 'Invalid request.']);
?>   