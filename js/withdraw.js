// Withdraw Page JavaScript

// Configuration
const WITHDRAW_CONFIG = {
  MIN_AMOUNT: 50,
  MAX_AMOUNT: 1000000,
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
};

// State Management
const withdrawState = {
  balance: 0,
  withdrawalAmount: null,
  withdrawalAddress: null,
  isLoading: false
};

// DOM Elements
const elements = {
  // Balance Step
  balanceStep: document.getElementById('balanceStep'),
  availableBalance: document.getElementById('availableBalance'),
  proceedBalanceBtn: document.getElementById('proceedBalanceBtn'),
  
  // Address & Amount Step
  addressAmountStep: document.getElementById('addressAmountStep'),
  withdrawalAddress: document.getElementById('withdrawalAddress'),
  withdrawAmount: document.getElementById('withdrawAmount'),
  nextToReviewBtn: document.getElementById('nextToReviewBtn'),
  
  // Review Step
  reviewStep: document.getElementById('reviewStep'),
  reviewAmount: document.getElementById('reviewAmount'),
  reviewAddress: document.getElementById('reviewAddress'),
  confirmWithdrawBtn: document.getElementById('confirmWithdrawBtn'),
  
  // Success Step
  successStep: document.getElementById('successStep'),
  successAmount: document.getElementById('successAmount'),
  goToDashboardBtn: document.getElementById('goToDashboardBtn'),
  
  // General
  backBtn: document.getElementById('backBtn'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  loadingText: document.getElementById('loadingText'),
  toastContainer: document.getElementById('toastContainer')
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await initializeWithdraw();
  attachEventListeners();
});

/**
 * Initialize withdraw page
 */
async function initializeWithdraw() {
  try {
    // Check authentication
    const authStatus = await checkAuthenticationStatus();
    if (!authStatus.isAuthenticated) {
      showToast('Please sign in first', 'error');
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 2000);
      return;
    }

    // Fetch user's current balance
    await fetchUserBalance();
  } catch (error) {
    console.error('Initialization error:', error);
    showToast('Failed to load balance. Please refresh.', 'error');
  }
}

/**
 * Fetch user's current balance from the server
 */
async function fetchUserBalance() {
  try {
    const response = await fetch('/api/user/balance', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch balance');
    }

    const data = await response.json();
    // Accept either `balance` (legacy) or `currentBalance` (standardized) from the API
    withdrawState.balance = (typeof data.balance === 'number' ? data.balance : (typeof data.currentBalance === 'number' ? data.currentBalance : 0));
    elements.availableBalance.textContent = `${withdrawState.balance.toFixed(2)} USDT`;

    // Enable proceed button if balance is sufficient
    if (withdrawState.balance >= WITHDRAW_CONFIG.MIN_AMOUNT) {
      elements.proceedBalanceBtn.disabled = false;
    } else {
      showToast(`Insufficient balance. Minimum withdrawal is $${WITHDRAW_CONFIG.MIN_AMOUNT}`, 'error');
    }
  } catch (error) {
    console.error('Balance fetch error:', error);
    showToast('Unable to fetch balance', 'error');
  }
}

/**
 * Validate ERC20 address format
 */
function isValidERC20Address(address) {
  // ERC20 addresses should start with 0x and be 42 characters long (0x + 40 hex chars)
  const erc20Regex = /^0x[a-fA-F0-9]{40}$/;
  return erc20Regex.test(address);
}

/**
 * Validate withdrawal amount
 */
function validateWithdrawalAmount(amount) {
  const parsedAmount = parseFloat(amount);
  
  if (isNaN(parsedAmount)) {
    return { valid: false, error: 'Please enter a valid amount' };
  }
  
  if (parsedAmount < WITHDRAW_CONFIG.MIN_AMOUNT) {
    return { valid: false, error: `Minimum withdrawal is $${WITHDRAW_CONFIG.MIN_AMOUNT}` };
  }
  
  if (parsedAmount > WITHDRAW_CONFIG.MAX_AMOUNT) {
    return { valid: false, error: `Maximum withdrawal is $${WITHDRAW_CONFIG.MAX_AMOUNT}` };
  }
  
  if (parsedAmount > withdrawState.balance) {
    return { valid: false, error: `Insufficient balance. Available: $${withdrawState.balance.toFixed(2)}` };
  }
  
  return { valid: true };
}

