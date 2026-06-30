<?php
// =============================================================
// forgot_password.php
// FIX 1: vendor/autoload.php path corrected to dirname(__DIR__)
//         which is one level up — the project root where composer
//         installs packages (same level as /config and /vendor).
// FIX 2: ob_start() buffers any accidental output (whitespace,
//         BOM, notices) so the JSON response stays clean.
// FIX 3: Fatal errors caught by a custom handler so PHP never
//         outputs an HTML error page that breaks .json() parsing.
// =============================================================

ob_start(); // Buffer ALL output — nothing must leak before our JSON

// ── Error handler: catch fatal PHP errors and return clean JSON ──
set_error_handler(function($errno, $errstr) {
    ob_clean();
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'PHP Error: ' . $errstr]);
    exit;
});

// ── Paths ────────────────────────────────────────────────────────
// File lives at:  /project-root/frontend/templates/forgot_password.php
// config lives at: /project-root/config/database.php
// vendor lives at: /project-root/vendor/autoload.php
// dirname(__DIR__) = one level up from /frontend/templates/ = /project-root/frontend
// dirname(__DIR__) . '/..' = project root  ← safest cross-platform way

$projectRoot = realpath(dirname(__DIR__) . '/..');

require_once dirname(__DIR__) . '/config/database.php';
require_once $projectRoot . '/vendor/autoload.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as MailException;

// ── Only handle POST ─────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    ob_clean();                                // discard any whitespace buffered so far
    header('Content-Type: application/json');

    try {
        $raw   = file_get_contents('php://input');
        $input = json_decode($raw, true);

        if (json_last_error() !== JSON_ERROR_NONE || !is_array($input)) {
            throw new Exception('Invalid request payload.');
        }

        $email = isset($input['email']) ? trim(strtolower($input['email'])) : '';

        if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new Exception('Please enter a valid email address.');
        }

        $pdo  = getDBConnection();
        $stmt = $pdo->prepare("SELECT id, fullname, email FROM users WHERE email = ? LIMIT 1");
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        // Always return success — prevents email enumeration
        if (!$user) {
            echo json_encode(['success' => true, 'message' => 'If that email exists in our system, a reset link has been sent.']);
            exit;
        }

        // Rate limit: max 3 requests per hour
        $rateStmt = $pdo->prepare("
            SELECT COUNT(*) FROM password_resets
            WHERE email = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
        ");
        $rateStmt->execute([$email]);
        if ((int)$rateStmt->fetchColumn() >= 3) {
            throw new Exception('Too many reset requests. Please wait an hour before trying again.');
        }

        // Generate token
        $token     = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $token);
        $expiresAt = date('Y-m-d H:i:s', strtotime('+1 hour'));

        // Invalidate old tokens for this email
        $pdo->prepare("DELETE FROM password_resets WHERE email = ?")->execute([$email]);

        // Insert new token
        $pdo->prepare("
            INSERT INTO password_resets (email, token, expires_at, created_at)
            VALUES (?, ?, ?, NOW())
        ")->execute([$email, $tokenHash, $expiresAt]);

        // Build reset URL
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host     = $_SERVER['HTTP_HOST'];
        $resetUrl = $protocol . '://' . $host
                  . '/ai-business-analytics-system/backend/api/reset_password.php'  
                  . '?token=' . $token
                  . '&email=' . urlencode($email);

        // Send via PHPMailer + Mailtrap
        $mail = new PHPMailer(true);
        $mail->isSMTP();
        $mail->Host       = 'sandbox.smtp.mailtrap.io';
        $mail->SMTPAuth   = true;
        $mail->Username   = 'a46de2f877536b';
        $mail->Password   = '9224867579e47c';
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = 2525;

        $mail->setFrom('no-reply@analytiq.com', 'ANALYTIQ');
        $mail->addAddress($user['email'], $user['fullname']);
        $mail->isHTML(true);
        $mail->Subject = 'Reset Your ANALYTIQ Password';

        $firstName = explode(' ', $user['fullname'])[0];
        $mail->Body = "
        <div style='font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;'>
            <div style='background:linear-gradient(135deg,#0c4a6e,#0369a1,#0ea5e9);padding:32px;text-align:center;border-radius:12px 12px 0 0;'>
                <h1 style='color:#fff;font-size:1.2rem;margin:0;'>⬡ ANALYTIQ</h1>
                <p style='color:#bae6fd;font-size:0.8rem;margin:4px 0 0;'>AI-Powered Business Intelligence</p>
            </div>
            <div style='background:#fff;padding:36px;border:1px solid #e2e8f0;border-top:none;'>
                <p style='font-size:1rem;font-weight:600;color:#0f172a;'>Hi {$firstName},</p>
                <p style='color:#475569;line-height:1.7;'>We received a request to reset the password for your account associated with <strong>{$email}</strong>.</p>
                <p style='color:#475569;line-height:1.7;'>Click the button below — this link expires in <strong>1 hour</strong>.</p>
                <div style='text-align:center;margin:28px 0;'>
                    <a href='{$resetUrl}' style='background:linear-gradient(135deg,#0ea5e9,#0369a1);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;display:inline-block;'>
                        Reset My Password
                    </a>
                </div>
                <p style='font-size:0.78rem;color:#94a3b8;'>If you didn't request this, ignore this email — your password won't change.</p>
                <p style='font-size:0.72rem;color:#94a3b8;word-break:break-all;margin-top:12px;'>Or copy this URL: {$resetUrl}</p>
            </div>
            <div style='background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:16px;text-align:center;font-size:0.72rem;color:#94a3b8;'>
                © 2025 ANALYTIQ · Automated message — do not reply.
            </div>
        </div>";

        $mail->AltBody = "Hi {$firstName},\n\nReset your password: {$resetUrl}\n\nExpires in 1 hour. If you didn't request this, ignore this email.";

        $mail->send();

        echo json_encode(['success' => true, 'message' => 'A reset link has been sent to your inbox.']);

    } catch (MailException $e) {
        // PHPMailer-specific error
        error_log('Mailer error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Mail error: ' . $mail->ErrorInfo]);

    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }

    exit;
}

