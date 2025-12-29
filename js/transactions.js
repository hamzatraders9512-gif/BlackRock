/**
 * TRANSACTIONS HISTORY PAGE - IMPROVED LOGIC
 * 
 * Key Fixes:
 * 1. Properly fetches and displays pending transactions
 * 2. Robust data normalization from API response
 * 3. Proper filtering by status (all, pending, approved, rejected)
 * 4. Real-time polling for status updates
 * 5. Better error handling and loading states
 * 6. Auto-refresh balance when transactions are processed
 */

// STATE
let allTransactions = [];
let currentFilter = 'all';
let pollInterval = null;
let userBalance = 0;

// DOM ELEMENTS
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const transactionsList = document.getElementById('transactionsList');
// filter tabs will be queried when DOM is ready

// ============ UTILITIES ============

/**
 * Refresh user balance from server
 */
async function refreshUserBalance() {
  try {
    const response = await fetchWithTimeout('/api/user/refresh-balance', {
      credentials: 'include'
    }, 10000);

    if (response.ok) {
      const data = await response.json();
      userBalance = data.balance.currentBalance;
      
      // Update any balance display elements on the page if they exist
      const balanceElements = document.querySelectorAll('[data-balance]');
      if (balanceElements.length > 0) {
        balanceElements.forEach(el => {
          el.textContent = `$${userBalance.toFixed(2)}`;
        });
      }
      
      console.log('✅ Balance refreshed:', userBalance);
      return data.balance;
    }
  } catch (error) {
    console.error('❌ Error refreshing balance:', error);
  }
  return null;
}

/**
 * Normalize transaction from API response
 * Handles different API response formats
 */
function normalizeTransaction(tx) {
  if (!tx) return null;

  return {
    id: tx.id || tx._id || 'unknown',
    _id: tx._id || tx.id || 'unknown',
    type: tx.type || 'unknown',
    amount: parseFloat(tx.amount) || 0,
    status: tx.status || tx.approvalStatus || 'pending',
    approvalStatus: tx.approvalStatus || tx.status || 'pending',
    submittedAt: tx.submittedAt || tx.createdAt || new Date().toISOString(),
    createdAt: tx.createdAt || tx.submittedAt || new Date().toISOString(),
    approvedAt: tx.approvedAt || null,
    rejectionReason: tx.rejectionReason || null,
    description: tx.description || '',
    details: tx.details || {}
  };
}

