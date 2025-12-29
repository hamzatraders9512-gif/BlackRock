// Affiliate page client logic

async function fetchAffiliateInfo() {
  try {
    const res = await fetch('/api/affiliate/info', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed fetching affiliate info');
    return await res.json();
  } catch (err) {
    console.error('Affiliate info error', err);
    return null;
  }
}

function stageForCount(count) {
  if (count > 25) return { stage: 'Platinum', reward: 10 };
  if (count === 25) return { stage: 'Gold', reward: 8 };
  if (count >= 10) return { stage: 'Silver', reward: 5 };
  return { stage: 'Bronze', reward: 2 };
}

function fmtMoney(v){ return `$${Number(v||0).toFixed(2)}`; }

async function loadAffiliate() {
  const info = await fetchAffiliateInfo();
  if (!info) return;

  const origin = window.location.origin;
  const link = info.referralLink || (origin + (info.referralCode ? (`/?ref=${info.referralCode}`) : '/'));

  document.getElementById('referralLink').textContent = link;
  document.getElementById('refCount').textContent = (info.referralsCount || 0) + ' referrals';
  document.getElementById('myBalance').textContent = fmtMoney(info.currentBalance || 0);
  document.getElementById('totalRewards').textContent = fmtMoney(info.totalReferralRewards || 0);

  const s = stageForCount(info.referralsCount || 0);
  document.getElementById('stageLabel').textContent = `Stage: ${s.stage}`;
  document.getElementById('rewardLabel').textContent = `Reward per referral: ${fmtMoney(s.reward)}`;

  // show recent referral earnings in transactions
  const txs = info.recentReferrals || [];
  const list = document.getElementById('refTxList');
  if (txs.length === 0) {
    list.innerHTML = '<div class="muted">No referral transactions yet.</div>';
  } else {
    list.innerHTML = '';
    txs.forEach(t => {
      const d = new Date(t.submittedAt || t.createdAt || Date.now());
      const el = document.createElement('div');
      el.className = 'ref-tx small';
      el.style.padding = '0.6rem';
      el.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
      el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;"><div><strong>${fmtMoney(t.amount)}</strong><div class="muted">${t.description||'Referral reward'}</div></div><div class="muted">${d.toLocaleString()}</div></div>`;
      list.appendChild(el);
    });
  }
}

function setupCopy() {
  const btn = document.getElementById('copyRefBtn');
  btn.addEventListener('click', async () => {
    const link = document.getElementById('referralLink').textContent;
    try {
      await navigator.clipboard.writeText(link);
      const msg = document.getElementById('copyMsg');
      msg.style.display = 'block';
      msg.textContent = 'Copied to clipboard';
      msg.className = 'copy-success';
      setTimeout(()=>{ msg.style.display='none'; }, 2500);
    } catch (err) {
      console.error('Copy failed', err);
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  setupCopy();
  loadAffiliate();
});
