// settings.js - Handles profile, password, email verification, and account verification

document.addEventListener('DOMContentLoaded', async () => {
  // Fetch user profile info
  const profileName = document.getElementById('profileName');
  const profileEmail = document.getElementById('profileEmail');
  const profileVerified = document.getElementById('profileVerified');
  const verifyEmailBox = document.getElementById('verifyEmailBox');
  const verifyEmailBtn = document.getElementById('verifyEmailBtn');
  const verifyStatus = document.getElementById('verifyStatus');

  // Get user info
  let user = null;
  try {
    const res = await fetch('/api/auth/status', { credentials: 'include' });
    const data = await res.json();
    if (data.isAuthenticated && data.user) {
      user = data.user;
      profileName.textContent = (user.firstName || '') + ' ' + (user.lastName || '');
      profileEmail.textContent = user.email || '';
      if (user.isEmailVerified) {
        profileVerified.textContent = 'Email Verified';
        profileVerified.classList.add('verified');
        verifyEmailBox.style.display = 'none';
      } else {
        profileVerified.textContent = 'Email Not Verified';
        profileVerified.classList.remove('verified');
        verifyEmailBox.style.display = 'block';
      }
    } else {
      window.location.href = '/login';
    }
  } catch (err) {
    profileName.textContent = 'Error';
    profileEmail.textContent = 'Error';
    profileVerified.textContent = 'Error';
  }

  // Email verification button
  if (verifyEmailBtn) {
    verifyEmailBtn.onclick = async () => {
      verifyEmailBtn.disabled = true;
      verifyEmailBtn.textContent = 'Sending...';
      try {
        const res = await fetch('/api/auth/resend-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email })
        });
        const data = await res.json();
        if (res.ok) {
          alert('Verification code sent to your email.');
        } else {
          alert(data.message || 'Failed to send verification code.');
        }
      } catch (err) {
        alert('Error sending verification code.');
      }
      verifyEmailBtn.disabled = false;
      verifyEmailBtn.textContent = 'Verify Email';
    };
  }

  // Change password form
  const changePasswordForm = document.getElementById('changePasswordForm');
  const changePasswordMsg = document.getElementById('changePasswordMsg');
  if (changePasswordForm) {
    changePasswordForm.onsubmit = async (e) => {
      e.preventDefault();
      changePasswordMsg.textContent = '';
      const currentPassword = document.getElementById('currentPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      try {
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword })
        });
        const data = await res.json();
        if (res.ok) {
          changePasswordMsg.style.color = 'var(--green)';
          changePasswordMsg.textContent = 'Password changed successfully.';
          changePasswordForm.reset();
        } else {
          changePasswordMsg.style.color = '#ffad33';
          changePasswordMsg.textContent = data.message || 'Failed to change password.';
        }
      } catch (err) {
        changePasswordMsg.style.color = '#ffad33';
        changePasswordMsg.textContent = 'Error changing password.';
      }
    };
  }

  // Account verification form
  const verifyForm = document.getElementById('verifyForm');
  if (verifyForm) {
    verifyForm.onsubmit = async (e) => {
      e.preventDefault();
      verifyStatus.textContent = 'Submitting...';
      const realName = document.getElementById('realName').value;
      const nationalId = document.getElementById('nationalId').value;
      const contactNumber = document.getElementById('contactNumber').value;
      const homeAddress = document.getElementById('homeAddress').value;
      const idUpload = document.getElementById('idUpload').files[0];
      
      if (!realName || !nationalId || !contactNumber || !homeAddress || !idUpload) {
        verifyStatus.textContent = 'Please fill in all fields and upload your ID.';
        verifyStatus.classList.remove('verified');
        return;
      }
      
      const formData = new FormData();
      formData.append('realName', realName);
      formData.append('nationalId', nationalId);
      formData.append('contactNumber', contactNumber);
      formData.append('homeAddress', homeAddress);
      formData.append('idUpload', idUpload);
      
      try {
        const res = await fetch('/api/account/verify', {
          method: 'POST',
          credentials: 'include',
          body: formData
        });
        const data = await res.json();
        if (res.ok) {
          verifyStatus.textContent = '⏳ Verification submitted! Your account will be automatically verified within 5 minutes. You will receive a confirmation email shortly.';
          verifyStatus.classList.remove('verified');
          verifyForm.reset();
          // Poll for status every 10 seconds
          const pollInterval = setInterval(() => {
            updateVerificationStatus();
            clearInterval(pollInterval);
          }, 10000);
        } else {
          verifyStatus.textContent = data.message || 'Failed to submit verification.';
          verifyStatus.classList.remove('verified');
        }
      } catch (err) {
        verifyStatus.textContent = 'Error submitting verification.';
        verifyStatus.classList.remove('verified');
      }
    };
  }

  // Fetch verification status and update every 30 seconds
  async function updateVerificationStatus() {
    try {
      const res = await fetch('/api/account/verification-status', { credentials: 'include' });
      const data = await res.json();
        if (data.verified) {
          if (verifyStatus) {
            verifyStatus.textContent = '✓ Account Verified';
            verifyStatus.classList.add('verified');
          }
          // Hide the entire verification section for verified users
          const accountVerificationSection = document.getElementById('accountVerificationSection');
          if (accountVerificationSection) accountVerificationSection.style.display = 'none';
        } else if (data.status === 'pending') {
          // Show form, hide success message (still pending)
          const verificationForm = document.getElementById('verificationForm');
          const verificationCompleted = document.getElementById('verificationCompleted');
          if (verificationForm) verificationForm.style.display = 'block';
          if (verificationCompleted) verificationCompleted.style.display = 'none';
        if (verifyStatus) {
          verifyStatus.textContent = 'Verification pending...';
          verifyStatus.classList.remove('verified');
        }
      } else {
          // Show form, hide success message (not started)
          const verificationForm = document.getElementById('verificationForm');
          const verificationCompleted = document.getElementById('verificationCompleted');
          if (verificationForm) verificationForm.style.display = 'block';
          if (verificationCompleted) verificationCompleted.style.display = 'none';
        if (verifyStatus) {
          verifyStatus.textContent = 'Not Verified';
          verifyStatus.classList.remove('verified');
        }
      }
    } catch (err) {
      if (verifyStatus) {
        verifyStatus.textContent = 'Error loading verification status.';
        verifyStatus.classList.remove('verified');
      }
    }
  }

  updateVerificationStatus();
  // Poll for status changes every 30 seconds
  setInterval(updateVerificationStatus, 30000);
});
