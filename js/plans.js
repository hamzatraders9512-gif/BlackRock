// Plans page JavaScript - Handle plan selection and enrollment

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize payment address display
  initializePaymentAddress();
  
  // Check if we're in deposit mode (from dashboard deposit button)
  const urlParams = new URLSearchParams(window.location.search);
  const depositMode = urlParams.has('mode') && urlParams.get('mode') === 'deposit';
  
  if (depositMode) {
    showCustomDepositSection();
  }
  
  // Initialize plan buttons
  initializePlanButtons();
  
  // Check if user is authenticated
  await checkAuthenticationStatus();
});

/**
 * Initialize payment address display with QR code
 */
function initializePaymentAddress() {
  const addressElement = document.getElementById('paymentAddress');
  const qrcodeElement = document.getElementById('paymentQRCode');
  const copyBtn = document.getElementById('copyPaymentAddressBtn');
  
  if (!addressElement || !qrcodeElement) return;
  
  // Get deposit address from config
  let depositAddress = '0x1eb17E4367F8D6aAF8C3cEC631f8e01103d7A716'; // Default
  if (typeof PAYMENT_CONFIG !== 'undefined' && PAYMENT_CONFIG.DEPOSIT_ADDRESS) {
    depositAddress = PAYMENT_CONFIG.DEPOSIT_ADDRESS;
  }
  
  // Update address display
  addressElement.textContent = depositAddress;
  
  // Generate QR code
  if (typeof QRCode !== 'undefined') {
    try {
      const qrStyle = (typeof PAYMENT_CONFIG !== 'undefined' && PAYMENT_CONFIG.QR_STYLE) ? PAYMENT_CONFIG.QR_STYLE : {
        colorDark: '#00d084',
        colorLight: 'rgba(22, 33, 62, 0.5)'
      };
      
      new QRCode(qrcodeElement, {
        text: `ethereum:${depositAddress}`,
        width: 200,
        height: 200,
        colorDark: qrStyle.colorDark,
        colorLight: qrStyle.colorLight,
        correctLevel: QRCode.CorrectLevel.H
      });
    } catch (error) {
      console.error('QR Code generation error:', error);
    }
  }
  
  // Handle copy button
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(depositAddress).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        copyBtn.style.background = '#4CAF50';
        
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.background = 'var(--green)';
        }, 2000);
      }).catch(() => {
        copyBtn.textContent = 'Failed to copy';
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
        }, 2000);
      });
    });
  }
}

/**
 * Show custom deposit section and hide plans
 */
function showCustomDepositSection() {
  const section = document.getElementById('customDepositSection');
  const grid = document.querySelector('.plans-grid');
  const footer = document.querySelector('.plans-footer');
  
  if (section) section.style.display = 'block';
  if (grid) grid.style.display = 'none';
  if (footer) footer.style.display = 'none';
  
  // Setup custom deposit form
  const form = document.getElementById('customDepositForm');
  const cancelBtn = document.getElementById('cancelCustomDeposit');
  
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('customAmount').value);
      
      if (isNaN(amount) || amount < 10) {
        showToast('Please enter a valid amount (minimum $10)', 'error');
        return;
      }
      
      // Store custom deposit amount in session
      sessionStorage.setItem('customDepositAmount', amount);
      
      // Redirect to deposit page with custom mode
      window.location.href = `/deposit.html?mode=custom&amount=${amount}`;
    });
  }
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      window.location.href = '/dashboard';
    });
  }
}

/**
 * Initialize plan button click handlers
 */
function initializePlanButtons() {
  const planButtons = document.querySelectorAll('.plan-btn');
  
  planButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const planType = btn.getAttribute('data-plan');
      const planAmount = btn.getAttribute('data-amount');
      // Directly redirect to deposit.html with plan and amount
      window.location.href = `/deposit.html?plan=${encodeURIComponent(planType)}&amount=${encodeURIComponent(planAmount)}`;
    });
  });

  // Fallback: event delegation in case buttons are added later or listeners fail to attach
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.plan-btn');
    if (!btn) return;
    e.preventDefault();
    const planType = btn.getAttribute('data-plan');
    const planAmount = btn.getAttribute('data-amount');
    window.location.href = `/deposit.html?plan=${encodeURIComponent(planType)}&amount=${encodeURIComponent(planAmount)}`;
  });
}

/**
 * Handle plan selection and enrollment
 */
