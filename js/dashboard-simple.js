// Simple dashboard: show user name, logout, and plans/deposits buttons
async function initDashboard() {
  try {
    // Fetch auth status to get user info
    const res = await fetch('/api/auth/status');
    const data = await res.json();
    
    if (!data.isAuthenticated) {
      // Not authenticated, redirect to login
      window.location.href = '/index.html';
      return;
    }

    // Display user name (both header and welcome card)
    const user = data.user;
    const userNameDisplay = document.getElementById('userNameDisplay');
    const userFullName = document.getElementById('userFullName');
    
    const firstName = user.firstName || 'User';
    const lastName = user.lastName || '';
    const fullName = (firstName + ' ' + lastName).trim();
    
    if (userNameDisplay) {
      userNameDisplay.textContent = firstName;
    }
    if (userFullName) {
      userFullName.textContent = fullName;
    }

    // Fetch and display verification status badge
    try {
      const verRes = await fetch('/api/account/verification-status', { credentials: 'include' });
      const verData = await verRes.json();
      const verificationBadge = document.getElementById('verificationBadge');
      if (verificationBadge) {
        if (verData.verified) {
          verificationBadge.innerHTML = '<span class="verification-badge" style="display:inline-block;background:linear-gradient(135deg,#15b37a,#0dd67f);color:#000;padding:4px 12px;border-radius:20px;font-size:0.85rem;font-weight:700;">✓ Verified</span>';
        } else if (verData.status === 'pending') {
          verificationBadge.innerHTML = '<span class="verification-badge" style="display:inline-block;background:rgba(255,165,0,0.2);color:#ffad33;padding:4px 12px;border-radius:20px;font-size:0.85rem;font-weight:700;border:1px solid rgba(255,165,0,0.3);">⏳ Pending Verification</span>';
        } else {
          verificationBadge.innerHTML = '<span class="verification-badge" style="display:inline-block;background:rgba(255,107,107,0.15);color:#ff6b6b;padding:4px 12px;border-radius:20px;font-size:0.85rem;font-weight:700;border:1px solid rgba(255,107,107,0.3);">Not Verified</span>';
        }
      }
    } catch (err) {
      console.error('Error fetching verification status:', err);
    }

    // Update greeting time and date
    updateGreetingAndDate();

  } catch (err) {
    console.error('Dashboard init error:', err);
    window.location.href = '/index.html';
  }

  // Setup button handlers
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      window.location.href = '/api/auth/logout';
    });
  }

  const plansBtn = document.getElementById('plansBtn');
  if (plansBtn) {
    plansBtn.addEventListener('click', () => {
      window.location.href = '/plans.html';
    });
  }

  const depositsBtn = document.getElementById('depositsBtn');
  if (depositsBtn) {
    depositsBtn.addEventListener('click', () => {
      window.location.href = 'custom-deposit.html';
    });
  }

  const withdrawBtn = document.getElementById('withdrawBtn');
  if (withdrawBtn) {
    withdrawBtn.addEventListener('click', () => {
      window.location.href = '/withdraw.html';
    });
  }

  const transactionBtn = document.getElementById('transactionBtn');
  if (transactionBtn) {
    transactionBtn.addEventListener('click', () => {
      window.location.href = '/transactions.html';
    });
  }

  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      window.location.href = '/settings.html';
    });
  }
}

function updateGreetingAndDate() {
  const now = new Date();
  const hour = now.getHours();
  
  // Determine greeting based on time of day
  let greeting = 'Good morning';
  if (hour >= 12 && hour < 17) {
    greeting = 'Good afternoon';
  } else if (hour >= 17) {
    greeting = 'Good evening';
  }
  
  const greetingTimeEl = document.getElementById('greetingTime');
  if (greetingTimeEl) {
    greetingTimeEl.textContent = greeting;
  }
  
  // Format current date
  const dateEl = document.getElementById('currentDate');
  if (dateEl) {
    const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    dateEl.textContent = now.toLocaleDateString('en-US', options);
  }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', initDashboard);
