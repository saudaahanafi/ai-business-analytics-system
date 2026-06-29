// =============================================================
// static/js/register.js
// AI Business Analytics System — Registration Page Logic
// Original technalities fully preserved.
// Addition: password visibility toggle wired to new HTML button.
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

  // ── Password visibility toggle (new UI, same input) ─────────
  const passwordToggle = document.getElementById('passwordToggle');
  if (passwordToggle) {
    passwordToggle.addEventListener('click', function () {
      const isHidden = registerPassword.type === 'password';
      registerPassword.type = isHidden ? 'text' : 'password';
      // Swap icon: eye-off when visible, eye when hidden
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

    if (password.length >= 8)                                          strength++;
    if (/[A-Z]/.test(password))                                        strength++;
    if (/[a-z]/.test(password))                                        strength++;
    if (/[0-9]/.test(password))                                        strength++;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password))      strength++;

    strengthFill.classList.remove('strength-moderate', 'strength-high');

    if (strength <= 2) {
      strengthFill.style.width           = '25%';
      strengthFill.style.backgroundColor = '#ef4444';
      strengthLabel.textContent          = 'Password Strength: Insecure';
    } else if (strength <= 3) {
      strengthFill.classList.add('strength-moderate');
      strengthFill.style.width           = '55%';
      strengthFill.style.backgroundColor = '#f59e0b';
      strengthLabel.textContent          = 'Password Strength: Moderate';
    } else {
      strengthFill.classList.add('strength-high');
      strengthFill.style.width           = '100%';
      strengthFill.style.backgroundColor = '#10b981';
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
    registerSubmitBtn.disabled = true;

    const btnText    = document.getElementById('submitBtnText');
    const btnArrow   = document.getElementById('submitArrow');
    const btnSpinner = document.getElementById('submitSpinner');

    if (btnText)    btnText.textContent = 'Provisioning Channel…';
    if (btnArrow)   btnArrow.classList.add('hidden');
    if (btnSpinner) btnSpinner.classList.remove('hidden');

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
      isSubmitting               = false;
      registerSubmitBtn.disabled = false;
      if (btnText)    btnText.textContent = 'Create Account';
      if (btnArrow)   btnArrow.classList.remove('hidden');
      if (btnSpinner) btnSpinner.classList.add('hidden');
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

    setTimeout(function () { toast.classList.add('toast-show'); }, 10);

    setTimeout(function () {
      toast.classList.add('toast-exit');
      setTimeout(function () {
        if (toastContainer.contains(toast)) toastContainer.removeChild(toast);
      }, 300);
    }, 3000);
  }

});    