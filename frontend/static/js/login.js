document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const loginEmailError = document.getElementById('loginEmailError');
    const loginPasswordError = document.getElementById('loginPasswordError');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // --- CHECK FOR REGISTRATION SUCCESS PASSING FROM URL ---
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('registered') === 'true') {
        showToast('🎉 Account created successfully! Please sign in below.', 'success');
        
        // Clean up address bar query parameters smoothly
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    // -------------------------------------------------------

    // Modern floating field label animations matching register logic
    initializeFieldAnimations();

    loginEmail.addEventListener('input', debounce(() => validateEmail(), 300));
    loginEmail.addEventListener('blur', validateEmail);

    loginPassword.addEventListener('input', function() {
        loginPasswordError.textContent = '';
        loginPassword.classList.remove('input-error');
    });

    function initializeFieldAnimations() {
        const fields = loginForm.querySelectorAll('.form-input');
        fields.forEach(field => {
            // Check initial values (on auto-fill check)
            if (field.value) {
                field.parentElement.classList.add('field-focused');
            }

            field.addEventListener('focus', function() {
                this.parentElement.classList.add('field-focused');
            });

            field.addEventListener('blur', function() {
                if (!this.value) {
                    this.parentElement.classList.remove('field-focused');
                }
            });
        });
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function validateEmail() {
        const email = loginEmail.value.trim();
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

    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();

        loginEmailError.textContent = '';
        loginPasswordError.textContent = '';
        loginEmail.classList.remove('input-valid', 'input-error');
        loginPassword.classList.remove('input-error');

        const email = loginEmail.value.trim();
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

        if (hasError) {
            return;
        }

        loginSubmitBtn.disabled = true;
        const originalText = loginSubmitBtn.textContent;
        loginSubmitBtn.textContent = 'Verifying Core Credentials...';

        const loginData = {
            email: email,
            password: password
        };

        // Standard operational API payload fetch (Connected completely intact)
        fetch('/ai-business-analytics-system/backend/api/login.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(loginData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast('Login successful! Redirecting...', 'success');
                setTimeout(() => {
                    window.location.href = 'frontend/templates/dashboard.html';
                }, 1500);
            } else {
                showToast(data.message || 'Login failed. Please try again.', 'error');
                loginSubmitBtn.disabled = false;
                loginSubmitBtn.textContent = originalText;
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showToast('An error occurred. Please try again.', 'error');
            loginSubmitBtn.disabled = false;
            loginSubmitBtn.textContent = originalText;
        });
    });

    function showToast(message, type) {
        const toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icon = document.createElement('div');
        icon.className = 'toast-icon';
        icon.textContent = type === 'success' ? '✓' : '✕';

        const messageElement = document.createElement('div');
        messageElement.className = 'toast-message';
        messageElement.textContent = message;

        toast.appendChild(icon);
        toast.appendChild(messageElement);
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-show');
        }, 10);

        setTimeout(() => {
            toast.classList.add('toast-exit');
            setTimeout(() => {
                if (toastContainer.contains(toast)) {
                    toastContainer.removeChild(toast);
                }
            }, 300);
        }, 4000);
    }
});