// Dashboard interactive logic: fetch user, deposits, plans and render chart
let chart = null;
let chartData = {
  labels: [],
  datasets: [{
    label: 'Balance',
    data: [],
    borderColor: 'rgba(21,179,122,0.9)',
    backgroundColor: 'rgba(21,179,122,0.08)',
    fill: true,
    tension: 0.25,
    pointRadius: 0
  }]
};

async function initDashboard() {
  // Fetch auth status
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();
    if (!data.isAuthenticated) return window.location.href = '/index.html';

    const user = data.user;
    
    // Add Deposit button click handler
    const depositBtn = document.getElementById('depositsBtn');
    if (depositBtn) {
      depositBtn.addEventListener('click', () => {
        window.location.href = 'custom-deposit.html';
      });
    }

    // Add Withdraw button click handler
    const withdrawBtn = document.getElementById('withdrawBtn');
    if (withdrawBtn) {
      withdrawBtn.addEventListener('click', () => {
        window.location.href = 'withdraw.html';
      });
    }

    // Add Transactions button click handler
    const transactionBtn = document.getElementById('transactionBtn');
    if (transactionBtn) {
      transactionBtn.addEventListener('click', () => {
        window.location.href = 'transactions.html';
      });
    }

    // Fetch plans and deposits
    await loadPlanAndDeposits(user.email);

    // Setup real-time simulated growth
    initializeChart();
    startRealtimeSimulation();
    
    // FIX: Start periodic balance refresh from server
    startBalanceRefresh();
    // Schedule a one-hour delayed balance/chart refresh to capture later updates
    scheduleHourlyChartRefreshOnce();
  } catch (err) {
    console.error('Dashboard init error', err);
    window.location.href = '/index.html';
  }
}

// Fetch fresh stats once after one hour and update chart/balance displays
function scheduleHourlyChartRefreshOnce() {
  const ONE_HOUR_MS = 60 * 60 * 1000;
  setTimeout(async () => {
    try {
      const statsRes = await fetch('/api/user/stats');
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.balance && statsData.balance.currentBalance !== undefined) {
          const serverBalance = statsData.balance.currentBalance;
          updateBalanceDisplays(serverBalance);
          updateChartWithBalance(serverBalance);
          console.log('✓ Hourly balance/chart refresh completed:', serverBalance);
        }
      }
    } catch (err) {
      console.warn('Hourly chart refresh failed:', err);
    }
  }, ONE_HOUR_MS);
}

async function loadPlanAndDeposits(email) {
  try {
    // Active plans
    const plansRes = await fetch('/api/plans/my');
    if (!plansRes.ok) {
      console.warn('Plans fetch failed:', plansRes.status, plansRes.statusText);
    }
    const plans = plansRes.ok ? await plansRes.json() : [];
    const activePlanEl = document.getElementById('activePlan');
    if (activePlanEl) activePlanEl.textContent = (plans && plans.length>0) ? plans[0].planName : 'None';

    // Deposits
    const depsRes = await fetch('/api/deposits/my');
    if (!depsRes.ok) {
      console.warn('Deposits fetch failed:', depsRes.status, depsRes.statusText);
    }
    const deps = depsRes.ok ? await depsRes.json() : [];
    const totalDeposits = deps.reduce((s,d)=>s+(d.amount||0),0);

    // Estimated daily profit will be computed after fetching server balance

    // FIX: Fetch actual user balance from server (includes earnings)
    let actualBalance = totalDeposits;
    try {
      const statsRes = await fetch('/api/user/stats');
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.balance && statsData.balance.currentBalance) {
          actualBalance = statsData.balance.currentBalance;
          console.log('✓ Loaded real balance from server:', actualBalance);
        }
      }
    } catch (err) {
      console.warn('Could not fetch user stats, using deposits as balance:', err);
    }

    // Compute estimated daily profit using currentBalance and weighted-average ROI
    function getDepositROI(dep) {
      const pt = (dep.planType || '').toString().toLowerCase();
      const amount = Number(dep.amount || 0);
      if (pt === 'basic') return 4; // 4% daily
      if (pt === 'standard') return 6; // 6% daily
      if (pt === 'premium') return 8; // 8% daily
      // fallback: custom thresholds
      if (amount < 99) return 4;
      if (amount < 499) return 6;
      return 8;
    }

    const approvedDeps = deps.filter(d => (d.approvalStatus === 'approved' || d.status === 'approved'));
    const totalApprovedAmount = approvedDeps.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    let weightedAvgROI = 0;
    if (totalApprovedAmount > 0) {
      const weightedSum = approvedDeps.reduce((s, d) => s + (Number(d.amount || 0) * (getDepositROI(d) || 0)), 0);
      weightedAvgROI = weightedSum / totalApprovedAmount;
    } else if (approvedDeps.length > 0) {
      weightedAvgROI = approvedDeps.reduce((s, d) => s + (getDepositROI(d) || 0), 0) / approvedDeps.length;
    }

    const estimatedDailyProfit = Number(actualBalance || 0) * (weightedAvgROI / 100);
    const estEl = document.getElementById('estimatedDailyProfitValue');
    if (estEl) estEl.textContent = `$${(estimatedDailyProfit || 0).toFixed(2)}`;

    // Update new UI stat fields if present
    const assetEl = document.getElementById('assetValue');
    if (assetEl) assetEl.textContent = totalDeposits.toFixed(0);

    const yearlyEl = document.getElementById('yearlyProfit');
    if (yearlyEl) yearlyEl.textContent = (totalDeposits * 0.1).toFixed(0);

    const profitEl = document.getElementById('profitMargin');
    if (profitEl) profitEl.textContent = (totalDeposits * 0.27).toFixed(0);

    const detailsEl = document.getElementById('detailsValue');
    if (detailsEl) detailsEl.textContent = totalDeposits.toFixed(0);

    // If transactions list exists (older layout), populate it
    const txList = document.getElementById('transactionsList');
    if (txList) {
      txList.innerHTML = '';
      if (deps.length === 0) {
        txList.innerHTML = '<p class="dim">No recent transactions</p>';
      } else {
        deps.slice(0,8).forEach(d => {
          const item = document.createElement('div');
          item.className = 'transaction-item';
          item.innerHTML = `
            <div class="transaction-left">
              <div class="transaction-meta">${new Date(d.submittedAt).toLocaleString()}</div>
            </div>
            <div class="transaction-amount">$${(d.amount||0).toFixed(2)}</div>
          `;
          txList.appendChild(item);
        });
      }
    }

    // Set balance display with actual server balance (formatted '200$')
    const balanceValueEl = document.getElementById('balanceValue');
    if (balanceValueEl) balanceValueEl.textContent = `${Number(actualBalance).toLocaleString()}$`;
    const cardBalanceEl = document.getElementById('cardBalance');
    if (cardBalanceEl) cardBalanceEl.textContent = `$${actualBalance.toFixed(2)}`;

    // Seed chart data with actual balance
    seedChartWithInitialBalance(actualBalance);
  } catch (err) {
    console.error('Error loading plans/deposits', err);
  }
}

