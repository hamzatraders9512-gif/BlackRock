// Externalized from api-diagnostics.html
const BASE_URL = 'http://localhost:3000';

function updateTimestamp() {
  const el = document.getElementById('timestamp');
  if (el) el.textContent = new Date().toLocaleString();
}

function updateNetworkInfo() {
  const el = document.getElementById('current-url');
  if (el) el.textContent = window.location.href;
  const onlineStatus = navigator.onLine ? '✅ Online' : '❌ Offline';
  const onlineEl = document.getElementById('online-status');
  if (onlineEl) {
    while (onlineEl.firstChild) onlineEl.removeChild(onlineEl.firstChild);
    onlineEl.appendChild(document.createTextNode(onlineStatus));
  }
}

async function testHealthCheck() {
  const element = document.getElementById('health-test');
  const statusDiv = element && element.querySelector('.test-status');
  if (statusDiv) {
    while (statusDiv.firstChild) statusDiv.removeChild(statusDiv.firstChild);
    const sp = document.createElement('span'); sp.className = 'spinner'; statusDiv.appendChild(sp); statusDiv.appendChild(document.createTextNode('Testing...'));
  }

  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    const data = await response.json();

    if (response.ok) {
      element.classList.remove('error', 'warning');
      while (statusDiv.firstChild) statusDiv.removeChild(statusDiv.firstChild);
      statusDiv.appendChild(document.createTextNode('✅ '));
      const strongOk = document.createElement('strong'); strongOk.textContent = 'OK'; statusDiv.appendChild(strongOk);
      statusDiv.appendChild(document.createElement('br'));
      statusDiv.appendChild(document.createTextNode('Status: ' + String(data.status)));
      statusDiv.appendChild(document.createElement('br'));
      statusDiv.appendChild(document.createTextNode('Time: ' + String(data.timestamp)));
    } else {
      element.classList.add('error');
      while (statusDiv.firstChild) statusDiv.removeChild(statusDiv.firstChild);
      statusDiv.appendChild(document.createTextNode('❌ '));
      const strongErr = document.createElement('strong'); strongErr.textContent = 'Error ' + String(response.status); statusDiv.appendChild(strongErr);
      statusDiv.appendChild(document.createElement('br'));
      statusDiv.appendChild(document.createTextNode(String(data.message)));
    }
  } catch (error) {
    element.classList.add('error');
    while (statusDiv.firstChild) statusDiv.removeChild(statusDiv.firstChild);
    statusDiv.appendChild(document.createTextNode('❌ '));
    const s = document.createElement('strong'); s.textContent = 'Failed to fetch'; statusDiv.appendChild(s);
    statusDiv.appendChild(document.createElement('br'));
    statusDiv.appendChild(document.createTextNode('Error: ' + String(error.message)));
  }
}

