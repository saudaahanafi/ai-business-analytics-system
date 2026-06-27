<?php
// =============================================================
// backend/api/payment.php
// AI Business Analytics System — Subscription Activation
// =============================================================

session_start();

require_once dirname(__DIR__) . '/config/database.php';

header('Content-Type: application/json');

// ── GATEKEEPER: Only authenticated users may activate a subscription ──
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'message' => 'Authentication required. Please log in first.'
    ]);
    exit;
}

// ── Method check ───────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed.'
    ]);
    exit;
}

// ── Parse request body ─────────────────────────────────────────────────────
$input = file_get_contents('php://input');
$data  = json_decode($input, true);

if (!$data || !is_array($data)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid request payload.'
    ]);
    exit;
}

// ── Validate payment token ─────────────────────────────────────────────────
// PRODUCTION NOTE:
// Send this token to your payment gateway (Stripe, PayPal etc.) via their
// server-to-server API. Verify the charge succeeded AND that the amount
// matches the expected price for the chosen plan before updating the DB.
// Never trust the frontend to tell you the price.
$payment_token = isset($data['payment_token']) ? trim($data['payment_token']) : '';

if (empty($payment_token)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Payment token is missing.'
    ]);
    exit;
}

// ── Validate plan — price & expiry resolved server-side ───────────────────
// The price is NEVER sent from the frontend. The backend owns the source of
// truth for pricing, preventing users from manipulating the charged amount.
$allowed_plans = [
    'monthly' => [
        'price'  => 10.00,
        'label'  => 'Monthly',
        'expiry' => '+1 month',
    ],
    'annual'  => [
        'price'  => 99.00,
        'label'  => 'Annual',
        'expiry' => '+1 year',
    ],
];

$plan = isset($data['plan']) ? trim($data['plan']) : '';

if (!array_key_exists($plan, $allowed_plans)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid plan selected. Choose "monthly" or "annual".'
    ]);
    exit;
}

// ── Resolve expiry date ────────────────────────────────────────────────────
$user_id       = (int) $_SESSION['user_id'];
$expiry_date   = date('Y-m-d', strtotime($allowed_plans[$plan]['expiry']));
$plan_label    = $allowed_plans[$plan]['label'];

// ── Update subscription in database using prepared statement ───────────────
try {
    $stmt = $pdo->prepare("
        UPDATE users
        SET subscription_status = 'active',
            subscription_plan   = :plan,
            subscription_expiry = :expiry
        WHERE id = :user_id
    ");

    $stmt->execute([
        'plan'    => $plan,
        'expiry'  => $expiry_date,
        'user_id' => $user_id,
    ]);

    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'message' => 'User account not found.'
        ]);
        exit;
    }

    // Sync session immediately so the dashboard gatekeeper reflects the change
    // without requiring the user to log out and back in.
    $_SESSION['subscription_status'] = 'active';
    $_SESSION['subscription_plan']   = $plan;
    $_SESSION['subscription_expiry'] = $expiry_date;

    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => "{$plan_label} subscription activated successfully.",
        'plan'    => $plan,
        'expiry'  => $expiry_date,
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    error_log("Subscription activation error for user {$user_id}: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'message' => 'A server error occurred. Please try again.'
    ]);
}
?>