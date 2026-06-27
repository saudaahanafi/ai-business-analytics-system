<?php
// =============================================================
// backend/api/login.php
// AI Business Analytics System — User Login with subscription gate
// =============================================================

session_start();

require_once dirname(__DIR__) . '/config/database.php';

header('Content-Type: application/json');

// ── Method check ───────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed'
    ]);
    exit;
}

// ── Parse JSON body ────────────────────────────────────────────
$input = file_get_contents('php://input');
$data  = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid request payload'
    ]);
    exit;
}

$email    = isset($data['email'])    ? trim($data['email'])    : '';
$password = isset($data['password']) ? $data['password']       : '';

if (empty($email) || empty($password)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Email and password are required'
    ]);
    exit;
}

// ── Database lookup ────────────────────────────────────────────
try {
    $select_user = $pdo->prepare("
        SELECT id, fullname, email, password,
               company_name, business_sector,
               subscription_status, subscription_plan, subscription_expiry
        FROM users
        WHERE email = ?
        LIMIT 1
    ");
    $select_user->execute([$email]);

    if ($select_user->rowCount() === 0) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'message' => 'Invalid email or password'
        ]);
        exit;
    }

    $user = $select_user->fetch();

    // ── Verify password ──────────────────────────────────────────
    if (!password_verify($password, $user['password'])) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'message' => 'Invalid email or password'
        ]);
        exit;
    }

    // ── Populate session (always, so payment page can identify) ──
    $_SESSION['user_id']             = $user['id'];
    $_SESSION['fullname']            = $user['fullname'];
    $_SESSION['email']               = $user['email'];
    $_SESSION['company_name']        = $user['company_name'];
    $_SESSION['business_sector']     = $user['business_sector'];
    $_SESSION['subscription_status'] = $user['subscription_status'];
    $_SESSION['subscription_plan']   = $user['subscription_plan'];
    $_SESSION['subscription_expiry'] = $user['subscription_expiry'];

    // ── Check subscription ──────────────────────────────────────
    $is_active  = $user['subscription_status'] === 'active';
    $is_expired = !empty($user['subscription_expiry']) &&
                  strtotime($user['subscription_expiry']) < time();

    // Determine the reason for redirect (for payment page messaging)
    $status_reason = '';
    if (!$is_active) {
        $status_reason = 'inactive';
    } elseif ($is_expired) {
        $status_reason = 'expired';
    }

    // Build the redirect target
    if ($is_active && !$is_expired) {
        $redirect_target = '/ai-business-analytics-system/frontend/templates/dashboard.html';
    } else {
        $redirect_target = '/ai-business-analytics-system/payment.html?status=' . $status_reason;
    }

    // ── Success response ────────────────────────────────────────
    http_response_code(200);
    echo json_encode([
        'success'             => true,
        'message'             => 'Login successful',
        'user_id'             => $user['id'],
        'fullname'            => $user['fullname'],
        'email'               => $user['email'],
        'subscription_status' => $user['subscription_status'],
        'redirect'            => $redirect_target   // <-- frontend uses this
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    error_log("Login error: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'A server error occurred. Please try again.'
    ]);
}   