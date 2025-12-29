// Externalized inline scripts from dashboard.html to comply with CSP 'self'

// Redirect to custom-deposit.html when the Deposit button is clicked
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('depositsBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        window.location.href = 'custom-deposit.html';
      });
    }

    // Initialize payment address display on dashboard
    if (typeof PAYMENT_CONFIG !== 'undefined' && PAYMENT_CONFIG.DEPOSIT_ADDRESS) {
      console.log('Deposit Address Available:', PAYMENT_CONFIG.DEPOSIT_ADDRESS);
    }
  });
})();
