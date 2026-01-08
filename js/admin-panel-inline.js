// Externalized admin page script from admin.html
(function(){
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const logoutBtn = document.getElementById('logoutBtn');

  let transactionData = { deposits: [], plans: [], withdrawals: [] };

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(tabName).classList.add('active');
    });
  });

  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(()=> window.location.href='/index.html');
  });

  async function loadPendingTransactions() {
    try {
      const response = await fetch('/api/admin/pending-transactions', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to load transactions');
      transactionData = await response.json();
      renderDeposits(); renderPlans(); renderWithdrawals();
    } catch (error) {
      console.error('Error loading transactions:', error);
      const dl = document.getElementById('depositsLoading');
      if (dl) { while (dl.firstChild) dl.removeChild(dl.firstChild); const p = document.createElement('p'); p.textContent = 'Error loading transactions. Please try again.'; dl.appendChild(p); }
    }
  }

  function renderDeposits() {
    const container = document.getElementById('depositsList');
    const loading = document.getElementById('depositsLoading');
    const empty = document.getElementById('depositsEmpty');

    if (!container || !loading || !empty) return;

    if (transactionData.deposits.length === 0) {
      container.style.display = 'none'; loading.style.display = 'none'; empty.style.display = 'block'; return;
    }

    container.style.display = 'grid'; loading.style.display = 'none'; empty.style.display = 'none';
    while (container.firstChild) container.removeChild(container.firstChild);

    transactionData.deposits.forEach(dep => {
      const card = document.createElement('div'); card.className = 'transaction-card';
      const header = document.createElement('div'); header.className = 'card-header';
      const title = document.createElement('h3'); title.className = 'card-title'; title.textContent = dep.planName;
      const type = document.createElement('span'); type.className = 'card-type'; type.textContent = 'Deposit';
      header.appendChild(title); header.appendChild(type);

      const addDetail = (label, val) => { const d = document.createElement('div'); d.className='card-detail'; const l=document.createElement('span'); l.className='detail-label'; l.textContent=label; const v=document.createElement('span'); v.className='detail-value'; v.textContent=val; d.appendChild(l); d.appendChild(v); return d; };

      card.appendChild(header);
      card.appendChild(addDetail('User:', String(dep.userId || '')));
      card.appendChild(addDetail('Amount:', '$' + Number(dep.amount || 0).toFixed(2)));
      const addr = String(dep.depositAddress || ''); card.appendChild(addDetail('Address:', addr.length>20? addr.substring(0,20)+'...' : addr));
      card.appendChild(addDetail('Submitted:', new Date(dep.submittedAt).toLocaleString()));
      card.appendChild(addDetail('Proof:', String(dep.proofFileName || '')));

      const footer = document.createElement('div'); footer.className='card-footer';
      const ok = document.createElement('button'); ok.className='btn btn-approve'; ok.textContent='Approve'; ok.addEventListener('click', ()=>approveDeposit(String(dep._id)));
      const rej = document.createElement('button'); rej.className='btn btn-reject'; rej.textContent='Reject'; rej.addEventListener('click', ()=>rejectDeposit(String(dep._id)));
      footer.appendChild(ok); footer.appendChild(rej); card.appendChild(footer);
      container.appendChild(card);
    });
  }

  function renderPlans() {
    const container = document.getElementById('plansList');
    const loading = document.getElementById('plansLoading');
    const empty = document.getElementById('plansEmpty');

    if (!container || !loading || !empty) return;

    if (transactionData.plans.length === 0) {
      container.style.display = 'none';
      loading.style.display = 'none';
      empty.style.display = 'block';
      return;
    }

    container.style.display = 'grid';
    loading.style.display = 'none';
    empty.style.display = 'none';

    while (container.firstChild) container.removeChild(container.firstChild);
    transactionData.plans.forEach(plan => {
      const card = document.createElement('div'); card.className = 'transaction-card';
      const header = document.createElement('div'); header.className = 'card-header';
      const title = document.createElement('h3'); title.className = 'card-title'; title.textContent = plan.planName;
      const type = document.createElement('span'); type.className = 'card-type'; type.textContent = 'Plan';
      header.appendChild(title); header.appendChild(type);

      const addDetail = (label, val) => {
        const d = document.createElement('div'); d.className = 'card-detail';
        const l = document.createElement('span'); l.className = 'detail-label'; l.textContent = label;
        const v = document.createElement('span'); v.className = 'detail-value'; v.textContent = val;
        d.appendChild(l); d.appendChild(v); return d;
      };

      card.appendChild(header);
      card.appendChild(addDetail('User:', String(plan.userId || '')));
      card.appendChild(addDetail('Amount:', '$' + Number(plan.amount || 0).toFixed(2)));
      card.appendChild(addDetail('Type:', String(plan.planType || '')));
      card.appendChild(addDetail('Enrolled:', new Date(plan.enrolledAt).toLocaleString()));

      const footer = document.createElement('div'); footer.className = 'card-footer';
      const ok = document.createElement('button'); ok.className = 'btn btn-approve'; ok.textContent = 'Approve'; ok.addEventListener('click', () => approvePlan(String(plan._id)));
      const rej = document.createElement('button'); rej.className = 'btn btn-reject'; rej.textContent = 'Reject'; rej.addEventListener('click', () => rejectPlan(String(plan._id)));
      footer.appendChild(ok); footer.appendChild(rej); card.appendChild(footer);

      container.appendChild(card);
    });
  }

  function renderWithdrawals() {
    const container = document.getElementById('withdrawalsList');
    const loading = document.getElementById('withdrawalsLoading');
    const empty = document.getElementById('withdrawalsEmpty');

    if (!container || !loading || !empty) return;

    if (transactionData.withdrawals.length === 0) {
      container.style.display = 'none';
      loading.style.display = 'none';
      empty.style.display = 'block';
      return;
    }

    container.style.display = 'grid';
    loading.style.display = 'none';
    empty.style.display = 'none';

    while (container.firstChild) container.removeChild(container.firstChild);
    transactionData.withdrawals.forEach(with_ => {
      const card = document.createElement('div'); card.className = 'transaction-card';
      const header = document.createElement('div'); header.className = 'card-header';
      const title = document.createElement('h3'); title.className = 'card-title'; title.textContent = 'Withdrawal Request';
      const type = document.createElement('span'); type.className = 'card-type'; type.textContent = 'Withdrawal';
      header.appendChild(title); header.appendChild(type);

      const addDetail = (label, val) => {
        const d = document.createElement('div'); d.className = 'card-detail';
        const l = document.createElement('span'); l.className = 'detail-label'; l.textContent = label;
        const v = document.createElement('span'); v.className = 'detail-value'; v.textContent = val;
        d.appendChild(l); d.appendChild(v); return d;
      };

      card.appendChild(header);
      card.appendChild(addDetail('User:', String(with_.userId || '')));
      card.appendChild(addDetail('Amount:', '$' + Number(with_.amount || 0).toFixed(2)));
      const addr = String(with_.withdrawalAddress || ''); card.appendChild(addDetail('Address:', addr.length > 20 ? addr.substring(0,20) + '...' : addr));
      card.appendChild(addDetail('Network:', String(with_.network || '')));
      card.appendChild(addDetail('Submitted:', new Date(with_.submittedAt).toLocaleString()));

      const footer = document.createElement('div'); footer.className = 'card-footer';
      const ok = document.createElement('button'); ok.className = 'btn btn-approve'; ok.textContent = 'Approve'; ok.addEventListener('click', () => approveWithdrawal(String(with_._id)));
      const rej = document.createElement('button'); rej.className = 'btn btn-reject'; rej.textContent = 'Reject'; rej.addEventListener('click', () => rejectWithdrawal(String(with_._id)));
      footer.appendChild(ok); footer.appendChild(rej); card.appendChild(footer);

      container.appendChild(card);
    });
  }

  async function approveDeposit(id){ if(!confirm('Approve this deposit?')) return; try{ const response = await fetch(`/api/admin/deposits/${id}/approve`, { method:'POST', credentials:'include' }); if(response.ok){ alert('Deposit approved!'); loadPendingTransactions(); } else alert('Error approving deposit'); }catch(e){ console.error(e); alert('Error approving deposit'); } }
  async function rejectDeposit(id){ const reason = prompt('Rejection reason:'); if(!reason) return; try{ const response = await fetch(`/api/admin/deposits/${id}/reject`, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({reason}) }); if(response.ok){ alert('Deposit rejected!'); loadPendingTransactions(); } else alert('Error rejecting deposit'); }catch(e){ console.error(e); alert('Error rejecting deposit'); } }

  async function approvePlan(id) { if (!confirm('Approve this plan enrollment?')) return; try { const response = await fetch(`/api/admin/plans/${id}/approve`, { method: 'POST', credentials: 'include' }); if (response.ok) { alert('Plan approved!'); loadPendingTransactions(); } else { alert('Error approving plan'); } } catch (error) { console.error('Error:', error); alert('Error approving plan'); } }
  async function rejectPlan(id) { if (!confirm('Reject this plan enrollment?')) return; try { const response = await fetch(`/api/admin/plans/${id}/reject`, { method: 'POST', credentials: 'include' }); if (response.ok) { alert('Plan rejected!'); loadPendingTransactions(); } else { alert('Error rejecting plan'); } } catch (error) { console.error('Error:', error); alert('Error rejecting plan'); } }
  async function approveWithdrawal(id) { if (!confirm('Approve this withdrawal?')) return; try { const response = await fetch(`/api/admin/withdrawals/${id}/approve`, { method: 'POST', credentials: 'include' }); if (response.ok) { alert('Withdrawal approved!'); loadPendingTransactions(); } else { alert('Error approving withdrawal'); } } catch (error) { console.error('Error:', error); alert('Error approving withdrawal'); } }
  async function rejectWithdrawal(id) { const reason = prompt('Rejection reason:'); if (!reason) return; try { const response = await fetch(`/api/admin/withdrawals/${id}/reject`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }); if (response.ok) { alert('Withdrawal rejected!'); loadPendingTransactions(); } else { alert('Error rejecting withdrawal'); } } catch (error) { console.error('Error:', error); alert('Error rejecting withdrawal'); }


  window.addEventListener('DOMContentLoaded', loadPendingTransactions);
})();
