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

// Apply optional brand palette overrides if provided on window.AFFILIATE_BRAND
function applyBrandOverrides(){
  try{
    const b = window.AFFILIATE_BRAND || null;
    if(!b) return;
    const root = document.documentElement;
    if(b.brandBg) root.style.setProperty('--brand-bg', b.brandBg);
    if(b.brandForeground) root.style.setProperty('--brand-foreground', b.brandForeground);
    if(b.brandPrimary) root.style.setProperty('--brand-primary', b.brandPrimary);
    if(b.brandAccent) root.style.setProperty('--brand-accent', b.brandAccent);
    if(b.silver1) root.style.setProperty('--silver-1', b.silver1);
    if(b.silver2) root.style.setProperty('--silver-2', b.silver2);
    if(b.gold1) root.style.setProperty('--gold-1', b.gold1);
    if(b.gold2) root.style.setProperty('--gold-2', b.gold2);
    if(b.plat1) root.style.setProperty('--plat-1', b.plat1);
    if(b.plat2) root.style.setProperty('--plat-2', b.plat2);
  }catch(e){console.error('Brand override apply failed', e);}
}

function stageForCount(count) {
  // tiers: <10 => Silver ($5), >=10 & <25 => Gold ($7), >=25 => Platinum ($10)
  if (count >= 25) return { stage: 'Platinum', reward: 10 };
  if (count >= 10) return { stage: 'Gold', reward: 7 };
  return { stage: 'Silver', reward: 5 };
}

function fmtMoney(v){ return `$${Number(v||0).toFixed(2)}`; }

// Chart instance holder
let referralChart = null;

function renderChart(series) {
  if (!window.Chart) return;
  const canvas = document.getElementById('refChart');
  if (!canvas) return;
  const labels = series.map(s => s.label);
  const data = series.map(s => s.value);
  const cfg = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Daily Registrations',
        data,
        borderColor: 'rgba(124,92,231,0.95)',
        backgroundColor: 'rgba(108,92,231,0.08)',
        tension: 0.24,
        pointRadius: 2,
        pointHoverRadius: 4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      plugins: { legend: { display: false } },
      scales: {
        x: { type: 'category', grid: { display: false }, ticks: { color: '#bfcbdc' } },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#bfcbdc', stepSize: 1, precision: 0 }
        }
      }
    }
  };

  try {
    // Reuse existing chart instance to avoid expensive destroy/create cycles
    if (referralChart) {
      referralChart.options.animation = { duration: 0 };
      // keep axes config in sync when updating
      referralChart.options.scales = cfg.options.scales;
      referralChart.data.labels = labels;
      if (referralChart.data.datasets && referralChart.data.datasets[0]) {
        referralChart.data.datasets[0].data = data;
      } else {
        referralChart.data.datasets = cfg.data.datasets;
      }
      referralChart.update();
      return;
    }

    // Chart.js accepts either the canvas element or 2d context
    try {
      // ensure sensible y-axis max based on data
      try {
        const maxV = Math.max(1, ...(Array.isArray(data) ? data.map(n => Number(n) || 0) : [0]));
        cfg.options.scales.y.suggestedMax = Math.ceil(maxV + (maxV > 0 ? 1 : 0));
      } catch (e) {}
      referralChart = new Chart(canvas.getContext ? canvas.getContext('2d') : canvas, cfg);
    } catch (errCtx) {
      // Fallback: try passing the element directly
      referralChart = new Chart(canvas, cfg);
    }
  } catch (err) {
    console.error('Chart render error', err);
  }
}

// QR rendering removed from affiliate dashboard (handled elsewhere if needed)

