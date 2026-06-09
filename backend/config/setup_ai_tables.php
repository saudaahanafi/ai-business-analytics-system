<?php
// Configuration matching your stable database
$host = "localhost";
$user = "root";
$password = "";
$database = "business_analytics_db";

$conn = new mysqli($host, $user, $password, $database);

if ($conn->connect_error) {
    die("<span style='color:red; font-weight:bold;'>Database connection failed: " . $conn->connect_error . "</span>");
}

echo "<h3>Connected to stable database: <u>$database</u></h3>";

// These SQL blocks are built to match your write_to_database() parameters EXACTLY
$ai_tables = [
    // 1. The parent uploads tracking table
    "uploads" => "CREATE TABLE IF NOT EXISTS `uploads` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `user_id` INT NOT NULL,
        `company_name` VARCHAR(255) NOT NULL,
        `saved_file_path` VARCHAR(255) NOT NULL,
        `is_sample` TINYINT DEFAULT 0,
        `status` ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
        `uploaded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;",

    // 2. Main KPI and Chart visual tables (Matches Step 9 part 1)
    "sales_analytics" => "CREATE TABLE IF NOT EXISTS `sales_analytics` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `upload_id` INT NOT NULL,
        `total_revenue` DECIMAL(15,2) NOT NULL,
        `net_profit` DECIMAL(15,2) NOT NULL,
        `profit_margin` VARCHAR(50) NOT NULL,
        `roi` VARCHAR(50) NOT NULL,
        `top_product` VARCHAR(255) NOT NULL,
        `revenue_trend_labels` TEXT NOT NULL,
        `revenue_trend_data` TEXT NOT NULL,
        `product_labels` TEXT NOT NULL,
        `product_data` TEXT NOT NULL,
        `industry` VARCHAR(100) NOT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY `unique_upload` (`upload_id`),
        FOREIGN KEY (`upload_id`) REFERENCES `uploads`(`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB;",

    // 3. AI Insights, Warnings and Metrics table (Matches Step 9 part 2)
    "ai_predictions_results" => "CREATE TABLE IF NOT EXISTS `ai_predictions_results` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `upload_id` INT NOT NULL,
        `alerts` TEXT NOT NULL,
        `recommendations` TEXT NOT NULL,
        `model_r2` DECIMAL(6,4) NOT NULL,
        `model_mae` DECIMAL(15,4) NOT NULL,
        `classifier_accuracy` DECIMAL(6,4) NOT NULL,
        `selected_model` VARCHAR(100) NOT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY `unique_ai_upload` (`upload_id`),
        FOREIGN KEY (`upload_id`) REFERENCES `uploads`(`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB;"
];

// Loop through and create the required structure
foreach ($ai_tables as $name => $sql) {
    if ($conn->query($sql) === TRUE) {
        echo "✅ Table check passed: <strong>$name</strong> table ready.<br>";
    } else {
        echo "<span style='color:red;'>❌ Error checking table $name: " . $conn->error . "</span><br>";
    }
}

echo "<br>";

// Seed test files IDs (1 and 2) so your command prompt tests don't crash on constraints
$check_seeds = $conn->query("SELECT id FROM `uploads` WHERE id IN (1, 2)");
if ($check_seeds->num_rows == 0) {
    $seed_sql = "INSERT INTO `uploads` (`id`, `user_id`, `company_name`, `saved_file_path`, `is_sample`, `status`) 
                 VALUES 
                 (1, 1, 'Moroccan Secrets', 'backend/dataset/moroccan_secrets_dataset (2).csv', 1, 'processing'),
                 (2, 1, 'Marwa Clothing', 'backend/dataset/marwa_dataset (1).csv', 1, 'processing');";
                  
    if ($conn->query($seed_sql) === TRUE) {
        echo "<span style='color:green; font-weight:bold;'>🎉 Mock entries seeded! IDs 1 & 2 are mapped for local terminal execution.</span><br>";
    } else {
        echo "<span style='color:red;'>⚠️ Error seeding mock rows: " . $conn->error . "</span><br>";
    }
} else {
    echo "ℹ️ Mock upload reference tags are already up and running.<br>";
}

echo "<br><span style='color:blue; font-weight:bold;'>Perfect match! Database layout successfully configured to align with run_inference.py.</span>";

$conn->close();
?>