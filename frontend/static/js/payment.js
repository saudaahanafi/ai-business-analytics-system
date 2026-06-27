// =============================================================
// static/js/payment.js
// AI Business Analytics System — Payment Page Logic
// =============================================================

document.addEventListener('DOMContentLoaded', function () {

  // ── DOM references ──────────────────────────────────────────
  const payBtn         = document.getElementById('payBtn');
  const payBtnText     = document.getElementById('payBtnText');
  const payBtnSpinner  = document.getElementById('payBtnSpinner');
  const cardNameInput  = document.getElementById('cardName');
  const cardNumber     = document.getElementById('cardNumber');
  const cardExpiry     = document.getElementById('cardExpiry');
  const cardCvc        = document.getElementById('cardCvc');
  const planRadios     = document.querySelectorAll('input[name="plan"]');

  // Map each plan key to its display label for the pay button
  const planMeta = {
    monthly: { label: 'Pay $10 — Activate Now'  },
    annual:  { label: 'Pay $99 — Activate Now'  },
  };

  let isSubmitting = false;

  // ── Update pay button label when plan is switched ───────────
  planRadios.forEach(function (radio) {
    radio.addEventListener('change', function () {
      payBtnText.textContent = planMeta[this.value].label;
    });
  });

  // Set initial button label to match the default checked plan (annual)
  const initialPlan = document.querySelector('input[name="plan"]:checked');
  if (initialPlan) {
    payBtnText.textContent = planMeta[initialPlan.value].label;
  }

  // ── Input formatting: card number (spaces every 4 digits) ───
  cardNumber.addEventListener('input', function () {
    let raw = this.value.replace(/\D/g, '').substring(0, 16);
    this.value = raw.match(/.{1,4}/g)?.join(' ') || raw;
  });

  // ── Input formatting: expiry (MM / YY) ─────────────────────
  cardExpiry.addEventListener('input', function () {
    let raw = this.value.replace(/\D/g, '').substring(0, 4);
    if (raw.length > 2) {
      raw = raw.slice(0, 2) + ' / ' + raw.slice(2);
    }
    this.value = raw;
  });

  // ── Input formatting: CVC (digits only) ────────────────────
  cardCvc.addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').substring(0, 4);
  });

  // ── Client-side validation ──────────────────────────────────
  function validate() {
    const name   = cardNameInput.value.trim();
    const number = cardNumber.value.replace(/\s/g, '');
    const expiry = cardExpiry.value.replace(/[\s/]/g, '');
    const cvc    = cardCvc.value.trim();

    if (!name || name.length < 2) {
      showToast('Please enter the cardholder name.', 'error');
      cardNameInput.focus();
      return false;
    }

    if (number.length !== 16 || !/^\d{16}$/.test(number)) {
      showToast('Please enter a valid 16-digit card number.', 'error');
      cardNumber.focus();
      return false;
    }

    if (expiry.length !== 4 || !/^\d{4}$/.test(expiry)) {
      showToast('Please enter a valid expiry date (MM / YY).', 'error');
      cardExpiry.focus();
      return false;
    }

    // Basic expiry sanity check
    const month = parseInt(expiry.slice(0, 2), 10);
    const year  = parseInt('20' + expiry.slice(2), 10);
    const now   = new Date();
    if (month < 1 || month > 12 || year < now.getFullYear() ||
       (year === now.getFullYear() && month < now.getMonth() + 1)) {
      showToast('Your card appears to be expired.', 'error');
      cardExpiry.focus();
      return false;
    }

    if (cvc.length < 3) {
      showToast('Please enter a valid CVC (3–4 digits).', 'error');
      cardCvc.focus();
      return false;
    }

    return true;
  }

  // ── Pay button click handler ────────────────────────────────
  payBtn.addEventListener('click', async function () {
    if (isSubmitting) return;

    if (!validate()) return;

    // Confirm a plan is selected (should always be — annual is default)
    const selectedPlan = document.querySelector('input[name="plan"]:checked')?.value;
    if (!selectedPlan) {
      showToast('Please select a subscription plan.', 'error');
      return;
    }

    // ── Lock UI ─────────────────────────────────────────────
    isSubmitting = true;
    payBtn.disabled = true;
    payBtnText.textContent = 'Processing…';
    payBtnSpinner.classList.remove('hidden');

    // ── Payment token ────────────────────────────────────────
    // PRODUCTION NOTE:
    // Replace this mock token with a real token from your payment
    // gateway SDK (e.g. Stripe.js createToken / createPaymentMethod).
    // Raw card data should NEVER be sent to your own backend.
    const paymentToken = 'tok_prototype_' + Date.now();

    try {
      const response = await fetch(
        '/ai-business-analytics-system/backend/api/payment.php',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payment_token: paymentToken,
            plan: selectedPlan,   // 'monthly' or 'annual'
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        showToast('Subscription activated! Redirecting to dashboard…', 'success');
        setTimeout(function () {
          window.location.href = 'frontend/templates/dashboard.html';  
        }, 2000);
      } else {
        // Handle specific HTTP error codes
        if (response.status === 401) {
          showToast('Your session expired. Please log in again.', 'error');
          setTimeout(function () {
            window.location.href = 'login.html';
          }, 2000);
        } else {
          showToast(data.message || 'Payment failed. Please try again.', 'error');
          resetButton();
        }
      }

    } catch (err) {
      console.error('Payment fetch error:', err);
      showToast('Network error. Please check your connection and try again.', 'error');
      resetButton();
    }
  });

  // ── Reset button to its original state ─────────────────────
  function resetButton() {
    isSubmitting = false;
    payBtn.disabled = false;
    payBtnSpinner.classList.add('hidden');
    // Restore the label for whichever plan is currently selected
    const currentPlan = document.querySelector('input[name="plan"]:checked')?.value || 'annual';
    payBtnText.textContent = planMeta[currentPlan].label;
  }

  // ── Toast notification helper ───────────────────────────────
  function showToast(message, type) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;

    const icon = document.createElement('div');
    icon.className = 'toast-icon';
    icon.textContent = type === 'success' ? '✓' : '✕';

    const msg = document.createElement('div');
    msg.className = 'toast-message';
    msg.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(msg);
    container.appendChild(toast);

    // Animate in
    setTimeout(function () {
      toast.classList.add('toast-show');
    }, 10);

    // Animate out and remove
    setTimeout(function () {
      toast.classList.add('toast-exit');
      setTimeout(function () {
        if (container.contains(toast)) {
          container.removeChild(toast);
        }
      }, 300);
    }, 3500);
  }

});   
document.addEventListener('DOMContentLoaded', function() {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const messageDiv = document.getElementById('subscriptionStatusMessage');

    if (messageDiv && status) {
        let message = '';
        let bgColor = '#fff3cd';
        let borderColor = '#ffc107';
        let textColor = '#856404';

        if (status === 'expired') {
            message = '⏰ Your subscription has expired. Please renew your plan to continue using AI Business Analytics.';
        } else if (status === 'inactive') {
            message = '⚠️ Your subscription is currently inactive. Please activate your plan to regain access.';
        }

        if (message) {
            messageDiv.textContent = message;
            messageDiv.style.display = 'block';
            messageDiv.style.backgroundColor = bgColor;
            messageDiv.style.borderColor = borderColor;
            messageDiv.style.color = textColor;
            messageDiv.style.padding = '15px';
            messageDiv.style.borderRadius = '8px';
            messageDiv.style.marginBottom = '20px';
            messageDiv.style.border = '1px solid ' + borderColor;
        }
    }
});      