async function testCloudinaryConfig() {
  const element = document.getElementById('cloudinary-config-test');
  const statusDiv = element && element.querySelector('.test-status');
  if (statusDiv) {
    while (statusDiv.firstChild) statusDiv.removeChild(statusDiv.firstChild);
    const sp = document.createElement('span'); sp.className = 'spinner'; statusDiv.appendChild(sp); statusDiv.appendChild(document.createTextNode('Testing...'));
  }

  try {
    const response = await fetch(`${BASE_URL}/api/cloudinary/config`);
    const data = await response.json();

    if (response.ok && data.configured) {
      element.classList.remove('error', 'warning');
      while (statusDiv.firstChild) statusDiv.removeChild(statusDiv.firstChild);
      statusDiv.appendChild(document.createTextNode('✅ '));
      const strongOk2 = document.createElement('strong'); strongOk2.textContent = 'OK'; statusDiv.appendChild(strongOk2);
      statusDiv.appendChild(document.createElement('br'));
      statusDiv.appendChild(document.createTextNode('Cloud: ' + String(data.cloudName)));
      statusDiv.appendChild(document.createElement('br'));
      statusDiv.appendChild(document.createTextNode('Preset: ' + String(data.uploadPreset)));
    } else if (response.ok) {
      element.classList.add('warning');
      while (statusDiv.firstChild) statusDiv.removeChild(statusDiv.firstChild);
      statusDiv.appendChild(document.createTextNode('⚠️ '));
      const strongWarn = document.createElement('strong'); strongWarn.textContent = 'Not Configured'; statusDiv.appendChild(strongWarn);
      statusDiv.appendChild(document.createElement('br'));
      statusDiv.appendChild(document.createTextNode(String(data.message)));
    } else {
      element.classList.add('error');
      while (statusDiv.firstChild) statusDiv.removeChild(statusDiv.firstChild);
      statusDiv.appendChild(document.createTextNode('❌ '));
      const strongErr2 = document.createElement('strong'); strongErr2.textContent = 'Error ' + String(response.status); statusDiv.appendChild(strongErr2);
      statusDiv.appendChild(document.createElement('br'));
      statusDiv.appendChild(document.createTextNode(String(data.message)));
    }
  } catch (error) {
    element.classList.add('error');
    while (statusDiv.firstChild) statusDiv.removeChild(statusDiv.firstChild);
    statusDiv.appendChild(document.createTextNode('❌ '));
    const s = document.createElement('strong'); s.textContent = 'Failed to fetch'; statusDiv.appendChild(s);
    statusDiv.appendChild(document.createElement('br'));
    statusDiv.appendChild(document.createTextNode('Error: ' + String(error.message)));
  }
}

