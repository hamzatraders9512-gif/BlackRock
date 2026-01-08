// Handles reset password page logic (moved from inline script for CSP compliance)

function getQueryParams() {
  const params = {};
  location.search.replace(/^[?#]/, '').split('&').forEach(pair => {
    if (!pair) return;
    const parts = pair.split('=');
    params[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || '');
  });
  return params;
}

document.addEventListener('DOMContentLoaded', () => {
  const params = getQueryParams();
  const tokenField = document.getElementById('tokenField');
  const emailField = document.getElementById('emailField');
  if (params.token) tokenField.value = params.token;
  if (params.email) emailField.value = params.email;

  // initialize password toggle if available
  if (typeof initializePasswordToggles === 'function') {
    initializePasswordToggles();
  }

  // attach password strength UI if available
  const newPasswordInput = document.getElementById('newPassword');
  if (typeof attachPasswordStrength === 'function' && newPasswordInput) {
    attachPasswordStrength(newPasswordInput);
  }

  const form = document.getElementById('resetForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = tokenField.value;
    const email = emailField.value;
    const pw = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmPassword').value;

    if (!pw || pw.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }
    if (pw !== confirm) {
      showToast('Passwords do not match', 'error');
      return;
    }

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, newPassword: pw })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'Password reset successful', 'success');
        setTimeout(() => window.location.href = '/index.html', 2000);
      } else {
        showToast(data.message || 'Unable to reset password', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Connection error. Try again later.', 'error');
    }
  });
});
