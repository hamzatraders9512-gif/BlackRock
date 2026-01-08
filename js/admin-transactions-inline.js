// Externalized from admin-transactions.html
let allTransactions = [];
let currentFilter = 'pending';

document.addEventListener('DOMContentLoaded', () => {
  loadTransactions();
  setupEventListeners();
});

function setupEventListeners() {
  const logout = document.getElementById('logoutBtn'); if (logout) logout.addEventListener('click', () => { window.location.href = '/api/auth/logout'; });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      renderTransactions();
    });
  });
}

async function loadTransactions() {
  try {
    const response = await fetch('/api/transactions/pending', { credentials: 'include' });
    if (!response.ok) throw new Error('Failed to load transactions');
    allTransactions = await response.json();
    document.getElementById('loadingState').style.display = 'none';
    updateStats();
    renderTransactions();
  } catch (error) {
    console.error('Error loading transactions:', error);
    showToast('Failed to load transactions', 'error');
    const ls = document.getElementById('loadingState');
    if (ls) { while (ls.firstChild) ls.removeChild(ls.firstChild); const p = document.createElement('p'); p.textContent = '❌ Failed to load transactions'; ls.appendChild(p); }
  }
}

function updateStats() {
  const pending = allTransactions.filter(t => t.approvalStatus === 'pending').length;
  const approvedToday = allTransactions.filter(t => {
    if (t.approvalStatus !== 'approved') return false;
    const date = new Date(t.approvedAt);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }).length;
  const approvedTotal = allTransactions.filter(t => t.approvalStatus === 'approved').length;

  const elPending = document.getElementById('pendingCount'); if (elPending) elPending.textContent = pending;
  const elToday = document.getElementById('approvedTodayCount'); if (elToday) elToday.textContent = approvedToday;
  const elTotal = document.getElementById('approvedTotalCount'); if (elTotal) elTotal.textContent = approvedTotal;
}

function renderTransactions() {
  const filtered = filterTransactions(allTransactions, currentFilter);

  if (filtered.length === 0) {
    const tc = document.getElementById('tableContainer'); if (tc) tc.style.display = 'none';
    const es = document.getElementById('emptyState'); if (es) es.style.display = 'block';
    return;
  }

  const tc = document.getElementById('tableContainer'); if (tc) tc.style.display = 'block';
  const es = document.getElementById('emptyState'); if (es) es.style.display = 'none';

  const tbody = document.getElementById('transactionsBody');
  if (tbody) {
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    filtered.forEach(tx => {
      const tr = document.createElement('tr');
      const tdUser = document.createElement('td'); tdUser.textContent = String(tx.userId || ''); tr.appendChild(tdUser);
      const tdType = document.createElement('td'); const strongType = document.createElement('strong'); strongType.textContent = String((tx.type || '').toUpperCase()); tdType.appendChild(strongType); tr.appendChild(tdType);
      const tdAmt = document.createElement('td'); const strongAmt = document.createElement('strong'); strongAmt.textContent = '$' + Number(tx.amount || 0).toFixed(2); tdAmt.appendChild(strongAmt); tr.appendChild(tdAmt);
      const tdDate = document.createElement('td'); tdDate.textContent = formatDate(new Date(tx.submittedAt)); tr.appendChild(tdDate);

      const tdStatus = document.createElement('td'); const spanStatus = document.createElement('span'); spanStatus.className = 'status-badge status-' + String(tx.approvalStatus || 'pending'); spanStatus.textContent = String((tx.approvalStatus || 'pending').toUpperCase()); tdStatus.appendChild(spanStatus);
      if (tx.approvalStatus === 'rejected' && tx.rejectionReason) { const rej = document.createElement('div'); rej.className = 'reject-reason'; rej.textContent = String(tx.rejectionReason); tdStatus.appendChild(rej); }
      tr.appendChild(tdStatus);

      const tdActions = document.createElement('td'); const wrap = document.createElement('div'); wrap.className = 'action-btns';
      if (tx.approvalStatus === 'pending') {
        const approveBtn = document.createElement('button'); approveBtn.className = 'btn btn-approve'; approveBtn.textContent = 'Approve'; approveBtn.addEventListener('click', () => approveTransaction(String(tx._id)));
        const rejectBtn = document.createElement('button'); rejectBtn.className = 'btn btn-reject'; rejectBtn.textContent = 'Reject'; rejectBtn.addEventListener('click', () => rejectTransaction(String(tx._id)));
        wrap.appendChild(approveBtn); wrap.appendChild(rejectBtn);
      } else {
        const dash = document.createElement('span'); dash.style.color = 'rgba(255,255,255,0.5)'; dash.textContent = '-'; wrap.appendChild(dash);
      }
      tdActions.appendChild(wrap); tr.appendChild(tdActions);

      tbody.appendChild(tr);
    });
  }
}

function filterTransactions(transactions, filter) { if (filter === 'all') return transactions; return transactions.filter(t => t.approvalStatus === filter); }

async function approveTransaction(transactionId) {
  try {
    const btn = event.target; btn.disabled = true; btn.textContent = 'Approving...';
    const response = await fetch(`/api/transactions/${transactionId}/approve`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
    if (!response.ok) throw new Error('Failed to approve transaction');
    const data = await response.json(); showToast('✅ Transaction approved successfully');
    const tx = allTransactions.find(t => t._id === transactionId); if (tx) { tx.approvalStatus = 'approved'; tx.approvedAt = new Date(); tx.approvedBy = 'admin'; }
    updateStats(); renderTransactions();
  } catch (error) {
    console.error('Error approving transaction:', error); showToast('Failed to approve transaction', 'error'); event.target.disabled = false; event.target.textContent = 'Approve';
  }
}

async function rejectTransaction(transactionId) {
  const reason = prompt('Enter rejection reason:'); if (!reason) return;
  try {
    const btn = event.target; btn.disabled = true; btn.textContent = 'Rejecting...';
    const response = await fetch(`/api/transactions/${transactionId}/reject`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
    if (!response.ok) throw new Error('Failed to reject transaction');
    const data = await response.json(); showToast('✅ Transaction rejected');
    const tx = allTransactions.find(t => t._id === transactionId);
    if (tx) { tx.approvalStatus = 'rejected'; tx.rejectedAt = new Date(); tx.rejectionReason = reason; tx.rejectedBy = 'admin'; }
    updateStats(); renderTransactions();
  } catch (error) {
    console.error('Error rejecting transaction:', error); showToast('Failed to reject transaction', 'error'); event.target.disabled = false; event.target.textContent = 'Reject';
  }
}

function formatDate(date) { return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

function showToast(message, type = 'success') { const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message; document.body.appendChild(toast); setTimeout(() => { toast.remove(); }, 3000); }