// ── GET request — serve the HTML page ────────────────────────────
ob_end_flush();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Forgot Password — AnalyticsGateway</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root {
    --sky-50:#f0f9ff;--sky-100:#e0f2fe;--sky-200:#bae6fd;--sky-300:#7dd3fc;
    --sky-400:#38bdf8;--sky-500:#0ea5e9;--sky-600:#0284c7;--sky-700:#0369a1;--sky-900:#0c4a6e;
    --white:#ffffff;
    --gray-50:#f8fafc;--gray-100:#f1f5f9;--gray-200:#e2e8f0;--gray-300:#cbd5e1;
    --gray-400:#94a3b8;--gray-500:#64748b;--gray-600:#475569;--gray-700:#334155;
    --gray-800:#1e293b;--gray-900:#0f172a;
    --success:#10b981;--danger:#ef4444;
    --radius-sm:8px;--radius-md:12px;--radius-lg:20px;
    --shadow-lg:0 12px 40px rgba(14,165,233,0.15),0 4px 12px rgba(0,0,0,0.08);
    --transition:0.2s ease;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html{height:100%;scroll-behavior:smooth;}
body{font-family:'Inter',system-ui,sans-serif;background:var(--gray-50);color:var(--gray-800);min-height:100vh;display:flex;flex-direction:column;overflow-x:hidden;}

/* Navbar */
.navbar{position:sticky;top:0;z-index:100;background:rgba(255,255,255,0.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--gray-200);}
.nav-inner{max-width:1180px;margin:0 auto;padding:0 24px;height:64px;display:flex;align-items:center;justify-content:space-between;}
.nav-brand{display:flex;align-items:center;gap:10px;text-decoration:none;}
.nav-logo svg{width:32px;height:32px;}
.nav-title{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:1.1rem;color:var(--gray-900);}
.btn-nav-signin{font-size:0.875rem;font-weight:600;color:var(--sky-600);text-decoration:none;padding:7px 18px;border-radius:var(--radius-sm);border:1.5px solid var(--sky-200);transition:all var(--transition);}
.btn-nav-signin:hover{background:var(--sky-50);border-color:var(--sky-400);}

/* Layout */
.page-layout{display:flex;flex:1;min-height:calc(100vh - 64px);}

/* Left panel */
.left-panel{width:44%;flex-shrink:0;background:linear-gradient(135deg,var(--sky-900) 0%,var(--sky-700) 55%,var(--sky-500) 100%);position:relative;overflow:hidden;display:flex;align-items:center;}
.left-panel-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.04) 1px,transparent 1px);background-size:48px 48px;}
.left-orb{position:absolute;border-radius:50%;filter:blur(70px);opacity:0.25;}
.left-orb-1{width:380px;height:380px;background:radial-gradient(circle,#38bdf8,transparent);top:-80px;right:-60px;}
.left-orb-2{width:260px;height:260px;background:radial-gradient(circle,#0284c7,transparent);bottom:-60px;left:20px;}
.left-panel-inner{position:relative;z-index:2;padding:56px 48px;}
.panel-eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:0.72rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--sky-200);margin-bottom:22px;}
.eyebrow-dot{width:7px;height:7px;background:var(--sky-300);border-radius:50%;animation:pulse-dot 2s ease-in-out infinite;}
@keyframes pulse-dot{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.5;transform:scale(1.4);}}
.panel-headline{font-family:'Space Grotesk',sans-serif;font-size:clamp(1.8rem,2.5vw,2.5rem);font-weight:800;letter-spacing:-0.04em;line-height:1.1;color:var(--white);margin-bottom:16px;}
.panel-headline-accent{background:linear-gradient(90deg,#7dd3fc,#38bdf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.panel-sub{font-size:0.92rem;color:var(--sky-100);line-height:1.7;margin-bottom:36px;max-width:340px;}
.panel-steps{display:flex;flex-direction:column;gap:18px;margin-bottom:32px;}
.panel-step{display:flex;align-items:flex-start;gap:14px;}
.step-num{width:30px;height:30px;flex-shrink:0;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk',sans-serif;font-size:0.8rem;font-weight:800;color:var(--white);}
.step-title{font-family:'Space Grotesk',sans-serif;font-size:0.875rem;font-weight:700;color:var(--white);margin-bottom:2px;}
.step-desc{font-size:0.78rem;color:var(--sky-200);line-height:1.5;}
.panel-secure{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);border-radius:var(--radius-md);padding:16px 18px;}
.panel-secure-icon{width:36px;height:36px;flex-shrink:0;background:rgba(255,255,255,0.12);border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;}
.panel-secure-icon svg{width:18px;height:18px;stroke:#86efac;}
.panel-secure-text{font-size:0.78rem;color:var(--sky-200);line-height:1.55;}
.panel-secure-text strong{color:var(--white);}

/* Right panel */
.right-panel{flex:1;display:flex;align-items:center;justify-content:center;padding:40px 24px;background:var(--gray-50);}

/* Form card */
.form-card{width:100%;max-width:440px;background:var(--white);border:1px solid var(--gray-200);border-radius:var(--radius-lg);padding:44px 40px;box-shadow:var(--shadow-lg);}
.form-card-header{text-align:center;margin-bottom:32px;}
.form-icon-wrap{width:52px;height:52px;background:var(--sky-50);border:1.5px solid var(--sky-200);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;margin:0 auto 18px;}
.form-icon-wrap svg{width:24px;height:24px;stroke:var(--sky-500);}
.form-title{font-family:'Space Grotesk',sans-serif;font-size:1.5rem;font-weight:800;color:var(--gray-900);letter-spacing:-0.02em;margin-bottom:6px;}
.form-subtitle{font-size:0.875rem;color:var(--gray-400);line-height:1.5;}

/* Debug box — only visible when there's a server-side error message */
.debug-box{background:#fef3c7;border:1px solid #fcd34d;border-radius:var(--radius-sm);padding:12px 14px;font-size:0.78rem;color:#92400e;margin-bottom:16px;display:none;word-break:break-word;}

/* Form */
.form-group{margin-bottom:20px;}
.form-group label{display:block;font-size:0.82rem;font-weight:600;color:var(--gray-700);margin-bottom:7px;}
.input-wrap{position:relative;display:flex;align-items:center;}
.input-icon{position:absolute;left:13px;display:flex;align-items:center;pointer-events:none;z-index:1;}
.input-icon svg{stroke:var(--gray-400);}
.form-input{width:100%;padding:11px 14px 11px 38px;font-family:inherit;font-size:0.9rem;color:var(--gray-800);background:var(--gray-50);border:1.5px solid var(--gray-200);border-radius:var(--radius-sm);outline:none;transition:border-color var(--transition),background var(--transition),box-shadow var(--transition);}
.form-input::placeholder{color:var(--gray-300);}
.form-input:focus{background:var(--white);border-color:var(--sky-400);box-shadow:0 0 0 3px rgba(14,165,233,0.12);}
.form-input.input-valid{border-color:var(--success);background:#f0fdf4;}
.form-input.input-error{border-color:var(--danger);background:#fff5f5;}
.error-message{font-size:0.75rem;color:var(--danger);margin-top:5px;min-height:16px;font-weight:500;}

/* Button */
.btn-submit{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:13px 20px;background:linear-gradient(135deg,var(--sky-500),var(--sky-700));color:var(--white);font-family:'Space Grotesk',sans-serif;font-size:0.95rem;font-weight:700;border:none;border-radius:var(--radius-sm);cursor:pointer;transition:transform var(--transition),box-shadow var(--transition),opacity var(--transition);box-shadow:0 4px 16px rgba(14,165,233,0.30);margin-bottom:14px;margin-top:4px;}
.btn-submit:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(14,165,233,0.40);}
.btn-submit:active{transform:translateY(0);}
.btn-submit:disabled{opacity:0.65;cursor:not-allowed;transform:none;}
.spinner{animation:spin 0.8s linear infinite;}
.hidden{display:none!important;}
@keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
.form-secure-note{font-size:0.73rem;color:var(--gray-400);text-align:center;line-height:1.5;}
.form-footer{text-align:center;margin-top:24px;padding-top:20px;border-top:1px solid var(--gray-100);font-size:0.85rem;color:var(--gray-500);}
.form-footer a{color:var(--sky-600);font-weight:600;text-decoration:none;}
.form-footer a:hover{text-decoration:underline;}

/* Success state */
.success-state{display:none;}
.success-icon-wrap{width:72px;height:72px;background:#d1fae5;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;animation:pop-in 0.4s cubic-bezier(0.175,0.885,0.32,1.275) both;}
@keyframes pop-in{from{opacity:0;transform:scale(0.5);}to{opacity:1;transform:scale(1);}}
.success-icon-wrap svg{width:36px;height:36px;stroke:#059669;stroke-width:2.5;}
.success-card{text-align:center;}
.success-title{font-family:'Space Grotesk',sans-serif;font-size:1.4rem;font-weight:800;color:var(--gray-900);margin-bottom:10px;}
.success-text{font-size:0.875rem;color:var(--gray-500);line-height:1.7;margin-bottom:14px;}
.success-email-badge{display:inline-block;background:var(--sky-50);border:1px solid var(--sky-200);border-radius:999px;padding:6px 18px;font-size:0.85rem;font-weight:600;color:var(--sky-700);margin-bottom:20px;}
.success-checklist{list-style:none;text-align:left;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius-md);padding:16px 18px;display:flex;flex-direction:column;gap:8px;margin-bottom:24px;}
.success-checklist li{display:flex;align-items:center;gap:10px;font-size:0.82rem;color:var(--gray-600);}
.check-dot{width:18px;height:18px;flex-shrink:0;background:#d1fae5;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:900;color:#059669;}
.btn-back-login{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px 20px;background:var(--sky-50);color:var(--sky-700);border:1.5px solid var(--sky-200);border-radius:var(--radius-sm);font-family:'Space Grotesk',sans-serif;font-size:0.9rem;font-weight:700;text-decoration:none;transition:all var(--transition);margin-bottom:14px;}
.btn-back-login:hover{background:var(--sky-100);border-color:var(--sky-400);}
.resend-note{font-size:0.78rem;color:var(--gray-400);text-align:center;}
.resend-note button{background:none;border:none;cursor:pointer;color:var(--sky-600);font-weight:600;font-size:0.78rem;text-decoration:underline;padding:0;}

/* Responsive */
@media(max-width:1024px){.left-panel{width:40%;}}
@media(max-width:768px){
    .page-layout{flex-direction:column;}
    .left-panel{width:100%;}
    .left-panel-inner{padding:36px 24px;}
    .panel-sub{max-width:100%;}
    .panel-steps{display:none;}
    .right-panel{padding:32px 16px;align-items:flex-start;}
    .form-card{padding:32px 24px;}
}
@media(max-width:480px){.form-card{padding:24px 18px;}.form-title{font-size:1.25rem;}}
</style>
</head>
<body>

<nav class="navbar">
    <div class="nav-inner">
        <a href="../../index.html" class="nav-brand">
            <div class="nav-logo">
                <svg viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="16" r="14" fill="#0ea5e9" opacity="0.15"/>
                    <path d="M8 22L13 14l4 5 3-7 4 8" stroke="#0ea5e9" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                    <circle cx="24" cy="8" r="2.5" fill="#38bdf8"/>
                </svg>
            </div>
            <span class="nav-title">AnalyticsGateway</span>
        </a>
        <a href="../../login.html" class="btn-nav-signin">Back to Sign In</a>
    </div>
</nav>

<div class="page-layout">
    <aside class="left-panel">
        <div class="left-panel-grid"></div>
        <div class="left-orb left-orb-1"></div>
        <div class="left-orb left-orb-2"></div>
        <div class="left-panel-inner">
            <div class="panel-eyebrow"><span class="eyebrow-dot"></span>Secure · Encrypted · Instant</div>
            <h2 class="panel-headline">Regain Access to<br><span class="panel-headline-accent">Your Analytics.</span></h2>
            <p class="panel-sub">Enter your email and we'll send a secure one-time reset link to your inbox — no questions asked.</p>
            <div class="panel-steps">
                <div class="panel-step"><div class="step-num">1</div><div><div class="step-title">Enter Your Email</div><div class="step-desc">The address registered to your account.</div></div></div>
                <div class="panel-step"><div class="step-num">2</div><div><div class="step-title">Check Your Inbox</div><div class="step-desc">A secure link arrives within minutes.</div></div></div>
                <div class="panel-step"><div class="step-num">3</div><div><div class="step-title">Set a New Password</div><div class="step-desc">Choose something strong and regain full access.</div></div></div>
            </div>
            <div class="panel-secure">
                <div class="panel-secure-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
                <div class="panel-secure-text">Tokens are <strong>SHA-256 hashed</strong> and expire in <strong>1 hour</strong>. Your current password stays active until you change it.</div>
            </div>
        </div>
    </aside>

    <main class="right-panel">
        <div class="form-card">

            <!-- DEFAULT STATE -->
            <div id="defaultState">
                <div class="form-card-header">
                    <div class="form-icon-wrap">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </div>
                    <h1 class="form-title">Forgot your password?</h1>
                    <p class="form-subtitle">Enter your email and we'll send you a secure reset link.</p>
                </div>

                <!-- Debug box: shows real PHP errors during development -->
                <div class="debug-box" id="debugBox"></div>

                <form id="forgotForm" novalidate>
                    <div class="form-group">
                        <label for="fpEmail">Email Address</label>
                        <div class="input-wrap">
                            <span class="input-icon">
                                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
                                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                                </svg>
                            </span>
                            <input type="email" id="fpEmail" name="email" placeholder="your@company.com" class="form-input" required>
                        </div>
                        <div class="error-message" id="fpEmailError"></div>
                    </div>

                    <button type="submit" class="btn-submit" id="fpSubmitBtn">
                        <span id="fpBtnText">Send Reset Link</span>
                        <svg id="fpBtnArrow" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                            <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
                        </svg>
                        <svg id="fpBtnSpinner" class="spinner hidden" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" width="18" height="18">
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                    </button>
                    <p class="form-secure-note">🔐 SHA-256 hashed tokens · Expires in 1 hour · Rate limited</p>
                </form>

                <div class="form-footer">
                    <p>Remembered it? <a href="../../login.html">Back to Sign In</a> &nbsp;·&nbsp; <a href="../../register.html">Create Account</a></p>
                </div>
            </div>

            <!-- SUCCESS STATE -->
            <div id="successState" class="success-state">
                <div class="success-card">
                    <div class="success-icon-wrap">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </div>
                    <h2 class="success-title">Check your inbox!</h2>
                    <p class="success-text">We've sent a password reset link to:</p>
                    <div class="success-email-badge" id="successEmail"></div>
                    <p class="success-text">The link expires in <strong>1 hour</strong>.</p>
                    <ul class="success-checklist">
                        <li><span class="check-dot">✓</span> Check your primary inbox first</li>
                        <li><span class="check-dot">✓</span> Look in spam / junk folders</li>
                        <li><span class="check-dot">✓</span> Check promotions tab (Gmail)</li>
                        <li><span class="check-dot">✓</span> Allow up to 5 minutes for delivery</li>
                    </ul>
                    <a href="../../login.html" class="btn-back-login">
                        <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd"/></svg>
                        Back to Sign In
                    </a>
                    <p class="resend-note">Didn't receive it? <button id="resendBtn" type="button">Resend the email</button></p>
                </div>
            </div>

        </div>
    </main>
</div>

<script>
(function () {
    const forgotForm   = document.getElementById('forgotForm');
    const fpEmail      = document.getElementById('fpEmail');
    const fpEmailError = document.getElementById('fpEmailError');
    const fpSubmitBtn  = document.getElementById('fpSubmitBtn');
    const fpBtnText    = document.getElementById('fpBtnText');
    const fpBtnArrow   = document.getElementById('fpBtnArrow');
    const fpBtnSpinner = document.getElementById('fpBtnSpinner');
    const defaultState = document.getElementById('defaultState');
    const successState = document.getElementById('successState');
    const successEmail = document.getElementById('successEmail');
    const resendBtn    = document.getElementById('resendBtn');
    const debugBox     = document.getElementById('debugBox');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let lastEmail = '';

    fpEmail.addEventListener('input', debounce(validateEmail, 300));
    fpEmail.addEventListener('blur', validateEmail);

    function validateEmail() {
        const val = fpEmail.value.trim();
        if (val === '') { fpEmail.classList.remove('input-valid','input-error'); fpEmailError.textContent=''; return true; }
        if (!emailRegex.test(val)) { fpEmail.classList.add('input-error'); fpEmail.classList.remove('input-valid'); fpEmailError.textContent='Please enter a valid email address.'; return false; }
        fpEmail.classList.add('input-valid'); fpEmail.classList.remove('input-error'); fpEmailError.textContent=''; return true;
    }

    forgotForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const email = fpEmail.value.trim();
        if (!email) { fpEmailError.textContent='Email address is required.'; fpEmail.classList.add('input-error'); return; }
        if (!validateEmail()) return;
        lastEmail = email;
        submitRequest(email);
    });

    resendBtn.addEventListener('click', function() {
        successState.style.display = 'none';
        defaultState.style.display = 'block';
        fpEmail.value = lastEmail;
        fpEmail.classList.add('input-valid');
        fpEmailError.textContent = '';
    });

    function submitRequest(email) {
        setLoading(true);
        debugBox.style.display = 'none';

        // FIX: Use the actual filename, not window.location.pathname,
        // to guarantee the POST always hits this exact PHP file.
        const endpoint = window.location.href.split('?')[0]; // strips query string, keeps .php

        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        })
        .then(function(res) {
            // Before parsing JSON, check if the response is actually JSON.
            // If PHP crashed and returned HTML, we surface the raw text for debugging.
            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                return res.text().then(function(text) {
                    throw new Error('Server returned non-JSON response:\n' + text.substring(0, 300));
                });
            }
            return res.json();
        })
        .then(function(data) {
            setLoading(false);
            if (data.success) {
                showSuccess(email);
            } else {
                // Show the actual PHP error message (great for debugging)
                fpEmailError.textContent = data.message || 'Something went wrong.';
                fpEmail.classList.add('input-error');
                fpEmail.classList.remove('input-valid');
                // Also show in debug box so you can see full message
                if (data.message) {
                    debugBox.textContent = '⚠ Server says: ' + data.message;
                    debugBox.style.display = 'block';
                }
            }
        })
        .catch(function(err) {
            setLoading(false);
            console.error('Forgot password fetch error:', err);
            // Show the raw error — much more useful than generic "network error"
            debugBox.textContent = '⚠ Debug info: ' + err.message;
            debugBox.style.display = 'block';
            fpEmailError.textContent = 'Request failed — see debug info above.';
            fpEmail.classList.add('input-error');
        });
    }

    function showSuccess(email) {
        successEmail.textContent = email;
        defaultState.style.display = 'none';
        successState.style.display = 'block';
    }

    function setLoading(loading) {
        fpSubmitBtn.disabled = loading;
        fpBtnText.textContent = loading ? 'Sending…' : 'Send Reset Link';
        fpBtnArrow.classList.toggle('hidden', loading);
        fpBtnSpinner.classList.toggle('hidden', !loading);
    }

    function debounce(fn, wait) {
        let t;
        return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); };
    }
})();
</script>
</body>
</html>   