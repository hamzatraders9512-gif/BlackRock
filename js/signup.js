document.addEventListener('DOMContentLoaded', function() {
  initializePasswordToggles();
  const signupPassword = document.getElementById('signupPassword');
  const form = document.querySelector('.signup-form');

  // Inject password strength requirements below password field, initially hidden
  let pwStrength = attachPasswordStrength(signupPassword);
  if (pwStrength && pwStrength.container) {
    pwStrength.container.style.display = 'none';
    signupPassword.addEventListener('input', function() {
      if (signupPassword.value.length > 0 && pwStrength.container.style.display === 'none') {
        pwStrength.container.style.display = 'block';
        pwStrength.container.classList.add('visible');
      } else if (signupPassword.value.length === 0) {
        pwStrength.container.classList.remove('visible');
        setTimeout(() => {
          if (signupPassword.value.length === 0) {
            pwStrength.container.style.display = 'none';
          }
        }, 300);
      }
    });
  }

  (function() {
    const signupForm = document.getElementById('signupForm');
    if (!signupForm) {
      console.warn('signupForm not found');
      return;
    }

    // Named handler so we can call it from the button click as well
    async function handleSignupSubmit(e) {
      e.preventDefault();
      try {
        const formData = {
          firstName: signupForm.querySelector('input[name="firstName"]').value,
          lastName: signupForm.querySelector('input[name="lastName"]').value,
          email: signupForm.querySelector('input[name="email"]').value,
          password: signupForm.querySelector('input[name="password"]').value,
          confirmPassword: signupForm.querySelector('input[name="confirmPassword"]').value
        };

        // Password requirements
        if (!formData.password || formData.password.length < 8) {
          showToast('Password must be at least 8 characters.', 'error');
          return;
        }
        if (formData.password !== formData.confirmPassword) {
          showToast('Passwords do not match.', 'error');
          return;
        }

        const submitBtn = signupForm.querySelector('button[type="submit"]');
        const origText = submitBtn ? submitBtn.innerHTML : null;
        if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = 'Creating...'; }

        const response = await fetch('/api/auth/signup', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });

        const data = await response.json();
        if (response.ok) {
          console.log('Signup successful for', formData.email, data);
          // If there was a referral code in the URL, register it (best-effort)
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
            // Auto-verified (local/dev) -> go to dashboard
            window.location.href = '/dashboard';
          } else {
            // Email verification required
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
        if (submitBtn) { submitBtn.disabled = false; if (origText) submitBtn.innerHTML = origText; }
      }
    }

    signupForm.addEventListener('submit', handleSignupSubmit);

    // Also handle clicks on the submit button to ensure preventDefault runs early
    const submitButton = signupForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.addEventListener('click', (e) => {
        // If the form submit handler wasn't attached for some reason, still prevent native submit
        e.preventDefault();
        handleSignupSubmit(e);
      });
    }
  })();
});
