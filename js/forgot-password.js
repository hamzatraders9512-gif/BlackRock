// Handles forgot password form submission and UI

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('forgotForm');
  const sendBtn = document.getElementById('sendResetBtn');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.querySelector('input[name="email"]').value.trim();
    if (!email) {
      showToast('Please enter your email address', 'error');
      return;
    }

    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending...';
    }

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'If that account exists, we sent a reset link', 'success');
        // redirect to sign in after brief delay
        setTimeout(() => window.location.href = '/index.html', 3500);
      } else {
        showToast(data.message || 'Unable to send reset link', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Connection error. Try again later.', 'error');
    } finally {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send Reset Link →';
      }
    }
  });
});