async function handlePlanSelection(planType) {
  try {
    // Check if user is authenticated
    const statusRes = await fetch('/api/auth/status');
    const statusData = await statusRes.json();
    
    if (!statusData.isAuthenticated) {
      showToast('Please sign in to select a plan', 'info', 5000, 'Sign In Required');
      // Redirect to login after a short delay
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 1500);
      return;
    }
    
    // Plan enrollment data with numeric amounts for direct deposit flow
    const planDetails = {
      basic: {
        name: 'Basic',
        amount: 50,
        price: '$50',
        features: [
          'Portfolio dashboard',
          'Daily 4% Growth',
          '14 days Withdrawal Period',
          'Basic Customer Support',
          'Limited Statistics',
          'Deposit and Withdrawals with Crypto'
        ]
      },
      standard: {
        // displayed name for the middle plan is 'Stranded' per user request
        name: 'Stranded',
        amount: 100,
        price: '$100',
        features: [
          'Portfolio dashboard',
          'Daily 6% Growth',
          '7 days Withdrawal Period',
          'Priority support',
          'Unlimited Statistics',
          'Fast Transaction',
          'Deposit and Withdrawals with Crypto'
        ]
      },
      premium: {
        name: 'Premium',
        amount: 500,
        price: 'Starting with $500 or above',
        features: [
          'Portfolio dashboard',
          'Daily 8% Growth',
          'On Demand Withdrawals',
          'No Limits for Withdrawals',
          'Instant Withdrawals',
          'Instant Transaction',
          'Personal account manager',
          '24/7 Support'
        ]
      }
    };
    
    const selectedPlan = planDetails[planType];
    
    if (!selectedPlan) {
      showToast('Invalid plan selected', 'error');
      return;
    }
    
    // Show enrollment confirmation
    showEnrollmentConfirmation(planType, selectedPlan, statusData.user);
    
  } catch (error) {
    console.error('Error handling plan selection:', error);
    showToast('An error occurred. Please try again.', 'error');
  }
}

/**
 * Show enrollment confirmation modal/message
 */
function showEnrollmentConfirmation(planType, planDetails, user) {
  // Populate and open modal dialog instead of toast
  const backdrop = document.getElementById('planModalBackdrop');
  const modalPlanName = document.getElementById('modalPlanName');
  const modalPlanPrice = document.getElementById('modalPlanPrice');
  const modalFeatures = document.getElementById('modalFeatures');
  const modalConfirm = document.getElementById('modalConfirm');
  const modalCancel = document.getElementById('modalCancel');

  if (!backdrop || !modalPlanName || !modalConfirm) {
    // Fallback: if modal isn't present, proceed with enrollment
    proceedWithEnrollment(planType, planDetails, user);
    return;
  }

  modalPlanName.textContent = planDetails.name;
  modalPlanPrice.textContent = planDetails.price;

  // build feature list
  modalFeatures.innerHTML = '';
  (planDetails.features || []).forEach(f => {
    const div = document.createElement('div');
    div.className = 'feature-item';
    div.style.fontSize = '0.95rem';
    div.innerHTML = `<svg class="feature-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span style="margin-left:8px">${f}</span>`;
    modalFeatures.appendChild(div);
  });

  // ensure only one handler is attached
  modalConfirm.onclick = async function onConfirm() {
    // disable to prevent double submits
    modalConfirm.disabled = true;
    modalConfirm.textContent = 'Proceeding to Deposit...';
    
    // Store plan data in session storage
    const planData = {
      type: planType,
      name: planDetails.name,
      price: planDetails.price,
      amount: planDetails.amount || null,
      features: planDetails.features
    };
    sessionStorage.setItem('selectedPlan', JSON.stringify(planData));
    
    // Redirect to custom deposit page with amount (pre-fills amount and skips step 1)
    const amountQuery = planData.amount ? `&amount=${encodeURIComponent(planData.amount)}` : '';
    window.location.href = `/custom-deposit.html?plan=${planType}${amountQuery}`;
  };

  modalCancel.onclick = function onCancel() {
    closeModal();
  };

  // close on backdrop click
  backdrop.onclick = function (e) {
    if (e.target === backdrop) closeModal();
  };

  function closeModal() {
    backdrop.classList.remove('active');
  }

  // open
  backdrop.classList.add('active');
}

/**
 * Proceed with actual enrollment
 */
async function proceedWithEnrollment(planType, planDetails, user) {
  try {
    // In a real app, this would call a payment processing endpoint
    // For now, we'll simulate a backend call and save the plan selection
    
    const enrollmentData = {
      userId: user.email,
      planType: planType,
      planName: planDetails.name,
      price: planDetails.price,
      enrolledAt: new Date().toISOString(),
      features: planDetails.features
    };
    
    // Call backend to save enrollment (placeholder endpoint)
    // In production, this would process payment via Stripe, PayPal, etc.
    const response = await fetch('/api/plans/enroll', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(enrollmentData)
    }).catch(() => {
      // If endpoint doesn't exist, continue anyway for demo
      return null;
    });
    
    // Show success message
    showToast(
      `Successfully enrolled in ${planDetails.name} plan! You now have access to all features.`,
      'success',
      5000,
      'Enrollment Complete'
    );
    
    // Redirect to dashboard after success
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 2000);
    
  } catch (error) {
    console.error('Enrollment error:', error);
    showToast('Enrollment failed. Please contact support.', 'error');
  }
}
async function checkAuthenticationStatus() {
  try {
    const response = await fetch('/api/auth/status');
    const data = await response.json();

    if (!data.isAuthenticated) {
      // User is not logged in, could show a prompt or allow them to browse plans
      console.log('User not authenticated, but can still view plans');
    }
  } catch (error) {
    console.error('Error checking authentication status:', error);
  }
}