/**
 * Fetch with timeout to prevent hanging requests
 */
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// ============ LOAD TRANSACTIONS ============
async function loadTransactions() {
  try {
    console.log('📥 Loading transactions from API...');
    console.log('📍 URL:', window.location.origin + '/api/transactions/my');
    loadingState.style.display = 'block';
    emptyState.style.display = 'none';
    transactionsList.style.display = 'none';

    // Fetch all transactions
    const response = await fetchWithTimeout('/api/transactions/my', {
      credentials: 'include'
    }, 12000);

    console.log('📡 Response status:', response.status, response.statusText);

    if (response.status === 401) {
      console.warn('⚠️ Not authenticated - redirecting to login');
      window.location.href = '/index.html';
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API error text:', errorText);
      throw new Error(`API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ API response received. Type:', Array.isArray(data) ? 'Array' : typeof data);
    console.log('✅ Raw response:', JSON.stringify(data, null, 2));

    // Normalize transactions
    if (Array.isArray(data)) {
      allTransactions = data.map(tx => normalizeTransaction(tx));
    } else {
      console.warn('⚠️ Response is not an array, treating as empty');
      allTransactions = [];
    }

    console.log('✅ Normalized transactions count:', allTransactions.length);

    // Render
    renderTransactions();
    
    // Refresh balance in background
    await refreshUserBalance();

    // Start polling for updates
    startPolling(10000);
  } catch (error) {
    console.error('❌ Error loading transactions:', error);
    loadingState.style.display = 'none';
    emptyState.style.display = 'flex';
  }
}

// ============ RENDER TRANSACTIONS ============
function renderTransactions() {
  try {
    console.log('🎨 Rendering transactions. Current filter:', currentFilter);

    // Apply filter
    const filtered = applyFilters(allTransactions, currentFilter);
    console.log('📊 Filtered count:', filtered.length);

    loadingState.style.display = 'none';

    if (filtered.length === 0) {
      console.log('📭 No transactions to display, showing empty state');
      emptyState.style.display = 'flex';
      transactionsList.style.display = 'none';
      return;
    }

    // Create cards
    transactionsList.innerHTML = '';
    filtered.forEach(tx => {
      const card = createTransactionCard(tx);
      transactionsList.appendChild(card);
    });

    emptyState.style.display = 'none';
    transactionsList.style.display = 'grid';
    console.log('✅ Rendered', filtered.length, 'transaction cards');
  } catch (error) {
    console.error('❌ Error rendering transactions:', error);
  }
}

// ============ FILTER TRANSACTIONS ============
function applyFilters(transactions, filter) {
  if (!Array.isArray(transactions)) return [];

  console.log(`🔍 Applying filter: ${filter} on ${transactions.length} transactions`);

  switch (filter) {
    case 'pending':
      return transactions.filter(tx => tx.status === 'pending' || tx.approvalStatus === 'pending');

    case 'approved':
      return transactions.filter(tx => tx.status === 'approved' || tx.approvalStatus === 'approved');

    case 'rejected':
      return transactions.filter(tx => tx.status === 'rejected' || tx.approvalStatus === 'rejected');

    case 'deposit':
      return transactions.filter(tx => tx.type === 'deposit');

    case 'withdrawal':
      return transactions.filter(tx => tx.type === 'withdrawal');

    case 'plan':
      return transactions.filter(tx => tx.type === 'plan');

    case 'earnings':
      return transactions.filter(tx => tx.type === 'earnings');

    case 'all':
    default:
      return transactions;
  }
}

// ============ CREATE TRANSACTION CARD ============
function createTransactionCard(tx) {
  const card = document.createElement('div');
  card.className = 'transaction-card';

  // Format date
  const date = new Date(tx.submittedAt);
  const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();

  // Status badge class
  const statusClass = (tx.status || tx.approvalStatus || '').toLowerCase();

  // Type icon
  let typeIcon = '💳';
  if (tx.type === 'withdrawal') typeIcon = '💸';
  if (tx.type === 'plan') typeIcon = '📊';
  if (tx.type === 'earnings') typeIcon = '📈';

  card.innerHTML = `
    <div class="card-header">
      <div class="card-type">
        <span class="type-icon">${typeIcon}</span>
        <span class="type-name">${(tx.type || 'transaction').toUpperCase()}</span>
      </div>
      <div class="card-status status-${statusClass}">
        ${(tx.status || tx.approvalStatus || 'pending').toUpperCase()}
      </div>
    </div>
    <div class="card-body">
      <div class="card-amount">
        <span class="label">Amount</span>
        <span class="value">$${(tx.amount || 0).toFixed(2)}</span>
      </div>
      <div class="card-date">
        <span class="label">Submitted</span>
        <span class="value">${formattedDate}</span>
      </div>
      ${tx.type === 'earnings' && tx.details && tx.details.sourceTxId ? `
      <div class="card-source">
        <span class="label">Source</span>
        <span class="value">${tx.details.sourceTxId}</span>
      </div>
      ` : ''}
      ${tx.description ? `
      <div class="card-description">
        <span class="label">Description</span>
        <span class="value">${tx.description}</span>
      </div>
      ` : ''}
      ${tx.rejectionReason ? `
      <div class="card-rejection">
        <span class="label">Reason</span>
        <span class="value">${tx.rejectionReason}</span>
      </div>
      ` : ''}
    </div>
  `;

  return card;
}

// ============ POLLING ============
function startPolling(interval = 10000) {
  console.log('⏱️ Starting polling interval:', interval, 'ms');

  if (pollInterval) {
    clearInterval(pollInterval);
  }

  pollInterval = setInterval(() => {
    console.log('🔄 Polling for updates...');
    loadTransactions();
  }, interval);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log('⏹️ Polling stopped');
  }
}

// ============ FILTER TABS ============
function setupFilterTabs() {
  console.log('🔧 Setting up filter tabs');
  const tabs = document.querySelectorAll('#filterTabs .filter-tab');

  tabs.forEach(tab => {
    tab.addEventListener('click', function () {
      // Remove active class from all tabs
      tabs.forEach(t => t.classList.remove('active'));

      // Add active class to clicked tab
      this.classList.add('active');

      // Get filter value
      currentFilter = this.getAttribute('data-filter') || 'all';
      console.log('🎯 Filter changed to:', currentFilter);

      // Re-render
      renderTransactions();
    });
  });

  // Set first tab as active
  if (tabs.length > 0) {
    tabs[0].classList.add('active');
  }
}

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 DOMContentLoaded - Initializing transactions page');

  setupFilterTabs();
  loadTransactions();

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    stopPolling();
  });
});

console.log('✅ transactions.js loaded and ready');
