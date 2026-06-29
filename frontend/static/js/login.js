// =============================================================
// static/js/login.js
// AI Business Analytics — Login Page Logic
// All original technalities fully preserved.
// Additions: password-visibility toggle, spinner button states.
// =============================================================

document.addEventListener('DOMContentLoaded', function() {
    const loginForm       = document.getElementById('loginForm');
    const loginEmail      = document.getElementById('loginEmail');
    const loginPassword   = document.getElementById('loginPassword');
    const loginSubmitBtn  = document.getElementById('loginSubmitBtn');
    const loginEmailError = document.getElementById('loginEmailError');
    const loginPasswordError = document.getElementById('loginPasswordError');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // ── CHECK FOR REGISTRATION SUCCESS (original) ──────────────
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('registered') === 'true') {
        showStylishToast('🎉 Account created successfully! Please sign in below.', 'success');
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // ── Field focus animations (original) ──────────────────────
    initializeFieldAnimations();

    // ── Password visibility toggle (new UI element) ─────────────
    const passwordToggle = document.getElementById('passwordToggle');
    if (passwordToggle) {
        passwordToggle.addEventListener('click', function () {
            const isHidden = loginPassword.type === 'password';
            loginPassword.type = isHidden ? 'text' : 'password';
            const eyeIcon = document.getElementById('eyeIcon');
            if (eyeIcon) {
                eyeIcon.innerHTML = isHidden
                    ? /* eye-off */
                      '<path d="M17.94 17.94A10.07 10.07 0 0110 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0110 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke-linecap="round" stroke-linejoin="round"/><line x1="1" y1="1" x2="23" y2="23" stroke-linecap="round"/>'
                    : /* eye */
                      '<path d="M1 10s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7z" stroke-linecap="round"/><circle cx="10" cy="10" r="3" stroke-linecap="round"/>';
            }
        });
    }

    // ── Real-time validation (original) ───────────────────────
    loginEmail.addEventListener('input', debounce(() => validateEmail(), 300));
    loginEmail.addEventListener('blur', validateEmail);

    loginPassword.addEventListener('input', function() {
        loginPasswordError.textContent = '';
        loginPassword.classList.remove('input-error');
    });

    // ────────────────────────────────────────────────────────────
    //  Helpers (original)
    // ────────────────────────────────────────────────────────────

    function initializeFieldAnimations() {
        const fields = loginForm.querySelectorAll('.form-input');
        fields.forEach(field => {
            if (field.value) field.parentElement.classList.add('field-focused');
            field.addEventListener('focus', function() {
                this.parentElement.classList.add('field-focused');
            });
            field.addEventListener('blur', function() {
                if (!this.value) this.parentElement.classList.remove('field-focused');
            });
        });
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => { clearTimeout(timeout); func(...args); };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function validateEmail() {
        const email   = loginEmail.value.trim();
        const isValid = emailRegex.test(email);

        if (email === '') {
            loginEmail.classList.remove('input-valid', 'input-error');
            loginEmailError.textContent = '';
            return true;
        } else if (isValid) {
            loginEmail.classList.remove('input-error');
            loginEmail.classList.add('input-valid');
            loginEmailError.textContent = '';
            return true;
        } else {
            loginEmail.classList.remove('input-valid');
            loginEmail.classList.add('input-error');
            loginEmailError.textContent = 'Invalid email format';
            return false;
        }
    }

    // ── MAIN LOGIN SUBMIT (original logic fully preserved) ──────
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();

        loginEmailError.textContent = '';
        loginPasswordError.textContent = '';
        loginEmail.classList.remove('input-valid', 'input-error');
        loginPassword.classList.remove('input-error');

        const email    = loginEmail.value.trim();
        const password = loginPassword.value;

        let hasError = false;

        if (!email) {
            loginEmailError.textContent = 'Email is required';
            loginEmail.classList.add('input-error');
            hasError = true;
        } else if (!emailRegex.test(email)) {
            loginEmailError.textContent = 'Invalid email format';
            loginEmail.classList.add('input-error');
            hasError = true;
        } else {
            loginEmail.classList.add('input-valid');
        }

        if (!password) {
            loginPasswordError.textContent = 'Password is required';
            loginPassword.classList.add('input-error');
            hasError = true;
        }

        if (hasError) return;

        // Lock UI during request
        loginSubmitBtn.disabled = true;
        const btnText    = document.getElementById('submitBtnText');
        const btnArrow   = document.getElementById('submitArrow');
        const btnSpinner = document.getElementById('submitSpinner');

        if (btnText)    btnText.textContent = 'Verifying Core Credentials…';
        if (btnArrow)   btnArrow.classList.add('hidden');
        if (btnSpinner) btnSpinner.classList.remove('hidden');

        const loginData = { email: email, password: password };

        // ── API call (original) ─────────────────────────────
        fetch('/ai-business-analytics-system/backend/api/login.php', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(loginData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const redirectUrl = data.redirect || '/ai-business-analytics-system/frontend/templates/dashboard.html';

                let toastMessage = 'Login successful!';
                let toastType    = 'success';

                if (redirectUrl.includes('payment.html')) {
                    toastMessage = '⚠️ Your subscription is inactive or expired. Please renew to continue.';
                    toastType    = 'warning';
                }

                showStylishToast(toastMessage, toastType);

                // Redirect after 8 seconds (original timing)
                setTimeout(() => { window.location.href = redirectUrl; }, 8000);

            } else {
                showStylishToast(data.message || 'Login failed. Please try again.', 'error');
                resetSubmitButton();
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showStylishToast('An error occurred. Please try again.', 'error');
            resetSubmitButton();
        });

        function resetSubmitButton() {
            loginSubmitBtn.disabled = false;
            if (btnText)    btnText.textContent = 'Sign In to Dashboard';
            if (btnArrow)   btnArrow.classList.remove('hidden');
            if (btnSpinner) btnSpinner.classList.add('hidden');
        }
    });

    // ── STYLISH TOAST (original — fully preserved) ────────────
    function showStylishToast(message, type) {
        const existing = document.getElementById('stylishToast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'stylishToast';

        toast.style.position      = 'fixed';
        toast.style.top           = '30px';
        toast.style.left          = '50%';
        toast.style.transform     = 'translateX(-50%)';
        toast.style.zIndex        = '999999';
        toast.style.padding       = '18px 28px';
        toast.style.borderRadius  = '16px';
        toast.style.fontFamily    = "'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
        toast.style.fontSize      = '17px';
        toast.style.fontWeight    = '500';
        toast.style.boxShadow     = '0 12px 40px rgba(0,0,0,0.15)';
        toast.style.minWidth      = '320px';
        toast.style.maxWidth      = '90%';
        toast.style.textAlign     = 'center';
        toast.style.transition    = 'all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
        toast.style.opacity       = '0';
        toast.style.transform     = 'translateX(-50%) translateY(-40px) scale(0.95)';
        toast.style.display       = 'flex';
        toast.style.alignItems    = 'center';
        toast.style.justifyContent= 'space-between';
        toast.style.gap           = '15px';
        toast.style.backdropFilter= 'blur(10px)';
        toast.style.border        = '1px solid rgba(255,255,255,0.3)';

        let bgColor, textColor, borderColor;
        switch (type) {
            case 'success':
                bgColor = '#d4edda'; textColor = '#155724'; borderColor = '#c3e6cb'; break;
            case 'warning':
                bgColor = '#fff3cd'; textColor = '#856404'; borderColor = '#ffc107'; break;
            case 'error':
                bgColor = '#f8d7da'; textColor = '#721c24'; borderColor = '#f5c6cb'; break;
            default:
                bgColor = '#d1ecf1'; textColor = '#0c5460'; borderColor = '#bee5eb';
        }

        toast.style.backgroundColor = bgColor;
        toast.style.color           = textColor;
        toast.style.borderColor     = borderColor;

        const msgContainer = document.createElement('div');
        msgContainer.style.display     = 'flex';
        msgContainer.style.alignItems  = 'center';
        msgContainer.style.gap         = '12px';
        msgContainer.style.flex        = '1';

        const icon = document.createElement('span');
        icon.style.fontSize = '24px';
        if (type === 'success')      icon.textContent = '✅';
        else if (type === 'warning') icon.textContent = '⚠️';
        else                         icon.textContent = '❌';
        msgContainer.appendChild(icon);

        const textSpan = document.createElement('span');
        textSpan.textContent     = message;
        textSpan.style.lineHeight = '1.5';
        msgContainer.appendChild(textSpan);
        toast.appendChild(msgContainer);

        const closeBtn = document.createElement('button');
        closeBtn.textContent           = '×';
        closeBtn.style.background      = 'transparent';
        closeBtn.style.border          = 'none';
        closeBtn.style.fontSize        = '28px';
        closeBtn.style.fontWeight      = '300';
        closeBtn.style.cursor          = 'pointer';
        closeBtn.style.color           = textColor;
        closeBtn.style.opacity         = '0.6';
        closeBtn.style.transition      = 'opacity 0.2s';
        closeBtn.style.padding         = '0 5px';
        closeBtn.style.lineHeight      = '1';

        closeBtn.onmouseover = () => { closeBtn.style.opacity = '1'; };
        closeBtn.onmouseout  = () => { closeBtn.style.opacity = '0.6'; };
        closeBtn.onclick = function() {
            toast.style.opacity   = '0';
            toast.style.transform = 'translateX(-50%) translateY(-40px) scale(0.95)';
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 500);
        };
        toast.appendChild(closeBtn);

        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity   = '1';
            toast.style.transform = 'translateX(-50%) translateY(0) scale(1)';
        });

        // Auto-hide after 10 seconds (original timing)
        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.opacity   = '0';
                toast.style.transform = 'translateX(-50%) translateY(-40px) scale(0.95)';
                setTimeout(() => { if (toast.parentNode) toast.remove(); }, 500);
            }
        }, 10000);
    }
});   