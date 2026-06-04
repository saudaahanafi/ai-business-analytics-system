<?php
require_once 'backend/config/database.php';

try {
    // 1. Create the table outside of a transaction block
    $create_table_sql = "
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            fullname VARCHAR(100) NOT NULL,
            email VARCHAR(150) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            company_name VARCHAR(100) NOT NULL,
            business_sector ENUM('Clothing/Retail', 'Skincare/Cosmetics') NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ";

    $pdo->exec($create_table_sql);

    // 2. Check if the admin account already exists
    $check_admin = $pdo->prepare("SELECT id FROM users WHERE email = ?");
    $check_admin->execute(['admin@analytics.com']);

    if ($check_admin->rowCount() === 0) {
        $admin_email = 'admin@analytics.com'; 
        $admin_fullname = 'Jamal Bukhari Olawunmi';
        $admin_company = 'System Sandbox Admin';
        $admin_sector = 'Skincare/Cosmetics';
        $admin_password = password_hash('admin@123', PASSWORD_BCRYPT);

        // Optional: Transactions can be used just for data insertion if you prefer, 
        // but for a single record insert, it's safe to run directly.
        $insert_admin = $pdo->prepare("
            INSERT INTO users (fullname, email, password, company_name, business_sector)
            VALUES (?, ?, ?, ?, ?)
        ");

        $insert_admin->execute([
            $admin_fullname,
            $admin_email,
            $admin_password,
            $admin_company,
            $admin_sector
        ]);

        echo "Database initialized successfully. Admin account created.<br>";
        echo "Email: admin@analytics.com<br>";
        echo "Password: admin@123<br>";
    } else {
        echo "Database already initialized. Admin account exists.<br>";
    }

} catch (Exception $e) {
    // No $pdo->rollBack() needed here since we removed beginTransaction()
    die("Initialization failed: " . $e->getMessage());
}
?>