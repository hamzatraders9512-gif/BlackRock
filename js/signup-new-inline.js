// Externalized from signup_new.html
(function(){
  document.addEventListener('DOMContentLoaded', function() {
    initializePasswordToggles();
    const signupPassword = document.getElementById('signupPassword');
    attachPasswordStrength(signupPassword);

    (function() {
      const signupForm = document.getElementById('signupForm');
      if (!signupForm) return console.warn('signupForm not found');

      async function handleSignupSubmit(e) {
        e.preventDefault();
        try {
          const formData = {
            firstName: signupForm.querySelector('input[placeholder="Enter your first name"]').value,
            lastName: signupForm.querySelector('input[placeholder="Enter your last name"]').value,
            email: signupForm.querySelector('input[type="email"]').value,
            password: signupForm.querySelector('input[type="password"]').value
          };

          if (!formData.password || formData.password.length < 8) {
            showToast('Password must be at least 8 characters.', 'error');
            return;
          }

          const submitBtn = signupForm.querySelector('button[type="submit"]');
          const origText = submitBtn ? submitBtn.textContent : null;
          if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating...'; }

          const response = await fetch('/api/auth/signup', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
          });

          const data = await response.json();
          if (response.ok) {
            try {
              const urlParams = new URLSearchParams(window.location.search);
              const ref = urlParams.get('ref');
              if (ref && data.userId) {
                fetch('/api/affiliate/register', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ refCode: ref, referredUserId: data.userId })
                }).catch(err => console.warn('Referral register failed', err));
              }
            } catch (e) {}

            if (data.isEmailVerified) {
              window.location.href = '/dashboard';
            } else {
              window.location.href = `/verify-email.html?email=${encodeURIComponent(formData.email)}`;
            }
          } else {
            console.warn('Signup failed', data);
            showToast(data.message || 'Signup failed. Please try again.', 'error');
          }
        } catch (err) {
          console.error('Signup error:', err);
          showToast('An error occurred. Please try again.', 'error');
        } finally {
          const submitBtn = signupForm.querySelector('button[type="submit"]');
          if (submitBtn) { submitBtn.disabled = false; if (origText) submitBtn.textContent = origText; }
        }
      }

      signupForm.addEventListener('submit', handleSignupSubmit);
      const submitBtn = signupForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.addEventListener('click', (e) => { e.preventDefault(); handleSignupSubmit(e); });
    })();

    const googleBtn = document.querySelector('.google-btn');
    googleBtn?.addEventListener('click', () => { window.location.href = '/api/auth/google'; });
  });
})();