/**
 * Validate withdrawal address
 */
function validateWithdrawalAddress(address) {
  if (!address || address.trim() === '') {
    return { valid: false, error: 'Please enter a wallet address' };
  }
  
  if (!isValidERC20Address(address)) {
    return { valid: false, error: 'Please enter a valid ERC20 address (0x...)' };
  }
  
  return { valid: true };
}

/**
 * Show step by ID
 */
function showStep(stepId) {
  const allSteps = document.querySelectorAll('.deposit-step');
  allSteps.forEach(step => {
    step.style.display = 'none';
  });
  
  const targetStep = document.getElementById(stepId);
  if (targetStep) {
    targetStep.style.display = 'block';
    // Scroll to top of content
    document.querySelector('.custom-deposit-content').scrollTop = 0;
  }
}

/**
 * Show loading overlay
 */
function showLoading(message = 'Processing...') {
  elements.loadingText.textContent = message;
  elements.loadingOverlay.style.display = 'flex';
}

/**
 * Hide loading overlay
 */
function hideLoading() {
  elements.loadingOverlay.style.display = 'none';
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

/**
 * Check authentication status
 */
async function checkAuthenticationStatus() {
  try {
    const response = await fetch('/api/auth/status', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return { isAuthenticated: false };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Auth check error:', error);
    return { isAuthenticated: false };
  }
}

/**
 * Attach event listeners
 */
function attachEventListeners() {
  // Step 1: Balance Check
  elements.proceedBalanceBtn.addEventListener('click', () => {
    showStep('addressAmountStep');
  });

  // Step 2: Address & Amount Input
  elements.withdrawalAddress.addEventListener('input', validateStep2);
  elements.withdrawAmount.addEventListener('input', validateStep2);

  elements.nextToReviewBtn.addEventListener('click', () => {
    const addressValidation = validateWithdrawalAddress(elements.withdrawalAddress.value);
    const amountValidation = validateWithdrawalAmount(elements.withdrawAmount.value);

    if (!addressValidation.valid) {
      showToast(addressValidation.error, 'error');
      return;
    }

    if (!amountValidation.valid) {
      showToast(amountValidation.error, 'error');
      return;
    }

    // Store values and show review step
    withdrawState.withdrawalAddress = elements.withdrawalAddress.value;
    withdrawState.withdrawalAmount = parseFloat(elements.withdrawAmount.value);

    // Update review step
    elements.reviewAmount.textContent = `${withdrawState.withdrawalAmount.toFixed(2)} USDT`;
    elements.reviewAddress.textContent = withdrawState.withdrawalAddress;

    showStep('reviewStep');
  });

  // Step 3: Review & Confirm
  elements.confirmWithdrawBtn.addEventListener('click', submitWithdrawal);

  // Success Step
  elements.goToDashboardBtn.addEventListener('click', () => {
    window.location.href = '/dashboard.html';
  });

  // Back button
  elements.backBtn.addEventListener('click', () => {
    window.history.back();
  });
}

/**
 * Validate Step 2 inputs
 */
function validateStep2() {
  const addressValid = isValidERC20Address(elements.withdrawalAddress.value);
  const amountValid = parseFloat(elements.withdrawAmount.value) >= WITHDRAW_CONFIG.MIN_AMOUNT;

  elements.nextToReviewBtn.disabled = !(addressValid && amountValid);
}

/**
 * Submit withdrawal request
 */
async function submitWithdrawal() {
  try {
    showLoading('Submitting withdrawal request...');

    const withdrawalData = {
      address: withdrawState.withdrawalAddress,
      amount: withdrawState.withdrawalAmount,
      network: 'ERC20'
    };

    const response = await fetch('/api/withdrawals/submit', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(withdrawalData)
    });

    hideLoading();

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Withdrawal submission failed');
    }

    const result = await response.json();

    // Show success step
    elements.successAmount.textContent = `${withdrawState.withdrawalAmount.toFixed(2)} USDT`;
    showStep('successStep');

    showToast('Withdrawal submitted successfully!', 'success');
  } catch (error) {
    hideLoading();
    console.error('Withdrawal submission error:', error);
    showToast(error.message || 'Failed to submit withdrawal', 'error');
  }
}