// animate numeric counters (supports currency string or plain int)
function animateNumber(el, target, isCurrency){
  if(!el) return;
  const start = 0; const dur = 900; const startTs = performance.now();
  const parseTarget = () => { if(isCurrency) return Number(String(target).replace(/[^0-9.-]+/g,'')); return Number(target) || 0 };
  const tVal = parseTarget();
  function step(now){
    const p = Math.min(1, (now - startTs) / dur);
    if (isCurrency) {
      const v = (tVal - start) * p + start;
      el.textContent = fmtMoney(v);
    } else {
      const v = Math.round((tVal - start) * p + start);
      el.textContent = el.dataset.rawSuffix ? (v + el.dataset.rawSuffix) : v + ' referrals';
    }
    if(p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// QR download removed from affiliate dashboard

function animateStage(stageEl){
  if(!stageEl) return;
  stageEl.classList.remove('pop');
  void stageEl.offsetWidth;
  stageEl.classList.add('pop');
}

async function loadAffiliate() {
  const info = await fetchAffiliateInfo();
  if (!info) {
    console.warn('No affiliate info available; using fallback display');
    const fallbackNameEl = document.getElementById('userFullName');
    if (fallbackNameEl) fallbackNameEl.textContent = 'Welcome back, User 👋';
    return;
  }

  const origin = window.location.origin;
  // Direct users to the signup page with the referral code when sharing
  const link = info.referralLink || (origin + (info.referralCode ? (`/signup.html?ref=${info.referralCode}`) : '/signup.html'));

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // Render referral link inside a monospace container for easy copying
  const refEl = document.getElementById('referralLink');
  if (refEl) {
    while (refEl.firstChild) refEl.removeChild(refEl.firstChild);
    const span = document.createElement('span');
    span.className = 'link-text';
    span.textContent = link;
    refEl.appendChild(span);
  }
  // QR rendering removed from this dashboard

  // animate numbers
  const rcEl = document.getElementById('refCount');
  if(rcEl){ rcEl.dataset.rawSuffix = ' referrals'; animateNumber(rcEl, info.referralsCount || 0, false); }
  const balEl = document.getElementById('myBalance');
  if(balEl) animateNumber(balEl, info.currentBalance || 0, true);
  // show total commission in the Silver card
  const trEl = document.getElementById('totalCommission') || document.getElementById('totalRewards');
  if(trEl) animateNumber(trEl, info.totalReferralRewards || 0, true);

  // Integrate with header/dashboard if present
  const uname = (info.user && (info.user.fullName || info.user.name)) || info.username || info.email || 'User';
  // Show full name (prefer `realName` if present) as primary and email as secondary on the profile card
  let fullName = (info.user && (info.user.realName || info.user.fullName || info.user.name || info.user.displayName)) || info.username || '';
  if (!fullName) fullName = 'User';
  const emailValue = (info.user && info.user.email) || info.email || '';
  setText('userNameDisplay', fullName);
  // also populate alternate id used on the standalone affiliate page
  setText('userFullName', `Welcome back, ${fullName} 👋`);
  const shortFirst = (fullName || 'User').split(' ')[0];
  setText('userShortName', shortFirst);
  const emailEl = document.getElementById('userEmailDisplay');
  if (emailEl) emailEl.textContent = emailValue;
  // set header user name and document title to the real full name if available
  const headerNameEl = document.getElementById('headerUserName');
  if (headerNameEl) headerNameEl.textContent = fullName;
  try { if (fullName) document.title = `${fullName} — Affiliate`; } catch (e) {}
  // populate header avatar and account menu
  const headerAvatarImg = document.getElementById('headerAvatarImg');
  const headerAvatarFallback = document.querySelector('.header-avatar-fallback');
  if (headerAvatarImg && info.user && info.user.avatarUrl) {
    headerAvatarImg.src = info.user.avatarUrl;
    headerAvatarImg.style.display = 'inline-block';
    if (headerAvatarFallback) headerAvatarFallback.style.display = 'none';
    headerAvatarImg.onerror = () => { headerAvatarImg.style.display = 'none'; if (headerAvatarFallback) headerAvatarFallback.style.display = 'inline-flex'; };
  } else {
    if (headerAvatarImg) headerAvatarImg.style.display = 'none';
    if (headerAvatarFallback) headerAvatarFallback.style.display = 'inline-flex';
  }
  const accountMenuName = document.getElementById('accountMenuName');
  const accountMenuEmail = document.getElementById('accountMenuEmail');
  if (accountMenuName) accountMenuName.textContent = fullName;
  if (accountMenuEmail) accountMenuEmail.textContent = emailValue;

  // If the full name is generic or missing, try the auth status endpoint as a fallback
  if (fullName && /user/i.test(fullName)) {
    try {
      const res = await fetch('/api/auth/status', { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        if (d && d.isAuthenticated && d.user) {
          const u = d.user;
          const name = (u.realName || u.fullName || (u.firstName ? (u.firstName + (u.lastName ? (' ' + u.lastName) : '')) : '') || u.email || '').trim();
          if (name) {
            fullName = name;
            setText('userNameDisplay', fullName);
            setText('userFullName', `Welcome back, ${fullName} 👋`);
            setText('userShortName', (fullName || 'User').split(' ')[0]);
            if (accountMenuName) accountMenuName.textContent = fullName;
            if (headerNameEl) headerNameEl.textContent = fullName;
            try { if (fullName) document.title = `${fullName} — Affiliate`; } catch (e) {}
          }
        }
      }
    } catch (e) { /* ignore fallback errors */ }
  }

  // Account menu toggle behavior
  const acctToggle = document.getElementById('accountToggle');
  const acctMenu = document.getElementById('accountMenu');
  function closeAcctMenu(){ if (acctMenu){ acctMenu.style.display='none'; acctToggle && acctToggle.setAttribute('aria-expanded','false'); acctMenu.setAttribute('aria-hidden','true'); } }
  function openAcctMenu(){ if (acctMenu){ acctMenu.style.display='block'; acctToggle && acctToggle.setAttribute('aria-expanded','true'); acctMenu.setAttribute('aria-hidden','false'); } }
  if (acctToggle){ acctToggle.addEventListener('click', (e)=>{ e.stopPropagation(); if (acctMenu && acctMenu.style.display === 'block') closeAcctMenu(); else openAcctMenu(); }); }
  // close when clicking outside
  document.addEventListener('click', (e)=>{ if (acctMenu){ const wrap = document.querySelector('.account-menu-wrap'); if (wrap && !wrap.contains(e.target)) closeAcctMenu(); } });
  // avatar image if available, otherwise fallback to initial
  const avatarEl = document.getElementById('avatarEl');
  const avatarImg = document.getElementById('avatarImg');
  const avatarFallback = avatarEl ? avatarEl.querySelector('.avatar-fallback') : null;
  const initial = (uname || 'U').trim().charAt(0).toUpperCase();
  if (avatarImg && info.user && info.user.avatarUrl) {
    avatarImg.src = info.user.avatarUrl;
    avatarImg.style.display = 'block';
    if (avatarEl) avatarEl.classList.add('has-image');
    avatarImg.onerror = () => {
      avatarImg.style.display = 'none';
      if (avatarEl) avatarEl.classList.remove('has-image');
      if (avatarFallback) avatarFallback.textContent = initial;
    };
  } else {
    if (avatarImg) avatarImg.style.display = 'none';
    if (avatarEl) avatarEl.classList.remove('has-image');
    if (avatarFallback) avatarFallback.textContent = initial;
  }
  if (document.getElementById('balanceValue')) {
    setText('balanceValue', fmtMoney(info.currentBalance || 0));
  }
  if (document.getElementById('earningsValue')) {
    // show referral earnings in analytics card if available
    setText('earningsValue', fmtMoney(info.totalReferralRewards || 0));
  }

  const s = stageForCount(info.referralsCount || 0);
  const stageEl = document.getElementById('stageBadgeTop');
  function setStageBadge(stageName){
    if(!stageEl) return;
    const key = String(stageName||'').toLowerCase();
    stageEl.dataset.tier = key;
    const SPRITE = '/assets/badges-sprite.svg';
    // Build SVG icon and label without innerHTML
    while (stageEl.firstChild) stageEl.removeChild(stageEl.firstChild);
    try {
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.className = 'stage-icon';
      svg.setAttribute('viewBox', '0 0 120 120');
      svg.setAttribute('width', '22');
      svg.setAttribute('height', '22');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      const useEl = document.createElementNS(svgNS, 'use');
      useEl.setAttribute('href', SPRITE + '#icon-' + key);
      svg.appendChild(useEl);
      const spanLabel = document.createElement('span');
      spanLabel.textContent = stageName;
      stageEl.appendChild(svg);
      stageEl.appendChild(spanLabel);
    } catch (e) {
      stageEl.textContent = stageName;
    }
    stageEl.className = 'stage-badge ' + key + ' small';
    stageEl.classList.remove('pop'); void stageEl.offsetWidth; stageEl.classList.add('pop');
    stageEl.classList.toggle('pulse', key === 'platinum');
  }
  setStageBadge(s.stage);
  const rewardLabelEl = document.getElementById('rewardLabel');
  if (rewardLabelEl) {
    // hide the amount when reward is zero (avoid showing "$0")
    if (Number(s.reward) <= 0) {
      rewardLabelEl.textContent = 'Reward per referral';
      const rewardAmountElSilent = document.querySelector('.reward-amount') || document.getElementById('rewardValue');
      if (rewardAmountElSilent) rewardAmountElSilent.textContent = '';
    } else {
      rewardLabelEl.textContent = `Reward per referral: `;
      const rewardAmountElSet = document.querySelector('.reward-amount') || document.getElementById('rewardValue');
      if (rewardAmountElSet) rewardAmountElSet.textContent = fmtMoney(s.reward);
    }
  }

  // Update big referral count and short user name
  const refBig = document.getElementById('refCountBig');
  if (refBig) refBig.textContent = (info.referralsCount || 0);
  const shortName = document.getElementById('userShortName');
  if (shortName) shortName.textContent = (fullName || 'User').split(' ')[0];

  // Reward / tier panel (ensure tier area shows the reward when non-zero)
  const rewardAmountElPanel = document.querySelector('.reward-amount');
  if (rewardAmountElPanel) {
    if (Number(s.reward) > 0) rewardAmountElPanel.textContent = fmtMoney(s.reward);
    else rewardAmountElPanel.textContent = '';
  }
  const tierNameEl = document.getElementById('tierName'); if (tierNameEl) tierNameEl.textContent = s.stage;
  const tierFill = document.getElementById('tierProgress');
  if (tierFill) {
    // compute progress towards next tier
    const count = Number(info.referralsCount || 0);
    let pct = 0;
    if (count >= 25) pct = 100;
    else if (count >= 10) pct = Math.round(((count - 10) / (25 - 10)) * 100);
    else pct = Math.round((count / 10) * 100);
    tierFill.style.width = Math.min(100, Math.max(0, pct)) + '%';
  }

  // show recent referral earnings in transactions
  const txs = info.recentReferrals || [];
  // Render recent referrals table (helper)
  function renderRecentReferrals(rows) {
    const list = document.getElementById('refTxList');
    if (!list) return;
    // remove any loading/empty placeholder
    list.querySelectorAll('.recent-empty, .recent-item').forEach(n=>n.remove());
    if (!rows || rows.length === 0) {
      const e = document.createElement('div'); e.className='recent-empty muted'; e.textContent='No recent referrals.'; list.appendChild(e); return;
    }
    rows.forEach(t => {
      const d = new Date(t.submittedAt || t.createdAt || Date.now());
      const user = (typeof t.user === 'string' && t.user) || (t.user && (t.user.email || t.user.name)) || t.email || t.username || '—';
      const dateStr = d.toLocaleDateString(undefined, {day:'2-digit',month:'short',year:'numeric'});
      const statusRaw = (t.status || t.approvalStatus || (t.settled ? 'Active' : 'pending')) || 'pending';
      const status = String(statusRaw).charAt(0).toUpperCase() + String(statusRaw).slice(1);
      const reward = (typeof t.amount === 'number' ? fmtMoney(t.amount) : (t.amount ? fmtMoney(t.amount) : (t.reward ? fmtMoney(t.reward) : '-')));

      const item = document.createElement('div');
      item.className = 'recent-item';

      const colUser = document.createElement('div'); colUser.className='col col-user';
      const avatar = document.createElement('div'); avatar.className='user-avatar';
      const initials = (user || 'U').split(' ').slice(0,2).map(s=>s.charAt(0)).join('').toUpperCase().slice(0,2);
      avatar.textContent = initials;
      const uname = document.createElement('div'); uname.className='user-name'; uname.textContent = user;
      colUser.appendChild(avatar); colUser.appendChild(uname);

      const colDate = document.createElement('div'); colDate.className='col col-date'; colDate.textContent = dateStr;

      const colStatus = document.createElement('div'); colStatus.className='col col-status';
      const span = document.createElement('span'); span.className = 'status-pill status-' + String(statusRaw).toLowerCase(); span.textContent = status; colStatus.appendChild(span);

      const colReward = document.createElement('div'); colReward.className='col col-reward'; colReward.textContent = reward;

      item.appendChild(colUser); item.appendChild(colDate); item.appendChild(colStatus); item.appendChild(colReward);
      list.appendChild(item);
    });
  }
  // sanitize simple text for table cells to avoid accidental markup
  function escapeHtml(str){ return String(str||'').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s])); }
  renderRecentReferrals(txs);

  // Setup Server-Sent Events to receive realtime affiliate updates
  function applyAffiliateSnapshot(data) {
    try {
      if (!data) return;
      if (data.referralsCount !== undefined) {
        const el = document.getElementById('refCountBig'); if (el) el.textContent = data.referralsCount;
      }
      if (data.totalReferralRewards !== undefined) {
        const tc = document.getElementById('totalCommission'); if (tc) animateNumber(tc, data.totalReferralRewards, true);
      }
      if (data.referralLink) {
        const refEl = document.getElementById('referralLink');
        if (refEl) {
          while (refEl.firstChild) refEl.removeChild(refEl.firstChild);
          const sp = document.createElement('span'); sp.className = 'link-text'; sp.textContent = data.referralLink; refEl.appendChild(sp);
        }
      }
      if (data.recentReferrals) renderRecentReferrals(data.recentReferrals);
      if (data.stage) {
        try { setStageBadge(data.stage); } catch (e) {}
      }
      // If chart trend provided, attempt to render
      if (data.referralTrend && Array.isArray(data.referralTrend)) {
        try { renderChart(data.referralTrend.map(p => ({ label: p.label, value: p.count }))); } catch (e) {}
      }
    } catch (e) { console.error('applyAffiliateSnapshot', e); }
  }

  function setupAffiliateStream(){
    try{
      if (typeof EventSource === 'undefined') return;
      const es = new EventSource('/api/affiliate/stream');
      es.addEventListener('affiliate_init', (ev)=>{ try{ const d = JSON.parse(ev.data); applyAffiliateSnapshot(d); }catch(e){console.error(e);} });
      es.addEventListener('affiliate_update', (ev)=>{ try{ const d = JSON.parse(ev.data); applyAffiliateSnapshot(d); }catch(e){console.error(e);} });
      es.addEventListener('error', (ev)=>{ try{ if (es.readyState === EventSource.CLOSED) { es.close(); setTimeout(setupAffiliateStream, 8000); } }catch(e){} });
    }catch(e){ console.warn('SSE not available', e); }
  }
  // start SSE so recent referrals update in near realtime
  setupAffiliateStream();

  // Build a simple 7-day series from recent referrals or provided stats
  let series = [];
  if (info.referralTrend && Array.isArray(info.referralTrend)) {
    series = info.referralTrend.map(p => ({ label: p.label, value: p.count }));
  } else {
    // compute last 7 days counts
    const days = Array.from({length:7}).map((_,i)=>{
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return { label: d.toLocaleDateString(undefined, {month:'short',day:'numeric'}), value: 0 };
    });
    txs.forEach(t => {
      const d = new Date(t.submittedAt || t.createdAt || Date.now());
      const key = d.toLocaleDateString();
      for (let s of days) {
        const sd = new Date(s.label + ' ' + (new Date()).getFullYear());
        // use coarse matching by comparing month/day strings
        if (d.toLocaleDateString(undefined, {month:'short',day:'numeric'}) === s.label) {
          s.value += 1;
          break;
        }
      }
    });
    series = days;
  }

  // Render chart if Chart.js is available
  setTimeout(()=>{ renderChart(series); }, 80);
}

function setupCopy() {
  const btn = document.getElementById('copyRefBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const linkEl = document.getElementById('referralLink');
    const linkText = linkEl ? (linkEl.querySelector('.link-text') ? linkEl.querySelector('.link-text').textContent : linkEl.textContent) : '';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(linkText);
      } else {
        // Fallback for older browsers
        const ta = document.createElement('textarea');
        ta.value = linkText; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      const msg = document.getElementById('copyMsg');
      if (msg) {
        msg.style.display = 'block';
        msg.textContent = 'Copied to clipboard';
        msg.className = 'copy-success';
        setTimeout(()=>{ msg.style.display='none'; }, 2500);
      }
    } catch (err) {
      console.error('Copy failed', err);
    }
  });
}

