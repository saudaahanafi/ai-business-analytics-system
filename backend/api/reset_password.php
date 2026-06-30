<?php
// =============================================================
// reset-password.php  — Single-file: PHP + HTML + CSS + JS
// Validates the token from the email link, lets user set a
// new password, then redirects to login.
// =============================================================

require_once dirname(__DIR__) . '/config/database.php';

// ── Handle POST (AJAX form submit) ───────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json');

    try {
        $input    = json_decode(file_get_contents('php://input'), true);
        $token    = isset($input['token'])    ? trim($input['token'])    : '';
        $email    = isset($input['email'])    ? trim(strtolower($input['email'])) : '';
        $password = isset($input['password']) ? $input['password']       : '';
        $confirm  = isset($input['confirm'])  ? $input['confirm']        : '';

        // ── Basic validation ─────────────────────────────────
        if (empty($token) || empty($email) || empty($password)) {
            throw new Exception('Missing required fields.');
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new Exception('Invalid email address.');
        }

        if (strlen($password) < 8) {
            throw new Exception('Password must be at least 8 characters.');
        }

        if ($password !== $confirm) {
            throw new Exception('Passwords do not match.');
        }

        $pdo = getDBConnection();

        // ── Look up the hashed token ─────────────────────────
        $tokenHash = hash('sha256', $token);

        $stmt = $pdo->prepare("
            SELECT id, email, expires_at
            FROM password_resets
            WHERE token = ? AND email = ?
            LIMIT 1
        ");
        $stmt->execute([$tokenHash, $email]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            throw new Exception('This reset link is invalid. Please request a new one.');
        }

        // ── Check expiry ─────────────────────────────────────
        if (new DateTime() > new DateTime($row['expires_at'])) {
            // Clean up the expired token
            $pdo->prepare("DELETE FROM password_resets WHERE token = ?")->execute([$tokenHash]);
            throw new Exception('This reset link has expired. Please request a new one.');
        }

        // ── Update the password ──────────────────────────────
        $hashedPassword = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

        $update = $pdo->prepare("UPDATE users SET password = ? WHERE email = ?");
        $update->execute([$hashedPassword, $email]);

        if ($update->rowCount() === 0) {
            throw new Exception('Could not update password. User not found.');
        }

        // ── Invalidate the token so it can't be reused ───────
        $pdo->prepare("DELETE FROM password_resets WHERE email = ?")->execute([$email]);

        echo json_encode(['success' => true, 'message' => 'Password updated successfully.']);

    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

// ── Handle GET — validate token before showing the form ──────
$tokenParam = isset($_GET['token']) ? trim($_GET['token']) : '';
$emailParam = isset($_GET['email']) ? trim(strtolower($_GET['email'])) : '';

$tokenValid   = false;
$tokenMessage = '';

if ($tokenParam && $emailParam && filter_var($emailParam, FILTER_VALIDATE_EMAIL)) {
    try {
        $pdo       = getDBConnection();
        $tokenHash = hash('sha256', $tokenParam);

        $stmt = $pdo->prepare("
            SELECT expires_at FROM password_resets
            WHERE token = ? AND email = ?
            LIMIT 1
        ");
        $stmt->execute([$tokenHash, $emailParam]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            $tokenMessage = 'This reset link is invalid or has already been used.';
        } elseif (new DateTime() > new DateTime($row['expires_at'])) {
            $tokenMessage = 'This reset link has expired. Please request a new one.';
        } else {
            $tokenValid = true;
        }
    } catch (Exception $e) {
        $tokenMessage = 'A server error occurred. Please try again.';
    }
} else {
    $tokenMessage = 'No valid reset token found. Please check your link or request a new one.';
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Set New Password — AnalyticsGateway</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
/* ── Design system tokens (matches full site) ── */
:root {
    --sky-50:#f0f9ff;--sky-100:#e0f2fe;--sky-200:#bae6fd;--sky-300:#7dd3fc;
    --sky-400:#38bdf8;--sky-500:#0ea5e9;--sky-600:#0284c7;--sky-700:#0369a1;
    --sky-900:#0c4a6e;--white:#ffffff;
    --gray-50:#f8fafc;--gray-100:#f1f5f9;--gray-200:#e2e8f0;--gray-300:#cbd5e1;
    --gray-400:#94a3b8;--gray-500:#64748b;--gray-600:#475569;--gray-700:#334155;
    --gray-800:#1e293b;--gray-900:#0f172a;
    --success:#10b981;--danger:#ef4444;--warning:#f59e0b;
    --radius-sm:8px;--radius-md:12px;--radius-lg:20px;
    --shadow-lg:0 12px 40px rgba(14,165,233,0.15),0 4px 12px rgba(0,0,0,0.08);
    --transition:0.2s ease;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html{height:100%;scroll-behavior:smooth;}
body{
    font-family:'Inter',system-ui,sans-serif;
    background:var(--gray-50);color:var(--gray-800);
    min-height:100vh;display:flex;flex-direction:column;overflow-x:hidden;
}

/* Navbar */
.navbar{
    position:sticky;top:0;z-index:100;
    background:rgba(255,255,255,0.92);backdrop-filter:blur(12px);
    border-bottom:1px solid var(--gray-200);
}
.nav-inner{
    max-width:1180px;margin:0 auto;padding:0 24px;height:64px;
    display:flex;align-items:center;justify-content:space-between;
}
.nav-brand{display:flex;align-items:center;gap:10px;text-decoration:none;}
.nav-logo svg{width:32px;height:32px;}
.nav-title{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:1.1rem;color:var(--gray-900);}
.btn-nav-signin{
    font-size:0.875rem;font-weight:600;color:var(--sky-600);
    text-decoration:none;padding:7px 18px;border-radius:var(--radius-sm);
    border:1.5px solid var(--sky-200);transition:all var(--transition);
}
.btn-nav-signin:hover{background:var(--sky-50);border-color:var(--sky-400);}

/* Layout */
.page-layout{display:flex;flex:1;min-height:calc(100vh - 64px);}

/* Left panel */
.left-panel{
    width:44%;flex-shrink:0;
    background:linear-gradient(135deg,var(--sky-900) 0%,var(--sky-700) 55%,var(--sky-500) 100%);
    position:relative;overflow:hidden;display:flex;align-items:center;
}
.left-panel-grid{
    position:absolute;inset:0;
    background-image:
        linear-gradient(rgba(255,255,255,0.04) 1px,transparent 1px),
        linear-gradient(90deg,rgba(255,255,255,0.04) 1px,transparent 1px);
    background-size:48px 48px;
}
.left-orb{position:absolute;border-radius:50%;filter:blur(70px);opacity:0.25;}
.left-orb-1{width:380px;height:380px;background:radial-gradient(circle,#38bdf8,transparent);top:-80px;right:-60px;}
.left-orb-2{width:260px;height:260px;background:radial-gradient(circle,#0284c7,transparent);bottom:-60px;left:20px;}
.left-panel-inner{position:relative;z-index:2;padding:56px 48px;}

.panel-eyebrow{
    display:inline-flex;align-items:center;gap:8px;
    font-size:0.72rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;
    color:var(--sky-200);margin-bottom:22px;
}
.eyebrow-dot{
    width:7px;height:7px;background:var(--sky-300);border-radius:50%;
    animation:pulse-dot 2s ease-in-out infinite;
}
@keyframes pulse-dot{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.5;transform:scale(1.4);}}

.panel-headline{
    font-family:'Space Grotesk',sans-serif;
    font-size:clamp(1.8rem,2.5vw,2.5rem);font-weight:800;
    letter-spacing:-0.04em;line-height:1.1;color:var(--white);margin-bottom:16px;
}
.panel-headline-accent{
    background:linear-gradient(90deg,#7dd3fc,#38bdf8);
    -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.panel-sub{font-size:0.92rem;color:var(--sky-100);line-height:1.7;margin-bottom:36px;max-width:340px;}

/* Password rules list */
.rules-list{display:flex;flex-direction:column;gap:12px;margin-bottom:32px;}
.rule-item{display:flex;align-items:center;gap:12px;}
.rule-icon{
    width:30px;height:30px;flex-shrink:0;
    background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);
    border-radius:50%;display:flex;align-items:center;justify-content:center;
}
.rule-icon svg{width:14px;height:14px;stroke:var(--sky-200);}
.rule-text{font-size:0.82rem;color:var(--sky-100);line-height:1.4;}

.panel-secure{
    display:flex;align-items:center;gap:12px;
    background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);
    border-radius:var(--radius-md);padding:16px 18px;
}
.panel-secure-icon{
    width:36px;height:36px;flex-shrink:0;
    background:rgba(255,255,255,0.12);border-radius:var(--radius-sm);
    display:flex;align-items:center;justify-content:center;
}
.panel-secure-icon svg{width:18px;height:18px;stroke:#86efac;}
.panel-secure-text{font-size:0.78rem;color:var(--sky-200);line-height:1.55;}
.panel-secure-text strong{color:var(--white);}

/* Right panel */
.right-panel{flex:1;display:flex;align-items:center;justify-content:center;padding:40px 24px;background:var(--gray-50);}

/* Form card */
.form-card{
    width:100%;max-width:460px;background:var(--white);
    border:1px solid var(--gray-200);border-radius:var(--radius-lg);
    padding:44px 40px;box-shadow:var(--shadow-lg);
}
.form-card-header{text-align:center;margin-bottom:32px;}
.form-icon-wrap{
    width:52px;height:52px;background:var(--sky-50);border:1.5px solid var(--sky-200);
    border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;
    margin:0 auto 18px;
}
.form-icon-wrap svg{width:24px;height:24px;stroke:var(--sky-500);}
.form-icon-wrap.icon-success{background:#d1fae5;border-color:#86efac;}
.form-icon-wrap.icon-success svg{stroke:#059669;}
.form-icon-wrap.icon-error{background:#fee2e2;border-color:#fca5a5;}
.form-icon-wrap.icon-error svg{stroke:var(--danger);}

.form-title{font-family:'Space Grotesk',sans-serif;font-size:1.5rem;font-weight:800;color:var(--gray-900);letter-spacing:-0.02em;margin-bottom:6px;}
.form-subtitle{font-size:0.875rem;color:var(--gray-400);line-height:1.5;}

/* Form groups */
.form-group{margin-bottom:20px;}
.label-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;}
.form-group label,.label-row label{display:block;font-size:0.82rem;font-weight:600;color:var(--gray-700);letter-spacing:0.01em;}
.input-wrap{position:relative;display:flex;align-items:center;}
.input-icon{position:absolute;left:13px;display:flex;align-items:center;pointer-events:none;z-index:1;}
.input-icon svg{stroke:var(--gray-400);}
.form-input{
    width:100%;padding:11px 40px 11px 38px;
    font-family:inherit;font-size:0.9rem;color:var(--gray-800);
    background:var(--gray-50);border:1.5px solid var(--gray-200);border-radius:var(--radius-sm);
    outline:none;transition:border-color var(--transition),background var(--transition),box-shadow var(--transition);
}
.form-input::placeholder{color:var(--gray-300);}
.form-input:focus{background:var(--white);border-color:var(--sky-400);box-shadow:0 0 0 3px rgba(14,165,233,0.12);}
.form-input.input-valid{border-color:var(--success);background:#f0fdf4;}
.form-input.input-error{border-color:var(--danger);background:#fff5f5;}

.password-toggle{
    position:absolute;right:12px;background:none;border:none;cursor:pointer;
    padding:4px;color:var(--gray-400);display:flex;align-items:center;transition:color var(--transition);
}
.password-toggle:hover{color:var(--sky-500);}

.error-message{font-size:0.75rem;color:var(--danger);margin-top:5px;min-height:16px;font-weight:500;}

/* Strength meter */
.strength-container{margin-top:8px;display:flex;align-items:center;gap:10px;}
.strength-track{flex:1;height:5px;background:var(--gray-200);border-radius:99px;overflow:hidden;}
.strength-fill{height:100%;width:0;border-radius:99px;background:var(--danger);transition:width 0.35s ease,background 0.35s ease;}
.strength-label{font-size:0.72rem;color:var(--gray-400);white-space:nowrap;font-weight:500;min-width:140px;}

/* Requirement pills */
.req-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:12px;}
.req{
    display:flex;align-items:center;gap:6px;
    font-size:0.72rem;color:var(--gray-400);font-weight:500;
    transition:color var(--transition);
}
.req-dot{width:6px;height:6px;border-radius:50%;background:var(--gray-300);flex-shrink:0;transition:background var(--transition);}
.req.met{color:var(--success);}
.req.met .req-dot{background:var(--success);}

/* Submit */
.btn-submit{
    display:flex;align-items:center;justify-content:center;gap:8px;
    width:100%;padding:13px 20px;
    background:linear-gradient(135deg,var(--sky-500),var(--sky-700));
    color:var(--white);font-family:'Space Grotesk',sans-serif;font-size:0.95rem;font-weight:700;
    border:none;border-radius:var(--radius-sm);cursor:pointer;
    transition:transform var(--transition),box-shadow var(--transition),opacity var(--transition);
    box-shadow:0 4px 16px rgba(14,165,233,0.30);margin-bottom:14px;margin-top:8px;
}
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

/* Invalid token card */
.invalid-card{text-align:center;}
.invalid-card p{font-size:0.9rem;color:var(--gray-500);line-height:1.7;margin-bottom:24px;}
.btn-request-new{
    display:inline-flex;align-items:center;gap:8px;
    padding:12px 28px;background:var(--sky-500);color:var(--white);
    font-family:'Space Grotesk',sans-serif;font-size:0.9rem;font-weight:700;
    border-radius:var(--radius-sm);text-decoration:none;
    transition:background var(--transition),transform var(--transition);
}
.btn-request-new:hover{background:var(--sky-600);transform:translateY(-1px);}

/* Success state */
.success-card{text-align:center;}
.success-icon-wrap{
    width:72px;height:72px;background:#d1fae5;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    margin:0 auto 20px;
    animation:pop-in 0.4s cubic-bezier(0.175,0.885,0.32,1.275) both;
}
@keyframes pop-in{from{opacity:0;transform:scale(0.5);}to{opacity:1;transform:scale(1);}}
.success-icon-wrap svg{width:36px;height:36px;stroke:#059669;stroke-width:2.5;}
.success-title{font-family:'Space Grotesk',sans-serif;font-size:1.4rem;font-weight:800;color:var(--gray-900);margin-bottom:12px;}
.success-text{font-size:0.9rem;color:var(--gray-500);line-height:1.7;margin-bottom:24px;}
.countdown-bar{
    background:var(--gray-100);border-radius:999px;height:5px;
    overflow:hidden;margin-bottom:8px;
}
.countdown-fill{
    height:100%;background:linear-gradient(90deg,var(--sky-400),var(--sky-600));
    width:100%;border-radius:999px;
    transition:width 1s linear;
}
.countdown-text{font-size:0.75rem;color:var(--gray-400);margin-bottom:24px;}
.btn-goto-login{
    display:flex;align-items:center;justify-content:center;gap:8px;
    width:100%;padding:13px 20px;
    background:linear-gradient(135deg,var(--sky-500),var(--sky-700));
    color:var(--white);font-family:'Space Grotesk',sans-serif;font-size:0.95rem;font-weight:700;
    border:none;border-radius:var(--radius-sm);cursor:pointer;text-decoration:none;
    transition:transform var(--transition),box-shadow var(--transition);
    box-shadow:0 4px 16px rgba(14,165,233,0.30);
}
.btn-goto-login:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(14,165,233,0.40);}

/* Responsive */
@media(max-width:1024px){.left-panel{width:40%;}}
@media(max-width:768px){
    .page-layout{flex-direction:column;}
    .left-panel{width:100%;}
    .left-panel-inner{padding:36px 24px;}
    .panel-headline{font-size:1.8rem;}
    .panel-sub{max-width:100%;}
    .rules-list{display:none;}
    .right-panel{padding:32px 16px;align-items:flex-start;}
    .form-card{padding:32px 24px;}
}
@media(max-width:480px){.form-card{padding:24px 18px;}.form-title{font-size:1.25rem;}}
</style>
</head>
<body>

<!-- NAVBAR -->
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
            <span class="nav-title">ANALYTIQ</span>
        </a>
        <div>
            <a href="../../login.html" class="btn-nav-signin">Back to Sign In</a>
        </div>
    </div>
</nav>

<!-- LAYOUT -->
<div class="page-layout">

    <!-- LEFT PANEL -->
    <aside class="left-panel">
        <div class="left-panel-grid"></div>
        <div class="left-orb left-orb-1"></div>
        <div class="left-orb left-orb-2"></div>
        <div class="left-panel-inner">
            <div class="panel-eyebrow">
                <span class="eyebrow-dot"></span>
                Secure · Encrypted · Instant
            </div>
            <h2 class="panel-headline">
                Set a Strong<br>
                <span class="panel-headline-accent">New Password.</span>
            </h2>
            <p class="panel-sub">
                Choose something you haven't used before.
                A strong password keeps your analytics data safe from unauthorised access.
            </p>
            <div class="rules-list">
                <div class="rule-item">
                    <div class="rule-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                    <div class="rule-text">At least <strong style="color:#fff">8 characters</strong> long</div>
                </div>
                <div class="rule-item">
                    <div class="rule-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                    <div class="rule-text">Mix of <strong style="color:#fff">uppercase & lowercase</strong></div>
                </div>
                <div class="rule-item">
                    <div class="rule-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                    <div class="rule-text">At least one <strong style="color:#fff">number</strong></div>
                </div>
                <div class="rule-item">
                    <div class="rule-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                    <div class="rule-text">At least one <strong style="color:#fff">special character</strong></div>
                </div>
            </div>
            <div class="panel-secure">
                <div class="panel-secure-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
                <div class="panel-secure-text">
                    Passwords are <strong>bcrypt-hashed</strong> (cost 12) before storage.
                    Your old password stays active until you submit this form.
                </div>
            </div>
        </div>
    </aside>

    <!-- RIGHT PANEL -->
    <main class="right-panel">
        <div class="form-card">

<?php if (!$tokenValid): ?>
            <!-- ── INVALID / EXPIRED TOKEN ── -->
            <div class="form-card-header">
                <div class="form-icon-wrap icon-error">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10" stroke-linecap="round"/>
                        <line x1="15" y1="9" x2="9" y2="15" stroke-linecap="round"/>
                        <line x1="9" y1="9" x2="15" y2="15" stroke-linecap="round"/>
                    </svg>
                </div>
                <h1 class="form-title">Link Invalid or Expired</h1>
                <p class="form-subtitle"><?= htmlspecialchars($tokenMessage) ?></p>
            </div>
            <div class="invalid-card">
                <p>Reset links expire after <strong>1 hour</strong> for security. You can request a fresh one anytime — it only takes a few seconds.</p>
                <a href="forgot_password.php" class="btn-request-new">
                    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                        <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/>
                    </svg>
                    Request a New Reset Link
                </a>
            </div>
            <div class="form-footer">
                <p>Remembered it? <a href="../../login.html">Back to Sign In</a></p>
            </div>

<?php else: ?>
            <!-- ── VALID TOKEN — SHOW FORM ── -->
            <div id="formState">
                <div class="form-card-header">
                    <div class="form-icon-wrap">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 11V7a5 5 0 0110 0v4" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                    <h1 class="form-title">Set a new password</h1>
                    <p class="form-subtitle">For <strong><?= htmlspecialchars($emailParam) ?></strong></p>
                </div>

                <form id="resetForm" novalidate>
                    <input type="hidden" id="resetToken" value="<?= htmlspecialchars($tokenParam) ?>">
                    <input type="hidden" id="resetEmail" value="<?= htmlspecialchars($emailParam) ?>">

                    <div class="form-group">
                        <label for="newPassword">New Password</label>
                        <div class="input-wrap">
                            <span class="input-icon">
                                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
                                    <path d="M5 9V7a7 7 0 0114 0v2M5 9a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2H5z" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </span>
                            <input type="password" id="newPassword" name="password"
                                   placeholder="Minimum 8 characters" class="form-input" required>
                            <button type="button" class="password-toggle" id="toggleNew" aria-label="Toggle">
                                <svg id="eyeNew" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
                                    <path d="M1 10s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7z" stroke-linecap="round"/>
                                    <circle cx="10" cy="10" r="3" stroke-linecap="round"/>
                                </svg>
                            </button>
                        </div>
                        <!-- Strength meter -->
                        <div class="strength-container">
                            <div class="strength-track">
                                <div class="strength-fill" id="strengthFill"></div>
                            </div>
                            <span class="strength-label" id="strengthLabel">Enter a password</span>
                        </div>
                        <!-- Requirements grid -->
                        <div class="req-grid">
                            <div class="req" id="req-length"><span class="req-dot"></span>8+ characters</div>
                            <div class="req" id="req-upper"><span class="req-dot"></span>Uppercase letter</div>
                            <div class="req" id="req-number"><span class="req-dot"></span>Number</div>
                            <div class="req" id="req-special"><span class="req-dot"></span>Special character</div>
                        </div>
                        <div class="error-message" id="newPasswordError"></div>
                    </div>

                    <div class="form-group">
                        <label for="confirmPassword">Confirm New Password</label>
                        <div class="input-wrap">
                            <span class="input-icon">
                                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
                                    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </span>
                            <input type="password" id="confirmPassword" name="confirm"
                                   placeholder="Re-enter your password" class="form-input" required>
                            <button type="button" class="password-toggle" id="toggleConfirm" aria-label="Toggle">
                                <svg id="eyeConfirm" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16">
                                    <path d="M1 10s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7z" stroke-linecap="round"/>
                                    <circle cx="10" cy="10" r="3" stroke-linecap="round"/>
                                </svg>
                            </button>
                        </div>
                        <div class="error-message" id="confirmPasswordError"></div>
                    </div>

                    <button type="submit" class="btn-submit" id="resetSubmitBtn">
                        <span id="resetBtnText">Update Password</span>
                        <svg id="resetBtnArrow" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                            <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
                        </svg>
                        <svg id="resetBtnSpinner" class="spinner hidden" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" width="18" height="18">
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                    </button>
                    <p class="form-secure-note">🔐 Your password is bcrypt-hashed before it's stored.</p>
                </form>
                <div class="form-footer">
                    <p>Remembered it? <a href="../../login.html">Back to Sign In</a></p>
                </div>
            </div>

            <!-- ── SUCCESS STATE ── -->
            <div id="successState" style="display:none;">
                <div class="success-icon-wrap" style="margin-top:12px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
                <div class="success-card">
                    <h2 class="success-title">Password Updated!</h2>
                    <p class="success-text">Your password has been changed successfully. You can now sign in with your new credentials.</p>
                    <div class="countdown-bar"><div class="countdown-fill" id="countdownFill"></div></div>
                    <p class="countdown-text" id="countdownText">Redirecting to Sign In in 5 seconds…</p>
                    <a href="../../login.html" class="btn-goto-login">
                        <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                            <path fill-rule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clip-rule="evenodd"/>
                        </svg>
                        Go to Sign In Now
                    </a>
                </div>
            </div>
<?php endif; ?>

        </div><!-- /form-card -->
    </main>
</div>

<script>
(function () {

<?php if ($tokenValid): ?>
    const resetForm       = document.getElementById('resetForm');
    const newPassword     = document.getElementById('newPassword');
    const confirmPassword = document.getElementById('confirmPassword');
    const newPasswordError    = document.getElementById('newPasswordError');
    const confirmPasswordError= document.getElementById('confirmPasswordError');
    const resetSubmitBtn  = document.getElementById('resetSubmitBtn');
    const resetBtnText    = document.getElementById('resetBtnText');
    const resetBtnArrow   = document.getElementById('resetBtnArrow');
    const resetBtnSpinner = document.getElementById('resetBtnSpinner');
    const strengthFill    = document.getElementById('strengthFill');
    const strengthLabel   = document.getElementById('strengthLabel');
    const formState       = document.getElementById('formState');
    const successState    = document.getElementById('successState');

    // ── Password toggle buttons ──────────────────────────────
    setupToggle('toggleNew', 'newPassword', 'eyeNew');
    setupToggle('toggleConfirm', 'confirmPassword', 'eyeConfirm');

    function setupToggle(btnId, inputId, iconId) {
        document.getElementById(btnId).addEventListener('click', function () {
            const inp  = document.getElementById(inputId);
            const icon = document.getElementById(iconId);
            const show = inp.type === 'password';
            inp.type   = show ? 'text' : 'password';
            icon.innerHTML = show
                ? '<path d="M17.94 17.94A10.07 10.07 0 0110 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0110 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke-linecap="round" stroke-linejoin="round"/><line x1="1" y1="1" x2="23" y2="23" stroke-linecap="round"/>'
                : '<path d="M1 10s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7z" stroke-linecap="round"/><circle cx="10" cy="10" r="3" stroke-linecap="round"/>';
        });
    }

    // ── Strength meter + requirement pills ───────────────────
    newPassword.addEventListener('input', function () {
        const val = this.value;
        updateStrength(val);
        checkReqs(val);
        if (confirmPassword.value) validateConfirm();
    });

    function updateStrength(val) {
        let score = 0;
        if (val.length >= 8)                              score++;
        if (/[A-Z]/.test(val))                            score++;
        if (/[a-z]/.test(val))                            score++;
        if (/[0-9]/.test(val))                            score++;
        if (/[^A-Za-z0-9]/.test(val))                    score++;

        const configs = [
            {w:'0%',   c:'#ef4444', l:'No password'},
            {w:'20%',  c:'#ef4444', l:'Very weak'},
            {w:'40%',  c:'#f59e0b', l:'Weak'},
            {w:'65%',  c:'#f59e0b', l:'Moderate'},
            {w:'85%',  c:'#10b981', l:'Strong'},
            {w:'100%', c:'#059669', l:'Very strong ✓'},
        ];
        const cfg = configs[Math.min(score, 5)];
        strengthFill.style.width           = val.length === 0 ? '0%' : cfg.w;
        strengthFill.style.backgroundColor = cfg.c;
        strengthLabel.textContent          = val.length === 0 ? 'Enter a password' : cfg.l;
    }

    function checkReqs(val) {
        setReq('req-length',  val.length >= 8);
        setReq('req-upper',   /[A-Z]/.test(val));
        setReq('req-number',  /[0-9]/.test(val));
        setReq('req-special', /[^A-Za-z0-9]/.test(val));
    }

    function setReq(id, met) {
        const el = document.getElementById(id);
        el.classList.toggle('met', met);
    }

    // ── Confirm validation ───────────────────────────────────
    confirmPassword.addEventListener('input', validateConfirm);

    function validateConfirm() {
        if (!confirmPassword.value) {
            confirmPassword.classList.remove('input-valid','input-error');
            confirmPasswordError.textContent = '';
            return true;
        }
        if (confirmPassword.value !== newPassword.value) {
            confirmPassword.classList.add('input-error');
            confirmPassword.classList.remove('input-valid');
            confirmPasswordError.textContent = 'Passwords do not match.';
            return false;
        }
        confirmPassword.classList.add('input-valid');
        confirmPassword.classList.remove('input-error');
        confirmPasswordError.textContent = '';
        return true;
    }

    // ── Form submit ──────────────────────────────────────────
    resetForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const pwd     = newPassword.value;
        const confirm = confirmPassword.value;
        let hasError  = false;

        if (!pwd || pwd.length < 8) {
            newPasswordError.textContent = 'Password must be at least 8 characters.';
            newPassword.classList.add('input-error');
            hasError = true;
        } else {
            newPassword.classList.remove('input-error');
            newPasswordError.textContent = '';
        }

        if (!confirm) {
            confirmPasswordError.textContent = 'Please confirm your password.';
            confirmPassword.classList.add('input-error');
            hasError = true;
        } else if (!validateConfirm()) {
            hasError = true;
        }

        if (hasError) return;

        setLoading(true);

        fetch(window.location.pathname + window.location.search, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token:    document.getElementById('resetToken').value,
                email:    document.getElementById('resetEmail').value,
                password: pwd,
                confirm:  confirm
            })
        })
        .then(r => r.json())
        .then(data => {
            setLoading(false);
            if (data.success) {
                formState.style.display    = 'none';
                successState.style.display = 'block';
                startCountdown();
            } else {
                newPasswordError.textContent = data.message || 'Something went wrong. Please try again.';
                newPassword.classList.add('input-error');
            }
        })
        .catch(err => {
            console.error(err);
            setLoading(false);
            newPasswordError.textContent = 'A network error occurred. Please try again.';
        });
    });

    // ── Countdown + auto-redirect ────────────────────────────
    function startCountdown() {
        let secs = 5;
        const fill = document.getElementById('countdownFill');
        const text = document.getElementById('countdownText');

        const timer = setInterval(function () {
            secs--;
            fill.style.width = (secs / 5 * 100) + '%';
            text.textContent = 'Redirecting to Sign In in ' + secs + ' second' + (secs !== 1 ? 's' : '') + '…';
            if (secs <= 0) {
                clearInterval(timer);
                window.location.href = '../../login.html';
            }
        }, 1000);
    }
    
    // ── Loading state ────────────────────────────────────────
    function setLoading(loading) {
        resetSubmitBtn.disabled = loading;
        resetBtnText.textContent = loading ? 'Updating…' : 'Update Password';
        resetBtnArrow.classList.toggle('hidden', loading);
        resetBtnSpinner.classList.toggle('hidden', !loading);
    }
<?php endif; ?>

})();
</script>
</body>
</html>   