function seedChartWithInitialBalance(balance) {
  chartData.labels = [];
  chartData.datasets[0].data = [];
  // Create a 12-point history
  for (let i = 11; i >= 0; i--) {
    const ts = new Date(Date.now() - i * 60000); // per minute
    chartData.labels.push(ts.toLocaleTimeString().replace(/:\d+\s?/, ''));
    // simulate slight variation
    const variation = balance * (0.01 * (Math.random()-0.3));
    chartData.datasets[0].data.push(Math.max(0, balance + variation));
  }
}

function initializeChart() {
  // Check if Chart is available
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded yet, skipping chart initialization');
    return;
  }
  const ctx = document.getElementById('growthChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: chartData,
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: true, ticks: { color: 'rgba(255,255,255,0.6)' } },
        y: { display: true, ticks: { color: 'rgba(255,255,255,0.6)' } }
      }
    }
  });
}

// FIX: Periodically refresh balance from server (every 10 seconds)
function startBalanceRefresh() {
  setInterval(async () => {
    try {
      const statsRes = await fetch('/api/user/stats');
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.balance && statsData.balance.currentBalance !== undefined) {
          const serverBalance = statsData.balance.currentBalance;
          updateBalanceDisplays(serverBalance);
          updateChartWithBalance(serverBalance);
          console.log('✓ Balance refreshed from server:', serverBalance);
        }
      }
    } catch (err) {
      console.warn('Balance refresh failed:', err);
    }
  }, 10000); // Refresh every 10 seconds
}

// FIX: Update chart with actual balance value
function updateChartWithBalance(balance) {
  if (!chart || !chartData.datasets[0]) return;
  
  const ts = new Date();
  chartData.labels.push(ts.toLocaleTimeString().replace(/:\d+\s?/, ''));
  chartData.datasets[0].data.push(balance);
  
  // keep only last 24 points
  if (chartData.labels.length > 24) {
    chartData.labels.shift();
    chartData.datasets[0].data.shift();
  }
  
  if (chart) {
    chart.update('none');
  }
}

function startRealtimeSimulation() {
  // Every 5 seconds, push a new point with simulated growth
  setInterval(() => {
    const last = chartData.datasets[0].data[chartData.datasets[0].data.length - 1] || 0;
    // simulate small growth/shrink
    const change = last * (Math.random() * 0.002 - 0.0005); // approx -0.05% to +0.2%
    const next = Math.max(0, last + change + (Math.random()*0.2));
    const ts = new Date();
    chartData.labels.push(ts.toLocaleTimeString().replace(/:\d+\s?/, ''));
    chartData.datasets[0].data.push(next);
    // keep only last 24 points
    if (chartData.labels.length > 24) {
      chartData.labels.shift();
      chartData.datasets[0].data.shift();
    }
    // Only update chart if it's initialized
    if (chart) {
      chart.update('none');
    }
    // Update balance displays with animated number
    updateBalanceDisplays(next);
  }, 5000);
}

function updateBalanceDisplays(value) {
  const v = Math.round(Number(value || 0));
  // Keep authoritative balance display driven by server stats.
  // Only update the smaller card display used by this script.
  const cardBalanceEl = document.getElementById('cardBalance');
  if (cardBalanceEl) cardBalanceEl.textContent = `$${v}`;
}

// Initialize on DOM ready
window.addEventListener('DOMContentLoaded', initDashboard);