function setupShare() {
  const btn = document.getElementById('shareRefBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const linkEl = document.getElementById('referralLink');
    const url = linkEl ? (linkEl.querySelector('.link-text') ? linkEl.querySelector('.link-text').textContent : linkEl.textContent) : '';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join Uneeq', text: 'Sign up with my referral link', url });
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        const msg = document.getElementById('copyMsg');
        if (msg) { msg.style.display = 'block'; msg.textContent = 'Link copied (share fallback)'; setTimeout(()=>{ msg.style.display='none'; },2500); }
      } else {
        alert('Share is not supported on this device.');
      }
    } catch (err) { console.error('Share failed', err); }
  });
}

// Inline QR popover: render, toggle, download, close
function renderInlineQR(link){
    try{
      const wrap = document.getElementById('qrInline');
      if(!wrap) return;
      while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
      const cleanLink = String(link||'').trim();
      if(window.QRCode && cleanLink){
        try{
          new QRCode(wrap, { text: cleanLink, width: 180, height: 180, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H });
        }catch(e){
          new QRCode(wrap, { text: cleanLink, width: 180, height: 180, colorDark: '#000000', colorLight: '#ffffff' });
        }
      } else {
        wrap.textContent = 'QR unavailable';
        wrap.style.color = '#333';
        wrap.style.fontSize = '13px';
      }
    }catch(e){console.error('renderInlineQR', e);}  
}

