// dashboard-charts.js
// Renders balance, growth, and performance metrics with real-time SSE updates.

let balanceChart = null;
let growthChart = null;
let sparklineChart = null;
let growthEventSource = null;
let balanceEventSource = null;
let balanceSamples = []; // Store balance samples for historical chart
let statsPollInterval = null;
let previousStats = { totalEarnings: 0, totalDeposited: 0, totalWithdrawals: 0, roiPercent: 0 };

// Brand theme and typography
const THEME = {
  primary: '#0ea57a',
  primaryGradientStart: 'rgba(16,185,129,0.16)',
  primaryGradientMid: 'rgba(16,185,129,0.06)',
  accent: '#4f46e5',
  surface: 'rgba(255,255,255,0.95)',
  muted: 'rgba(255,255,255,0.6)',
  background: '#061118',
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto'
};

// Tune Chart defaults to brand
if (typeof Chart !== 'undefined') {
  Chart.defaults.font.family = THEME.fontFamily;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = THEME.muted;
}

async function fetchJSON(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

function formatCurrency(v) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
  } catch (e) {
    return '$' + (v || 0).toFixed(2);
  }
}

/**
 * Fetch hourly balance history and populate the history chart.
 * Builds an hourly series for the requested number of hours ending now.
 */
async function refreshBalanceHistoryHours(hours = 24) {
  try {
    const res = await fetchJSON(`/api/dashboard/balance-history?hours=${encodeURIComponent(hours)}`);
    const series = res.series || [];

    const end = new Date();
    const start = new Date(end.getTime() - (hours - 1) * 60 * 60 * 1000);

    const dateKeys = [];
    const labels = [];
    for (let i = 0; i < hours; i++) {
      const d = new Date(start.getTime() + i * 60 * 60 * 1000);
      // hourly key using ISO up to hour
      dateKeys.push(d.toISOString().slice(0, 13));
      labels.push(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }

    // Map series by hourly key (server returns date formatted for hours when hours param supplied)
    const byKey = {};
    series.forEach(s => {
      const k = String(s.date || '').slice(0, 13);
      byKey[k] = { balance: Number(s.balance || 0), amount: Number(s.amount || 0) };
    });

    const data = [];
    let lastBalance = 0;
    for (let i = 0; i < dateKeys.length; i++) {
      const key = dateKeys[i];
      if (byKey[key] && typeof byKey[key].balance === 'number') {
        lastBalance = byKey[key].balance;
      }
      data.push(lastBalance);
    }

    if (balanceChart) {
      balanceChart.data.labels = labels;
      balanceChart.data.datasets[0].data = data;
      balanceChart._dateKeys = dateKeys;
      balanceChart._byDateMap = byKey;
      // autoscale y
      try {
        const vals = data.slice();
        const min = Math.min(...vals, 0);
        const max = Math.max(...vals, 0);
        balanceChart.options.scales = balanceChart.options.scales || {};
        balanceChart.options.scales.y = balanceChart.options.scales.y || {};
        balanceChart.options.scales.y.suggestedMin = Math.floor(min * 0.95);
        balanceChart.options.scales.y.suggestedMax = Math.ceil(max * 1.05);
      } catch (e) { /* ignore autoscale errors */ }
      balanceChart.update();
    }

    // balance display will be driven by authoritative stats endpoint (refreshStats)

    // sparkline seeding removed

    return { labels, data };
  } catch (err) {
    console.error('refreshBalanceHistoryHours error:', err);
    throw err;
  }
}

function formatPercent(v) {
  return (v || 0).toFixed(2) + '%';
}

function parseNumberFromText(txt) {
  if (!txt) return 0;
  const n = parseFloat(String(txt).replace(/[^0-9.-]+/g, ''));
  return isNaN(n) ? 0 : n;
}

function animateValue(el, end, duration = 700, isPercent = false) {
  if (!el) return;
  const start = parseNumberFromText(el.dataset.raw || el.textContent || '0');
  el.dataset.raw = end;
  const startTime = performance.now();
  const delta = end - start;
  function step(now) {
    const t = Math.min(1, (now - startTime) / duration);
    // easeOutCubic
    const progress = 1 - Math.pow(1 - t, 3);
    const value = start + delta * progress;
    if (isPercent) {
      el.textContent = value.toFixed(2) + '%';
    } else {
      el.textContent = formatCurrency(value);
    }
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function formatDelta(value, isPercent = false) {
  const sign = value > 0 ? '+' : '';
  if (isPercent) return sign + value.toFixed(2) + '%';
  return sign + formatCurrency(value);
}

function pulseElement(el) {
  if (!el) return;
  el.classList.remove('delta-pulse');
  // force reflow
  void el.offsetWidth;
  el.classList.add('delta-pulse');
  setTimeout(() => el.classList.remove('delta-pulse'), 900);
}

async function initCharts() {
  // Note: balance chart removed (visual). Keep growth chart context and initial helpers.
  const growthCtx = document.getElementById('growthChart').getContext('2d');
  const now = new Date();
  const balanceInitialLabels = [];
  const balanceInitialData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 1000 * 30);
    balanceInitialLabels.push(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    balanceInitialData.push(0);
  }

  // Create balance chart (stepped line) so current balance can be shown on-graph
  try {
    const balanceEl = document.getElementById('balanceChart');
    if (balanceEl && balanceEl.getContext) {
      const balanceCtx = balanceEl.getContext('2d');
      const grad = balanceCtx.createLinearGradient(0, 0, 0, 140);
      grad.addColorStop(0, 'rgba(21,179,122,0.95)');
      grad.addColorStop(1, 'rgba(21,179,122,0.35)');

      balanceChart = new Chart(balanceCtx, {
        type: 'line',
        data: {
          labels: balanceInitialLabels.slice(),
          datasets: [{
            label: 'Balance',
            data: balanceInitialData.slice(),
            borderColor: grad,
            backgroundColor: 'rgba(21,179,122,0.06)',
            fill: true,
            tension: 0.45,
            cubicInterpolationMode: 'monotone',
            stepped: false,
            pointRadius: 0,
            pointHoverRadius: 6,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: 'index' },
          elements: {
            line: { borderJoinStyle: 'round' },
            point: { backgroundColor: 'rgba(21,179,122,0.98)', borderColor: '#062016' }
          },
          layout: { padding: { left: 8, right: 18, top: 8, bottom: 8 } },
          scales: {
            x: {
              display: true,
              grid: { display: false },
              ticks: { color: 'rgba(255,255,255,0.45)', maxRotation: 0, autoSkip: true, maxTicksLimit: 6, font: { size: 11 } }
            },
            y: {
              display: true,
              grid: { color: 'rgba(255,255,255,0.03)' },
              ticks: { color: 'rgba(255,255,255,0.45)', callback: v => formatCurrency(v), font: { size: 11 }, maxTicksLimit: 5 },
              beginAtZero: false
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: true,
              backgroundColor: 'rgba(0,0,0,0.85)',
              titleColor: '#fff',
              bodyColor: '#fff',
              displayColors: false,
              callbacks: { label: ctx => formatCurrency(ctx.parsed.y) }
            }
          },
          onHover: function (evt, elements) {
            try {
              const chart = this;
              chart._hoverIndex = (elements && elements.length) ? elements[0].index : null;
              chart.draw();
            } catch (e) { /* ignore */ }
          }
        }
      });
    }
  } catch (e) { console.warn('Failed to create balanceChart', e); }

  // Balance hover listener is kept: plugin will draw hover guideline via chart._hoverIndex

  // (sparkline and smooth toggle removed per UI request)

  // Immediately load authoritative balance history as hourly series
  await refreshBalanceHistoryHours(24).catch(err => console.warn('hourly balance history load failed', err));

  // Attach just the export action for balance card (range buttons removed)
  try {
    const exp = document.getElementById('exportBalanceChart');
    if (exp) exp.addEventListener('click', () => exportBalanceChart());
  } catch (e) { console.warn('attach controls failed', e); }
  
  // Start SSE stream to receive real-time growth series updates
  try {
    if (growthEventSource) {
      growthEventSource.close();
      growthEventSource = null;
    }
    growthEventSource = new EventSource('/api/dashboard/growth-stream');
    growthEventSource.onmessage = function (e) {
      try {
        const payload = JSON.parse(e.data);
        if (payload && Array.isArray(payload.series)) {
          const labels = payload.series.map(d => d.date);
          const data = payload.series.map(d => d.value);
          growthChart.data.labels = labels;
          growthChart.data.datasets[0].data = data;
          growthChart.update('none');
        }
      } catch (err) {
        console.error('Invalid growth-stream payload', err);
      }
    };
    growthEventSource.onerror = function (err) {
      console.warn('Growth stream connection error', err);
    };
  } catch (err) {
    console.error('Failed to start growth stream', err);
  }
  const growthLabels = [];
  const growthInitialData = [];
  for (let d = 29; d >= 0; d--) {
    const pd = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
    growthLabels.push((pd.getMonth() + 1) + '-' + pd.getDate());
    growthInitialData.push(0);
  }

  // Growth chart: professional bar chart for daily growth (30 days)
  growthChart = new Chart(growthCtx, {
    type: 'bar',
    data: {
      labels: growthLabels,
      datasets: [{
        label: 'Daily Growth',
        data: growthInitialData,
        backgroundColor: function (ctx) {
          const v = ctx.parsed.y || 0;
          return v >= 0 ? 'rgba(79,70,229,0.85)' : 'rgba(255,99,132,0.85)';
        },
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 18
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      scales: {
        x: { display: true, grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.65)', maxTicksLimit: 10, font: { size: 11 } } },
        y: { display: true, grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: 'rgba(255,255,255,0.65)', font: { size: 11 }, callback: v => '$' + Number(v).toLocaleString() }, suggestedMin: 0 }
      },
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.85)',
          borderColor: '#4f46e5',
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: '#fff',
          padding: 8,
          displayColors: false,
          callbacks: { label: ctx => formatCurrency(ctx.parsed.y) }
        }
      }
    }
  });

  // Performance sparkline removed: sparkline canvas not present in markup.

  // Load initial data
  await refreshGrowth();
  await refreshStats();

  // Start listening for real-time balance updates via SSE
  startBalanceStream();

  // Ensure we refresh the hourly history at least once every hour in case SSE is not available
  try {
    const ONE_HOUR_MS = 60 * 60 * 1000;
    setInterval(() => {
      refreshBalanceHistoryHours(24).catch(err => console.warn('hourly refresh failed', err));
    }, ONE_HOUR_MS);
  } catch (e) { /* ignore */ }

  // Poll stats every 30 seconds for earnings and ROI updates
  statsPollInterval = setInterval(() => {
    refreshStats().catch(err => console.error('Stats poll error:', err));
  }, 30000);
}

function startBalanceStream() {
  if (balanceEventSource) balanceEventSource.close();

  balanceEventSource = new EventSource('/api/dashboard/balance-stream');

  balanceEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.error) {
        console.error('Balance stream error:', data.error);
        return;
      }
      updateBalanceChart(data.balance || 0);
    } catch (err) {
      console.error('SSE parse error:', err);
    }
  };

  balanceEventSource.onerror = (err) => {
    console.error('SSE connection error:', err);
    balanceEventSource.close();
    // Optionally reconnect after a delay
    setTimeout(startBalanceStream, 3000);
  };
}

