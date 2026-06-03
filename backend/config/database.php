<?php
// backend/config/database.php

$host = 'localhost';
$db_name = 'business_analytics_db';
$username = 'root'; // Default XAMPP MySQL user
$password = '';     // Default XAMPP MySQL password

try {
    // Connect directly to our specific project database
    $pdo = new PDO("mysql:host=$host;dbname=$db_name;charset=utf8mb4", $username, $password);
    
    // Throw exceptions if SQL errors happen so we can debug them instantly
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    
} catch (PDOException $e) {
    // If the connection fails, send a structured JSON error response to your frontend JavaScript
    header('Content-Type: application/json');
    echo json_encode([
        "status" => "error",
        "message" => "Database connection failure: " . $e->getMessage()
    ]);
    exit();
}
?>