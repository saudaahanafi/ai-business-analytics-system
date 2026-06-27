// =============================================================
// static/js/register.js
// AI Business Analytics System — Registration Page Logic
// =============================================================

document.addEventListener('DOMContentLoaded', function () {

  // ── Form element references ─────────────────────────────────
  const registerForm      = document.getElementById('registerForm');
  const registerFullname  = document.getElementById('registerFullname');
  const registerEmail     = document.getElementById('registerEmail');
  const registerPassword  = document.getElementById('registerPassword');
  const registerCompany   = document.getElementById('registerCompany');
  const registerSector    = document.getElementById('registerSector');
  const registerSubmitBtn = document.getElementById('registerSubmitBtn');
  const strengthFill      = document.getElementById('strengthFill');
  const strengthLabel     = document.getElementById('strengthLabel');

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let isSubmitting = false;

  // ── Field focus animations ──────────────────────────────────
  initializeFieldAnimations();

  // ── Real-time validation listeners ─────────────────────────
  registerFullname.addEventListener('input', debounce(() => validateFullname(), 300));
  registerFullname.addEventListener('blur', validateFullname);

  registerEmail.addEventListener('input', debounce(() => validateEmail(), 300));
  registerEmail.addEventListener('blur', validateEmail);

  registerPassword.addEventListener('input', debounce(() => {
    evaluatePasswordStrength();
    validatePassword();
  }, 300));
  registerPassword.addEventListener('blur', validatePassword);

  registerCompany.addEventListener('input', debounce(() => validateCompany(), 300));
  registerCompany.addEventListener('blur', validateCompany);

  registerSector.addEventListener('input', debounce(() => validateSector(), 300));
  registerSector.addEventListener('blur', validateSector);

  // ── Initialise password strength meter ─────────────────────
  evaluatePasswordStrength();

  // ────────────────────────────────────────────────────────────
  //  Helpers
  // ────────────────────────────────────────────────────────────

  function initializeFieldAnimations() {
    const fields = registerForm.querySelectorAll('.form-input');
    fields.forEach(function (field) {
      field.addEventListener('focus', function () {
        this.parentElement.classList.add('field-focused');
      });
      field.addEventListener('blur', function () {
        if (!this.value) {
          this.parentElement.classList.remove('field-focused');
        }
      });
    });
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction (...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // ────────────────────────────────────────────────────────────
  //  Field validators
  // ────────────────────────────────────────────────────────────

  function validateFullname() {
    const fullname      = registerFullname.value.trim();
    const errorElement  = document.getElementById('registerFullnameError');

    if (fullname === '') {
      registerFullname.classList.remove('input-valid', 'input-error');
      errorElement.textContent = '';
      return true;
    }

    if (fullname.length < 2) {
      registerFullname.classList.add('input-error');
      registerFullname.classList.remove('input-valid');
      errorElement.textContent = 'Full name must be at least 2 characters';
      return false;
    }

    registerFullname.classList.add('input-valid');
    registerFullname.classList.remove('input-error');
    errorElement.textContent = '';
    return true;
  }

  function validateEmail() {
    const email        = registerEmail.value.trim();
    const errorElement = document.getElementById('registerEmailError');
    const isValid      = emailRegex.test(email);

    if (email === '') {
      registerEmail.classList.remove('input-valid', 'input-error');
      errorElement.textContent = '';
      return true;
    }

    if (!isValid) {
      registerEmail.classList.add('input-error');
      registerEmail.classList.remove('input-valid');
      errorElement.textContent = 'Please enter a valid email address';
      return false;
    }

    registerEmail.classList.add('input-valid');
    registerEmail.classList.remove('input-error');
    errorElement.textContent = '';
    return true;
  }

  function validatePassword() {
    const password     = registerPassword.value;
    const errorElement = document.getElementById('registerPasswordError');

    if (password === '') {
      registerPassword.classList.remove('input-valid', 'input-error');
      errorElement.textContent = '';
      return true;
    }

    if (password.length < 6) {
      registerPassword.classList.add('input-error');
      registerPassword.classList.remove('input-valid');
      errorElement.textContent = 'Password must be at least 6 characters';
      return false;
    }

    registerPassword.classList.add('input-valid');
    registerPassword.classList.remove('input-error');
    errorElement.textContent = '';
    return true;
  }

  function validateCompany() {
    const company      = registerCompany.value.trim();
    const errorElement = document.getElementById('registerCompanyError');

    if (company === '') {
      registerCompany.classList.remove('input-valid', 'input-error');
      errorElement.textContent = '';
      return true;
    }

    if (company.length < 2) {
      registerCompany.classList.add('input-error');
      registerCompany.classList.remove('input-valid');
      errorElement.textContent = 'Company name must be at least 2 characters';
      return false;
    }

    registerCompany.classList.add('input-valid');
    registerCompany.classList.remove('input-error');
    errorElement.textContent = '';
    return true;
  }

  function validateSector() {
    const sector       = registerSector.value.trim();
    const errorElement = document.getElementById('registerSectorError');

    if (sector === '') {
      registerSector.classList.remove('input-valid', 'input-error');
      errorElement.textContent = '';
      return true;
    }

    if (sector.length < 3) {
      registerSector.classList.add('input-error');
      registerSector.classList.remove('input-valid');
      errorElement.textContent = 'Please enter a valid business sector (at least 3 characters)';
      return false;
    }

    registerSector.classList.add('input-valid');
    registerSector.classList.remove('input-error');
    errorElement.textContent = '';
    return true;
  }

  function evaluatePasswordStrength() {
    const password = registerPassword.value;
    let strength   = 0;

    if (password.length >= 8)                              strength++;
    if (/[A-Z]/.test(password))                           strength++;
    if (/[a-z]/.test(password))                           strength++;
    if (/[0-9]/.test(password))                           strength++;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) strength++;

    strengthFill.classList.remove('strength-moderate', 'strength-high');

    if (strength <= 2) {
      strengthFill.style.width           = '25%';
      strengthFill.style.backgroundColor = '#dc2626';
      strengthLabel.textContent          = 'Password Strength: Insecure';
    } else if (strength <= 3) {
      strengthFill.classList.add('strength-moderate');
      strengthFill.style.width           = '50%';
      strengthFill.style.backgroundColor = '#f59e0b';
      strengthLabel.textContent          = 'Password Strength: Moderate';
    } else {
      strengthFill.classList.add('strength-high');
      strengthFill.style.width           = '100%';
      strengthFill.style.backgroundColor = '#1fb881';
      strengthLabel.textContent          = 'Password Strength: High Security';
    }
  }

  // ────────────────────────────────────────────────────────────
  //  Form submission
  // ────────────────────────────────────────────────────────────

  registerForm.addEventListener('submit', function (e) {
    e.preventDefault();

    if (isSubmitting) return;

    // Run all validators before attempting submission
    const isFullnameValid = validateFullname();
    const isEmailValid    = validateEmail();
    const isPasswordValid = validatePassword();
    const isCompanyValid  = validateCompany();
    const isSectorValid   = validateSector();

    if (!isFullnameValid || !isEmailValid || !isPasswordValid || !isCompanyValid || !isSectorValid) {
      showToast('Please fix the errors above before submitting', 'error');
      return;
    }

    // Lock form while request is in flight
    isSubmitting = true;
    registerSubmitBtn.disabled     = true;
    const originalText             = registerSubmitBtn.textContent;
    registerSubmitBtn.textContent  = 'Provisioning Channel…';
    registerSubmitBtn.style.opacity = '0.7';

    const registrationData = {
      fullname:        registerFullname.value.trim(),
      email:           registerEmail.value.trim(),
      password:        registerPassword.value,
      company_name:    registerCompany.value.trim(),
      business_sector: registerSector.value,
    };

    fetch('/ai-business-analytics-system/backend/api/register.php', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(registrationData),
    })
    .then(function (response) { return response.json(); })
    .then(function (data) {
      if (data.success) {
        showToast('Account created! Redirecting to payment…', 'success');

        // ── NEW: Route directly to payment page so new users subscribe ──
        setTimeout(function () {
          window.location.href = 'payment.html';
        }, 2000);

      } else {
        showToast(data.message || 'Registration failed. Please try again.', 'error');
        resetSubmitButton();
      }
    })
    .catch(function (error) {
      console.error('Registration error:', error);
      showToast('An error occurred. Please try again.', 'error');
      resetSubmitButton();
    });

    function resetSubmitButton() {
      isSubmitting                   = false;
      registerSubmitBtn.disabled     = false;
      registerSubmitBtn.textContent  = originalText;
      registerSubmitBtn.style.opacity = '1';
    }
  });

  // ────────────────────────────────────────────────────────────
  //  Toast notification helper
  // ────────────────────────────────────────────────────────────

  function showToast(message, type) {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;

    const icon = document.createElement('div');
    icon.className   = 'toast-icon';
    icon.textContent = type === 'success' ? '✓' : '✕';

    const messageElement = document.createElement('div');
    messageElement.className   = 'toast-message';
    messageElement.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(messageElement);
    toastContainer.appendChild(toast);

    setTimeout(function () {
      toast.classList.add('toast-show');
    }, 10);

    setTimeout(function () {
      toast.classList.add('toast-exit');
      setTimeout(function () {
        if (toastContainer.contains(toast)) {
          toastContainer.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

});   