function setupQRButton(){
  const btn = document.getElementById('qrBtn');
  const pop = document.getElementById('qrPopover');
  const closeBtn = document.getElementById('closeQrInline');
  const dlBtn = document.getElementById('downloadQrInline');
  if(!btn || !pop) return;
  const getLink = ()=>{ const linkEl = document.getElementById('referralLink'); return linkEl ? (linkEl.querySelector('.link-text') ? linkEl.querySelector('.link-text').textContent : linkEl.textContent) : ''; };
  btn.addEventListener('click', (e)=>{
    e.preventDefault();
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    if(expanded){ pop.hidden = true; btn.setAttribute('aria-expanded','false'); }
    else { const link = getLink(); renderInlineQR(link); pop.hidden = false; btn.setAttribute('aria-expanded','true'); }
  });
  // close popover when clicking outside
  document.addEventListener('click', (ev)=>{
    try{
      if (!pop) return;
      const target = ev.target;
      if (pop.hidden) return;
      if (!pop.contains(target) && !btn.contains(target)) {
        pop.hidden = true; btn.setAttribute('aria-expanded','false');
      }
    }catch(e){ }
  });
  if(closeBtn) closeBtn.addEventListener('click', ()=>{ pop.hidden = true; btn.setAttribute('aria-expanded','false'); });
  if(dlBtn) dlBtn.addEventListener('click', ()=>{
    try{
      const link = getLink(); if(!link){ alert('Referral link unavailable'); return; }
      const tmp = document.createElement('div'); tmp.style.position='fixed'; tmp.style.left='-9999px'; tmp.style.top='-9999px'; document.body.appendChild(tmp);
      if(window.QRCode) {
        try{ new QRCode(tmp, { text: link, width: 320, height: 320, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H }); }
        catch(e){ new QRCode(tmp, { text: link, width: 320, height: 320, colorDark: '#000000', colorLight: '#ffffff' }); }
      }
        setTimeout(()=>{
        try{
          const img = tmp.querySelector('img'); const canvas = tmp.querySelector('canvas');
          if(img && img.src){ const a=document.createElement('a'); a.href=img.src; a.download='referral-qr.png'; document.body.appendChild(a); a.click(); a.remove(); }
          else if(canvas){ const data = canvas.toDataURL('image/png'); const a=document.createElement('a'); a.href=data; a.download='referral-qr.png'; document.body.appendChild(a); a.click(); a.remove(); }
          else alert('QR not available for download');
        }catch(e){ console.error('QR download error', e); alert('Failed to download QR'); }
        try{ while(tmp.firstChild) tmp.removeChild(tmp.firstChild); tmp.remove(); }catch(e){}
      },220);
    }catch(e){ console.error(e); }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  setupCopy();
  setupShare();
  setupQRButton();
  // QR controls removed from affiliate dashboard
  // apply any brand overrides before rendering
  applyBrandOverrides();
  // initial load
  // load affiliate info; catch and log errors to help debug missing UI
  loadAffiliate().catch(err => { console.error('loadAffiliate failed', err); });

  // Ensure user header is populated; if affiliate info didn't include a name,
  // try auth status as a fallback so the welcome header always shows.
  (async function ensureUserHeader(){
    try{
      const headerEl = document.getElementById('userFullName');
      if (!headerEl) return;
      // if header already has non-placeholder content, do nothing
      const current = (headerEl.textContent || '').trim();
      if (current && !/user/i.test(current) && current !== 'Welcome back, User 👋') return;
      // call auth status endpoint to obtain the user's real name
      const res = await fetch('/api/auth/status', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.isAuthenticated && data.user) {
        const u = data.user;
        const name = (u.realName || u.fullName || (u.firstName ? (u.firstName + (u.lastName ? (' ' + u.lastName) : '')) : '') || u.email || 'User').trim();
        headerEl.textContent = `Welcome back, ${name} 👋`;
      }
    }catch(e){ /* ignore fallback errors */ }
  })();
  // refresh affiliate data periodically to keep dashboard realtime-ish
  try { window.__affiliateRefreshInterval = setInterval(() => { loadAffiliate().catch?.(()=>{}); }, 15000); } catch(e){}
});