async function updateBalanceChart(balance, statsOverride) {
  // Compute authoritative balance = deposits + earnings - withdrawals.
  let computedBalance = Number(balance || 0);
  try {
    if (statsOverride && typeof statsOverride === 'object') {
      const totalDeposited = Number(statsOverride.totalDeposited || statsOverride.totalInvested || 0);
      const totalEarnings = Number(statsOverride.totalEarnings || statsOverride.totalEarnings || 0);
      const totalWithdrawals = Number(statsOverride.totalWithdrawals || statsOverride.totalWithdrawn || 0);
      computedBalance = totalDeposited + totalEarnings - totalWithdrawals;
    } else {
      const stats = await fetchJSON('/api/dashboard/stats');
      const totalDeposited = Number(stats.totalDeposited || stats.totalInvested || 0);
      const totalEarnings = Number(stats.totalEarnings || 0);
      const totalWithdrawals = Number(stats.totalWithdrawals || stats.totalWithdrawn || 0);
      computedBalance = totalDeposited + totalEarnings - totalWithdrawals;
    }
  } catch (e) {
    computedBalance = Number(balance || 0);
  }

  const display = document.getElementById('balanceValue');
  if (display) display.textContent = formatCurrency(computedBalance);

  // Add timestamp label
  const now = new Date();
  const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Keep last 20 samples
  balanceSamples.push({ time: timeLabel, balance: computedBalance });
  if (balanceSamples.length > 20) balanceSamples.shift();

  // Update history chart's latest point (hourly-aware). Fall back to daily when appropriate.
  try {
    if (balanceChart && Array.isArray(balanceChart._dateKeys)) {
      const isoHourKey = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
      const isoDayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      let idx = balanceChart._dateKeys.indexOf(isoHourKey);
      if (idx >= 0) {
        balanceChart.data.datasets[0].data[idx] = computedBalance;
      } else {
        // If chart is daily (keys like YYYY-MM-DD) update today's point
        const dayIdx = balanceChart._dateKeys.indexOf(isoDayKey);
        if (dayIdx >= 0 && balanceChart._dateKeys[0] && balanceChart._dateKeys[0].length === 10) {
          balanceChart.data.datasets[0].data[dayIdx] = computedBalance;
        } else {
          // Append an hourly point
          const label = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          balanceChart.data.labels.push(label);
          balanceChart._dateKeys.push(isoHourKey);
          balanceChart.data.datasets[0].data.push(computedBalance);
          // keep last 48 hours to avoid overgrowth
          if (balanceChart._dateKeys.length > 48) {
            balanceChart._dateKeys.shift();
            balanceChart.data.labels.shift();
            balanceChart.data.datasets[0].data.shift();
          }
        }
      }

      // Autoscale y-axis so values fit nicely with small padding
      try {
        const vals = (balanceChart.data.datasets[0].data || []).filter(v => typeof v === 'number');
        if (vals.length) {
          const min = Math.min(...vals, 0);
          const max = Math.max(...vals, 0);
          balanceChart.options.scales = balanceChart.options.scales || {};
          balanceChart.options.scales.y = balanceChart.options.scales.y || {};
          balanceChart.options.scales.y.suggestedMin = Math.floor(min * 0.95);
          balanceChart.options.scales.y.suggestedMax = Math.ceil(max * 1.05);
        }
      } catch (e) { /* ignore autoscale errors */ }

      balanceChart.update('none');
    }
  } catch (e) {
    console.warn('Could not update history chart point:', e);
  }

  // Sparkline removed from UI; no update required here.
}