async function testCustomDepositEndpoint() {
  const element = document.getElementById('custom-deposit-test');
  const statusDiv = element && element.querySelector('.test-status');
  if (statusDiv) {
    while (statusDiv.firstChild) statusDiv.removeChild(statusDiv.firstChild);
    const sp = document.createElement('span'); sp.className = 'spinner'; statusDiv.appendChild(sp); statusDiv.appendChild(document.createTextNode('Testing...'));
  }

  try {
    const testData = {
      amount: 50,
      depositAddress: '0x1234567890abcdef',
      proofUrl: 'https://example.com/proof.png',
      fileName: 'proof.png',
      fileSize: 1024
    };

    const response = await fetch(`${BASE_URL}/api/deposits/custom-submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(testData)
    });

    const data = await response.json();

    if (response.ok) {
      element.classList.remove('error', 'warning');
      while (statusDiv.firstChild) statusDiv.removeChild(statusDiv.firstChild);
      statusDiv.appendChild(document.createTextNode('✅ '));
      const sOk = document.createElement('strong'); sOk.textContent = 'OK'; statusDiv.appendChild(sOk);
      statusDiv.appendChild(document.createElement('br'));
      statusDiv.appendChild(document.createTextNode('Deposit ID: ' + String(data.depositId)));
      statusDiv.appendChild(document.createElement('br'));
      statusDiv.appendChild(document.createTextNode('Status: ' + (data.success ? 'Accepted' : 'Failed')));
    } else if (response.status === 401) {
      element.classList.add('warning');
      while (statusDiv.firstChild) statusDiv.removeChild(statusDiv.firstChild);
      statusDiv.appendChild(document.createTextNode('⚠️ '));
      const sWarn = document.createElement('strong'); sWarn.textContent = 'Not Authenticated'; statusDiv.appendChild(sWarn);
      statusDiv.appendChild(document.createElement('br'));
      statusDiv.appendChild(document.createTextNode(String(data.message)));
    } else {
      element.classList.add('error');
      while (statusDiv.firstChild) statusDiv.removeChild(statusDiv.firstChild);
      statusDiv.appendChild(document.createTextNode('❌ '));
      const sErr = document.createElement('strong'); sErr.textContent = 'Error ' + String(response.status); statusDiv.appendChild(sErr);
      statusDiv.appendChild(document.createElement('br'));
      statusDiv.appendChild(document.createTextNode(String(data.message)));
    }
  } catch (error) {
    element.classList.add('error');
    while (statusDiv.firstChild) statusDiv.removeChild(statusDiv.firstChild);
    statusDiv.appendChild(document.createTextNode('❌ '));
    const s = document.createElement('strong'); s.textContent = 'Failed to fetch'; statusDiv.appendChild(s);
    statusDiv.appendChild(document.createElement('br'));
    statusDiv.appendChild(document.createTextNode('Error: ' + String(error.message)));
  }
}

async function testAuthStatus() {
  const element = document.getElementById('auth-status-test');
  const statusDiv = element && element.querySelector('.test-status');
  if (statusDiv) {
    while (statusDiv.firstChild) statusDiv.removeChild(statusDiv.firstChild);
    const sp = document.createElement('span'); sp.className = 'spinner'; statusDiv.appendChild(sp); statusDiv.appendChild(document.createTextNode('Testing...'));
  }

  try {
    const response = await fetch(`${BASE_URL}/api/auth/status`, { credentials: 'include' });
    const data = await response.json();

    if (response.ok) {
      if (data.isAuthenticated) {
        element.classList.remove('error', 'warning');
        while (statusDiv.firstChild) statusDiv.removeChild(statusDiv.firstChild);
        statusDiv.appendChild(document.createTextNode('✅ '));
        const strongAuth = document.createElement('strong'); strongAuth.textContent = 'Authenticated'; statusDiv.appendChild(strongAuth);
        statusDiv.appendChild(document.createElement('br'));
        statusDiv.appendChild(document.createTextNode('User: ' + String((data.user && data.user.email) || 'Unknown')));
      } else {
        element.classList.add('warning');
        while (statusDiv.firstChild) statusDiv.removeChild(statusDiv.firstChild);
        statusDiv.appendChild(document.createTextNode('⚠️ '));
        const strongNA = document.createElement('strong'); strongNA.textContent = 'Not Authenticated'; statusDiv.appendChild(strongNA);
        statusDiv.appendChild(document.createElement('br'));
        statusDiv.appendChild(document.createTextNode('Please log in first'));
      }
    } else {
      element.classList.add('error');
      while (statusDiv.firstChild) statusDiv.removeChild(statusDiv.firstChild);
      statusDiv.appendChild(document.createTextNode('❌ '));
      const strongErr3 = document.createElement('strong'); strongErr3.textContent = 'Error ' + String(response.status); statusDiv.appendChild(strongErr3);
    }
  } catch (error) {
    element.classList.add('error');
    while (statusDiv.firstChild) statusDiv.removeChild(statusDiv.firstChild);
    statusDiv.appendChild(document.createTextNode('❌ '));
    const s = document.createElement('strong'); s.textContent = 'Failed to fetch'; statusDiv.appendChild(s);
    statusDiv.appendChild(document.createElement('br'));
    statusDiv.appendChild(document.createTextNode('Error: ' + String(error.message)));
  }
}

async function runAllTests() {
  updateTimestamp();
  await testHealthCheck();
  await testCloudinaryConfig();
  await testAuthStatus();
  await testCustomDepositEndpoint();
}

function clearResults() {
  document.querySelectorAll('.test-item').forEach(item => {
    item.classList.remove('error', 'warning');
    const st = item.querySelector('.test-status'); if (st) st.textContent = 'Not tested yet';
  });
}

window.addEventListener('load', () => {
  updateNetworkInfo();
  updateTimestamp();

  const runBtn = document.getElementById('runAllBtn');
  if (runBtn) runBtn.addEventListener('click', runAllTests);
  const clearBtn = document.getElementById('clearResultsBtn');
  if (clearBtn) clearBtn.addEventListener('click', clearResults);
});

setInterval(updateTimestamp, 1000);
