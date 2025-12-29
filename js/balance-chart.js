// balance-chart.js
// Renders a daily balance line chart with pointStyle and polls the API for realtime updates
(function () {
  const API_STATS = '/api/user/stats';
  const SSE_STREAM = '/api/user/stream';
  const POLL_INTERVAL_MS = 8000; // fallback poll every 8s
  const DAYS = 30; // show last 30 days

  function formatDateKey(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  async function fetchStats() {
    try {
      const res = await fetch(API_STATS, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch stats');
      return await res.json();
    } catch (err) {
      console.error('fetchStats error:', err);
      return null;
    }
  }

  function buildDailySeries(balanceHistory = [], days = DAYS) {
    // Build map of dateKey -> last balance on that date
    const map = new Map();
    (balanceHistory || []).forEach(entry => {
      // Support date strings (YYYY-MM-DD) without timezone and Date objects
      let key = null;
      if (entry && typeof entry.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
        key = entry.date;
      } else {
        const date = new Date(entry.date || entry.createdAt || entry.approvedAt);
        if (isNaN(date)) return;
        key = formatDateKey(date);
      }
      // prefer the latest entry for a date; coerce to Number
      const rawVal = entry.balance != null ? entry.balance : (entry.amount != null ? entry.amount : map.get(key));
      const numVal = rawVal == null ? undefined : Number(rawVal);
      if (numVal == null || Number.isNaN(numVal)) {
        // leave existing map value if present
        if (!map.has(key)) map.set(key, 0);
      } else {
        map.set(key, numVal);
      }
    });

    // Create labels for last N days and fill balances by carrying forward last known balance
    const labels = [];
    const values = [];
    let lastBalance = 0;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = formatDateKey(d);
      labels.push(d.toLocaleDateString());
      if (map.has(key)) {
        lastBalance = map.get(key);
      }
      values.push(lastBalance);
    }

    return { labels, values };
  }

  function animateNumber(el, from, to, duration = 600) {
    if (!el) return;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const v = Math.round(from + (to - from) * t);
      el.textContent = v.toLocaleString() + '$';
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function createGradient(ctx, color) {
    const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(255,255,255,0.02)');
    return g;
  }

  function initChart(ctx, labels, dataVals) {
    const border = '#15b37a';
    const bg = createGradient(ctx, 'rgba(21,179,122,0.22)');

    // pointStyle array: make the most recent point slightly larger and square
    const pointStyles = dataVals.map((_, i) => (i === dataVals.length - 1 ? 'rectRot' : 'circle'));

    // Register datalabels plugin if available
    try {
      if (window.Chart && window.ChartDataLabels) {
        Chart.register(window.ChartDataLabels);
      }
    } catch (e) {
      // ignore
    }

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Balance',
            data: dataVals,
            borderColor: border,
            backgroundColor: bg,
            fill: true,
            tension: 0.28,
            pointStyle: pointStyles,
            pointRadius: dataVals.map((_,i) => (i === dataVals.length - 1 ? 6 : 3)),
            pointBackgroundColor: '#fff',
            pointBorderColor: border,
            pointBorderWidth: 1.2,
            pointHoverRadius: 7,
            hitRadius: 12,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600 },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function (context) {
                const v = context.parsed.y || 0;
                return 'Balance: ' + v.toLocaleString();
              }
            }
          },
          datalabels: {
            display: function(context) {
              // show only on the last point
              try {
                return context.dataIndex === context.dataset.data.length - 1;
              } catch (e) { return false; }
            },
            align: 'top',
            anchor: 'end',
            formatter: function(value) {
              return (Number(value) || 0).toLocaleString();
            },
            color: '#e6fff3',
            font: { weight: '700', size: 12 }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { callback: function (v) { return v >= 1000 ? v.toLocaleString() : v; } }
          }
        },
        interaction: { mode: 'nearest', axis: 'x', intersect: false }
      }
    });

    return chart;
  }

  async function start() {
    const canvas = document.getElementById('balanceChart');
    const balanceEl = document.getElementById('balanceValue');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    // Initial fetch and render (will be overwritten by SSE init if available)
    const stats = await fetchStats();
    // server returns { balance: {...}, transactions: ... }
    const balanceObj = (stats && stats.balance) || {};
    const history = (stats && (stats.balanceHistory || stats.history)) || (balanceObj.history || []);
    const currentBalance = (balanceObj.currentBalance != null ? balanceObj.currentBalance : (history.length ? history[history.length - 1].balance : 0)) || 0;
    if (balanceEl) balanceEl.textContent = Number(currentBalance).toLocaleString() + '$';
    const series = buildDailySeries(history, DAYS);
    // If history series is all zeros but we have a current balance, show it on the last point
    try {
      const anyNonZero = series.values.some(v => Number(v));
      if (!anyNonZero && Number(currentBalance)) {
        const lastIdx = series.values.length - 1;
        series.values[lastIdx] = Number(currentBalance);
      }
    } catch (e) { /* ignore */ }
    const chart = initChart(ctx, series.labels, series.values);

    let lastKnownBalance = Number(currentBalance);

    // Try Server-Sent Events for push-based realtime updates
    let esSupported = false;
    if (window.EventSource) {
      try {
        const es = new EventSource(SSE_STREAM, { withCredentials: true });
        esSupported = true;

        es.addEventListener('open', () => {
          // connected
        });

        es.addEventListener('init', (e) => {
          try {
            const payload = JSON.parse(e.data);
            const b = payload.balance || payload.balanceSummary || payload.balanceSummary || {};
            const hist = payload.history || payload.balanceHistory || [];

            const current = b.currentBalance != null ? b.currentBalance : (hist.length ? hist[hist.length - 1].balance : lastKnownBalance);
            if (balanceEl) balanceEl.textContent = Number(current).toLocaleString() + '$';
            lastKnownBalance = Number(current);

            const s = buildDailySeries(hist, DAYS);
            // fallback: if series all zero but we have current, set last point
            try {
              const anyNonZero = s.values.some(v => Number(v));
              if (!anyNonZero && Number(current)) {
                s.values[s.values.length - 1] = Number(current);
              }
            } catch (e) {}
            chart.data.labels = s.labels;
            chart.data.datasets[0].data = s.values;
            chart.update();
          } catch (err) {
            console.error('SSE init parse error', err);
          }
        });

        es.addEventListener('balance', async (e) => {
          try {
            const payload = JSON.parse(e.data);
            const newBal = Number(payload.currentBalance != null ? payload.currentBalance : lastKnownBalance);
            if (newBal !== lastKnownBalance) {
              if (balanceEl) animateNumber(balanceEl, lastKnownBalance, newBal, 600);
              lastKnownBalance = newBal;
            }

            // Fetch authoritative history from server to reflect DB state
            try {
              const resp = await fetch(`/api/user/balance-history?days=${DAYS}`, { credentials: 'include' });
              if (resp && resp.ok) {
                const json = await resp.json();
                const hist = json.history || [];
                const s = buildDailySeries(hist, DAYS);
                  // fallback: ensure last point shows authoritative balance if history empty
                  try {
                    const anyNonZero = s.values.some(v => Number(v));
                    if (!anyNonZero && Number(newBal)) {
                      s.values[s.values.length - 1] = Number(newBal);
                    }
                  } catch (e) {}
                chart.data.labels = s.labels;
                chart.data.datasets[0].data = s.values;
                chart.data.datasets[0].pointStyle = s.values.map((_, i, arr) => (i === arr.length - 1 ? 'rectRot' : 'circle'));
                chart.data.datasets[0].pointRadius = s.values.map((_, i, arr) => (i === arr.length - 1 ? 6 : 3));
                chart.update();
                return;
              }
            } catch (fetchErr) {
              console.warn('Failed to refresh history after SSE balance event, falling back to recentEntry', fetchErr);
            }

            // Fallback: update last data point from recentEntry if history fetch failed
            const recent = payload.recentEntry;
            if (recent && typeof recent.balance === 'number') {
              const lastIndex = chart.data.datasets[0].data.length - 1;
              chart.data.datasets[0].data[lastIndex] = recent.balance;
              chart.data.datasets[0].pointStyle = chart.data.datasets[0].data.map((_, i, arr) => (i === arr.length - 1 ? 'rectRot' : 'circle'));
              chart.data.datasets[0].pointRadius = chart.data.datasets[0].data.map((_, i, arr) => (i === arr.length - 1 ? 6 : 3));
              chart.update();
            }
          } catch (err) {
            console.error('SSE balance parse error', err);
          }
        });

        es.addEventListener('error', (err) => {
          // on network error, fallback to polling
          console.warn('EventSource error, falling back to polling', err);
          es.close();
          startPolling();
        });
      } catch (err) {
        console.warn('EventSource init failed', err);
        startPolling();
      }
    } else {
      // no EventSource support
      startPolling();
    }

    function startPolling() {
      setInterval(async () => {
        const s = await fetchStats();
        if (!s) return;
        const newBalance = Number((s && s.balance && s.balance.currentBalance) != null ? s.balance.currentBalance : lastKnownBalance);

        if (newBalance !== lastKnownBalance) {
          if (balanceEl) animateNumber(balanceEl, lastKnownBalance, newBalance, 600);
          lastKnownBalance = newBalance;
        }

        const newHistory = s.balanceHistory || s.history || [];
        const newSeries = buildDailySeries(newHistory, DAYS);

        const labelsChanged = JSON.stringify(newSeries.labels) !== JSON.stringify(chart.data.labels);
        if (labelsChanged) {
          chart.data.labels = newSeries.labels;
          chart.data.datasets[0].data = newSeries.values;
        } else {
          const lastIndex = chart.data.datasets[0].data.length - 1;
          chart.data.datasets[0].data[lastIndex] = newSeries.values[lastIndex];
          chart.data.datasets[0].pointStyle = chart.data.datasets[0].data.map((_, i, arr) => (i === arr.length - 1 ? 'rectRot' : 'circle'));
          chart.data.datasets[0].pointRadius = chart.data.datasets[0].data.map((_, i, arr) => (i === arr.length - 1 ? 6 : 3));
        }

        chart.update();
      }, POLL_INTERVAL_MS);
    }
  }

  // Start after DOM ready
  document.addEventListener('DOMContentLoaded', start);
})();
