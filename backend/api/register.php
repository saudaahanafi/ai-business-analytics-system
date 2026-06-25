<?php
session_start();

require_once '../config/database.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Method not allowed'
    ]);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid request payload'
    ]);
    exit;
}

$fullname = isset($data['fullname']) ? trim($data['fullname']) : '';
$email = isset($data['email']) ? trim($data['email']) : '';
$password = isset($data['password']) ? $data['password'] : '';
$company_name = isset($data['company_name']) ? trim($data['company_name']) : '';
$business_sector = isset($data['business_sector']) ? trim($data['business_sector']) : '';

if (empty($fullname)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Full name is required'
    ]);
    exit;
}

if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Valid email is required'
    ]);
    exit;
}

if (empty($password) || strlen($password) < 6) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Password must be at least 6 characters'
    ]);
    exit;
}

if (empty($company_name)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Company name is required'
    ]);
    exit;
}

// Old validation (REMOVE THIS):
// if (empty($business_sector) || !in_array($business_sector, ['Clothing/Retail', 'Skincare/Cosmetics'])) { ... }

// New validation (USE THIS):
if (empty($business_sector)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Business sector is required'
    ]);
    exit;
}

try {
    $check_email = $pdo->prepare("SELECT id FROM users WHERE email = ?");
    $check_email->execute([$email]);

    if ($check_email->rowCount() > 0) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'Email already registered'
        ]);
        exit;
    }

    $hashed_password = password_hash($password, PASSWORD_BCRYPT);

    $insert_user = $pdo->prepare("
        INSERT INTO users (fullname, email, password, company_name, business_sector)
        VALUES (?, ?, ?, ?, ?)
    ");

    $insert_user->execute([
        $fullname,
        $email,
        $hashed_password,
        $company_name,
        $business_sector
    ]);

    $user_id = $pdo->lastInsertId();

    $_SESSION['user_id'] = $user_id;
    $_SESSION['fullname'] = $fullname;
    $_SESSION['email'] = $email;
    $_SESSION['company_name'] = $company_name;
    $_SESSION['business_sector'] = $business_sector;

    http_response_code(201);
    echo json_encode([
        'success' => true,
        'message' => 'Account created successfully',
        'user_id' => $user_id
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database error occurred'
    ]);
    error_log("Registration error: " . $e->getMessage());
}
?>