/**
 * Fetch authoritative balance history and populate the history chart.
 * Builds a daily series (fills gaps) for the requested number of days.
 */
async function refreshBalanceHistory(days = 90) {
  try {
    const res = await fetchJSON(`/api/dashboard/balance-history?days=${encodeURIComponent(days)}`);
    const series = res.series || [];

    // Build day keys for the range (days days ending today)
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));

    const dateKeys = [];
    const labels = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      dateKeys.push(d.toISOString().slice(0, 10));
      labels.push((d.getMonth() + 1) + '-' + d.getDate());
    }

    // Map series by date (server returns entries with date in YYYY-MM-DD)
    const byDate = {};
    series.forEach(s => {
      // normalize amounts and balances
      s.amount = Number(s.amount || 0);
      s.balance = Number(s.balance || 0);
      byDate[s.date] = s; // last entry for date wins
    });

    const data = [];
    let lastBalance = 0;
    for (let i = 0; i < dateKeys.length; i++) {
      const key = dateKeys[i];
      if (byDate[key] && typeof byDate[key].balance === 'number') {
        lastBalance = byDate[key].balance;
      }
      data.push(lastBalance);
    }

    // Ensure first point starts at zero if there was no earlier balance
    if (data.length > 0 && data[0] !== 0) {
      // prepend a zero at left if initial day had existing balance but user wanted from zero
      // (we'll leave dataset as-is but ensure y-axis starts at 0 via suggestedMin)
    }

    // Apply to chart
    if (balanceChart) {
      // create visually enhanced gradient border if supported
      balanceChart.data.labels = labels;
      balanceChart.data.datasets[0].data = data;
      // store ISO keys and map for quick updates and tooltips
      balanceChart._dateKeys = dateKeys;
      balanceChart._byDateMap = byDate;
      // attach plugin helpers: compute and store min/max indices
      try {
        const vals = data.slice();
        let minIdx = 0, maxIdx = 0;
        for (let i = 0; i < vals.length; i++) {
          if (vals[i] < vals[minIdx]) minIdx = i;
          if (vals[i] > vals[maxIdx]) maxIdx = i;
        }
        balanceChart._minIndex = minIdx;
        balanceChart._maxIndex = maxIdx;
      } catch (e) { /* ignore */ }
      balanceChart.update();
    }

    // update display to the latest balance
    // balance display will be driven by authoritative stats endpoint (refreshStats)

    return { labels, data };
  } catch (err) {
    console.error('refreshBalanceHistory error:', err);
    throw err;
  }
}

  // Plugin: draw current value badge and min/max markers on balance chart
  Chart.register({
    id: 'balanceEnhancements',
    afterDraw: (chart) => {
      if (!chart || chart.config.type !== 'line') return;
      const ctx = chart.ctx;
      const ds = chart.data.datasets[0];
      if (!ds || !ds.data) return;

      try {
        const meta = chart.getDatasetMeta(0);
        const lastIndex = ds.data.length - 1;
        const lastPoint = meta.data[lastIndex];

        // current-value label removed to avoid duplicating the balance display

        // Draw min/max markers
        if (typeof chart._minIndex === 'number' && typeof chart._maxIndex === 'number') {
          const marker = (i, color) => {
            const p = meta.data[i];
            if (!p) return;
            ctx.save();
            ctx.beginPath();
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.95;
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          };
          marker(chart._minIndex, 'rgba(239,68,68,0.85)');
          marker(chart._maxIndex, 'rgba(34,197,94,0.95)');
        }

        // Draw a highlighted marker for the latest point (subtle, not cluttered)
        try {
          const p = meta.data[lastIndex];
          if (p) {
            ctx.save();
            ctx.beginPath();
            ctx.fillStyle = 'rgba(21,179,122,0.98)';
            ctx.shadowColor = 'rgba(2,18,11,0.6)';
            ctx.shadowBlur = 8;
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        } catch (e) { /* ignore */ }

        // Draw vertical hover guideline and highlight point when hovering
        if (chart._hoverIndex != null) {
          const hi = chart._hoverIndex;
          const p = meta.data[hi];
          if (p) {
            // vertical line
            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.moveTo(p.x, chart.chartArea.top);
            ctx.lineTo(p.x, chart.chartArea.bottom);
            ctx.stroke();
            ctx.restore();

            // glowing point
            ctx.save();
            ctx.beginPath();
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 8;
            ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // tooltip badge removed to reduce clutter; keep guideline and glowing point only
          }
        }
      } catch (e) { /* ignore drawing errors */ }
    }
  });

// Export balance chart PNG
function exportBalanceChart() {
  try {
    if (!balanceChart) return;
    const url = balanceChart.toBase64Image();
    const a = document.createElement('a');
    a.href = url;
    a.download = 'balance-chart.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) {
    console.error('Export failed', e);
  }
}



async function refreshGrowth() {
  try {
    const res = await fetchJSON('/api/dashboard/growth?days=30');
    const series = res.series || [];
    const labels = series.map(s => s.date.slice(5)); // MM-DD format
    const data = series.map(s => s.amount || 0);

    const display = document.getElementById('growthValue');
    const total = data.reduce((a, b) => a + b, 0);
    if (display) display.textContent = formatCurrency(total);

    // compute cumulative series for second dataset
    const cumulative = [];
    data.reduce((acc, v, i) => {
      const cur = acc + v;
      cumulative[i] = Math.round(cur * 100) / 100;
      return cur;
    }, 0);

    if (growthChart) {
      growthChart.data.labels = labels;
      if (growthChart.data.datasets[0]) growthChart.data.datasets[0].data = data;
      if (growthChart.data.datasets[1]) growthChart.data.datasets[1].data = cumulative;
      growthChart.update('none');
    }
  } catch (err) {
    console.error('refreshGrowth error:', err);
  }
}

async function refreshStats() {
  try {
    const data = await fetchJSON('/api/dashboard/stats');
    const earningsDisplay = document.getElementById('earningsValue');
    const roiDisplay = document.getElementById('roiValue');
    const depositsDisplay = document.getElementById('depositsValue');
    const withdrawalsDisplay = document.getElementById('withdrawalsValue');
    const updateDisplay = document.getElementById('statsLastUpdate');
    const earningsDeltaEl = document.getElementById('earningsDelta');
    const depositsDeltaEl = document.getElementById('depositsDelta');
    const roiDeltaEl = document.getElementById('roiDelta');
    const withdrawalsDeltaEl = document.getElementById('withdrawalsDelta');
    const perfCard = document.getElementById('performanceCard');


    // New values
    const newEarnings = Number(data.totalEarnings || 0);
    const newDeposits = Number(data.totalDeposited || data.totalInvested || 0);
    const newWithdrawals = Number(data.totalWithdrawals || data.totalWithdrawn || 0);
    const newRoi = Number(data.roiPercent || 0);

    // server-provided day-over-day deltas (preferred if available)
    const s = data.sinceYesterday || null;
    let serverEarningsDelta = null;
    let serverDepositsDelta = null;
    let serverRoiDelta = null;
    let serverWithdrawalsDelta = null;
    if (s) {
      if (typeof s.earningsDiff === 'number') serverEarningsDelta = s.earningsDiff;
      else if (typeof s.totalEarnings === 'number') serverEarningsDelta = newEarnings - s.totalEarnings;
      else if (typeof s.previousEarnings === 'number') serverEarningsDelta = newEarnings - s.previousEarnings;

      if (typeof s.depositsDiff === 'number') serverDepositsDelta = s.depositsDiff;
      else if (typeof s.totalDeposited === 'number') serverDepositsDelta = newDeposits - s.totalDeposited;
      else if (typeof s.totalInvested === 'number') serverDepositsDelta = newDeposits - s.totalInvested;
      else if (typeof s.previousDeposited === 'number') serverDepositsDelta = newDeposits - s.previousDeposited;

      if (typeof s.withdrawalsDiff === 'number') serverWithdrawalsDelta = s.withdrawalsDiff;
      else if (typeof s.totalWithdrawals === 'number') serverWithdrawalsDelta = newWithdrawals - s.totalWithdrawals;
      else if (typeof s.previousWithdrawals === 'number') serverWithdrawalsDelta = newWithdrawals - s.previousWithdrawals;

      if (typeof s.roiDiff === 'number') serverRoiDelta = s.roiDiff;
      else if (typeof s.roiPercentYesterday === 'number') serverRoiDelta = newRoi - s.roiPercentYesterday;
      else if (typeof s.previousRoi === 'number') serverRoiDelta = newRoi - s.previousRoi;
    }

    const earningsDelta = newEarnings - (previousStats.totalEarnings || 0);
    const depositsDelta = newDeposits - (previousStats.totalDeposited || 0);
    const withdrawalsDelta = newWithdrawals - (previousStats.totalWithdrawals || 0);
    const roiDelta = newRoi - (previousStats.roiPercent || 0);

    // Animate numeric transitions for a pleasant micro-interaction
    if (earningsDisplay) animateValue(earningsDisplay, newEarnings, 800);
    if (depositsDisplay) animateValue(depositsDisplay, newDeposits, 800);
    if (withdrawalsDisplay) animateValue(withdrawalsDisplay, newWithdrawals, 800);
    if (roiDisplay) animateValue(roiDisplay, newRoi, 800, true);

    // Prefer server-provided deltas for day-over-day values, fallback to computed
    const displayEarningsDelta = (serverEarningsDelta !== null && typeof serverEarningsDelta !== 'undefined') ? serverEarningsDelta : earningsDelta;
    const displayDepositsDelta = (serverDepositsDelta !== null && typeof serverDepositsDelta !== 'undefined') ? serverDepositsDelta : depositsDelta;
    const displayWithdrawalsDelta = (serverWithdrawalsDelta !== null && typeof serverWithdrawalsDelta !== 'undefined') ? serverWithdrawalsDelta : withdrawalsDelta;
    const displayRoiDelta = (serverRoiDelta !== null && typeof serverRoiDelta !== 'undefined') ? serverRoiDelta : roiDelta;

    // Update delta text with color hints and pulse
    if (earningsDeltaEl) {
      earningsDeltaEl.textContent = formatDelta(displayEarningsDelta || 0, false);
      earningsDeltaEl.style.color = (displayEarningsDelta || 0) >= 0 ? 'rgba(34,197,94,0.95)' : 'rgba(239,68,68,0.95)';
      pulseElement(earningsDeltaEl);
    }
    if (depositsDeltaEl) {
      depositsDeltaEl.textContent = formatDelta(displayDepositsDelta || 0, false);
      depositsDeltaEl.style.color = (displayDepositsDelta || 0) >= 0 ? 'rgba(34,197,94,0.95)' : 'rgba(239,68,68,0.95)';
      pulseElement(depositsDeltaEl);
    }
    if (withdrawalsDeltaEl) {
      withdrawalsDeltaEl.textContent = formatDelta(displayWithdrawalsDelta || 0, false);
      // withdrawals increasing is typically 'outflow' — show red for increase
      withdrawalsDeltaEl.style.color = (displayWithdrawalsDelta || 0) > 0 ? 'rgba(239,68,68,0.95)' : 'rgba(34,197,94,0.95)';
      pulseElement(withdrawalsDeltaEl);
    }
    if (roiDeltaEl) {
      roiDeltaEl.textContent = formatDelta(displayRoiDelta || 0, true);
      roiDeltaEl.style.color = (displayRoiDelta || 0) >= 0 ? 'rgba(34,197,94,0.95)' : 'rgba(239,68,68,0.95)';
      pulseElement(roiDeltaEl);
    }

    // Subtle flash on performance card when something changed (server or computed)
    if (perfCard && (Math.abs(displayEarningsDelta || 0) > 0 || Math.abs(displayDepositsDelta || 0) > 0 || Math.abs(displayWithdrawalsDelta || 0) > 0 || Math.abs(displayRoiDelta || 0) > 0)) {
      perfCard.classList.remove('stat-flash');
      // Force reflow to restart animation
      void perfCard.offsetWidth;
      perfCard.classList.add('stat-flash');
      setTimeout(() => perfCard.classList.remove('stat-flash'), 1000);
    }

    // store for next delta calculation (keep server values as baseline for local diffs)
    previousStats.totalEarnings = newEarnings;
    previousStats.totalDeposited = newDeposits;
    previousStats.totalWithdrawals = newWithdrawals;
    previousStats.roiPercent = newRoi;

    // Compute authoritative balance = deposits + earnings - withdrawals
    const computedBalance = newDeposits + newEarnings - newWithdrawals;
    const balanceDisplay = document.getElementById('balanceValue');
    if (balanceDisplay) animateValue(balanceDisplay, computedBalance, 800);

    // Update history chart and samples using the same authoritative values (avoid extra fetch)
    try {
      updateBalanceChart(computedBalance, { totalDeposited: newDeposits, totalEarnings: newEarnings, totalWithdrawals: newWithdrawals }).catch(() => {});
    } catch (e) { /* ignore */ }

    if (updateDisplay) {
      const now = new Date();
      updateDisplay.textContent = 'Updated ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  } catch (err) {
    console.error('refreshStats error:', err);
  }
}

// Initialize charts after DOM and after auth initialization
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    initCharts().catch(err => console.error('initCharts error:', err));
  }, 300);
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  if (balanceEventSource) balanceEventSource.close();
  if (statsPollInterval) clearInterval(statsPollInterval);
});
