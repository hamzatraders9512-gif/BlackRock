// Deposit page JavaScript - clean single-file implementation

// Merge with global config if available
const DEPOSIT_CONFIG = {
  ...(typeof PAYMENT_CONFIG !== 'undefined' ? PAYMENT_CONFIG.SETTINGS : {}),
  MIN_AMOUNT: 50,
  MAX_FILE_SIZE: 5 * 1024 * 1024,
  ALLOWED_FILE_TYPES: ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'],
  QR_CODE_SIZE: 200
};

const depositState = {
  amount: null,
  depositAddress: null,
  fileData: null,
  fileName: null,
  fileSize: null,
  planType: null,
  planName: null
};

const elements = {};

document.addEventListener('DOMContentLoaded', () => {
  // map elements
  elements.depositAmountInput = document.getElementById('depositAmountInput');
  elements.planInfo = document.getElementById('planInfo');
  elements.addressStep = document.getElementById('addressStep');
  elements.displayAmount = document.getElementById('displayAmount');
  elements.depositAddressDisplay = document.getElementById('depositAddressDisplay');
  elements.copyAddressBtnCustom = document.getElementById('copyAddressBtnCustom');
  elements.qrCode = document.getElementById('qrCode');
  elements.nextToProofBtn = document.getElementById('nextToProofBtn');
  elements.proofStep = document.getElementById('proofStep');
  elements.proofFileInput = document.getElementById('proofFileInput');
  elements.filePreviewContainer = document.getElementById('filePreviewContainer');
  elements.uploadStatus = document.getElementById('uploadStatus');
  elements.fileInfo = document.getElementById('fileInfo');
  elements.fileName = document.getElementById('fileName');
  elements.fileSize = document.getElementById('fileSize');
  elements.confirmDepositBtn = document.getElementById('confirmDepositBtn');
  elements.successStep = document.getElementById('successStep');
  elements.successAmount = document.getElementById('successAmount');
  elements.goToDashboardBtn = document.getElementById('goToDashboardBtn');
  elements.backBtn = document.getElementById('backBtn');

  initFromQuery();
  attachEventListeners();
});

function initFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const plan = params.get('plan');
  const amount = params.get('amount');
  if (plan && amount) {
    let planName = plan === 'basic' ? 'Basic' : plan === 'standard' ? 'Stranded' : plan === 'premium' ? 'Premium' : plan;
    depositState.amount = parseFloat(amount);
    depositState.planType = plan;
    depositState.planName = planName;
    // Display amount and address immediately (skip amount step)
    if (elements.displayAmount) elements.displayAmount.textContent = `${amount} USDT`;
  }
  depositState.depositAddress = generateUniqueDepositAddress();
  if (elements.depositAddressDisplay) elements.depositAddressDisplay.textContent = depositState.depositAddress;
  generateQRCode(depositState.depositAddress);
  // Show address step immediately
  showStep('address');
}

function attachEventListeners() {
  if (elements.copyAddressBtnCustom) elements.copyAddressBtnCustom.addEventListener('click', handleCopyAddress);
  if (elements.nextToProofBtn) elements.nextToProofBtn.addEventListener('click', handleNextToProof);
  if (elements.proofFileInput) elements.proofFileInput.addEventListener('change', handleFileSelect);
  if (elements.confirmDepositBtn) elements.confirmDepositBtn.addEventListener('click', handleConfirmDeposit);
  if (elements.goToDashboardBtn) elements.goToDashboardBtn.addEventListener('click', () => window.location.href = '/dashboard');
  if (elements.backBtn) elements.backBtn.addEventListener('click', () => window.location.href = '/plans.html');
}

function generateUniqueDepositAddress() {
  // Use the fixed deposit address from PAYMENT_CONFIG if available
  if (typeof PAYMENT_CONFIG !== 'undefined' && PAYMENT_CONFIG.DEPOSIT_ADDRESS) {
    return PAYMENT_CONFIG.DEPOSIT_ADDRESS;
  }
  // Fallback to random generation (should not happen in production)
  const chars = '0123456789abcdef';
  let address = '0x';
  for (let i = 0; i < 40; i++) address += chars[Math.floor(Math.random() * chars.length)];
  return address;
}

function generateQRCode(address) {
  if (!elements.qrCode) return;
  elements.qrCode.innerHTML = '';
  const qrText = `ethereum:${address}`;
  if (window.QRCode) {
    const qrStyle = (typeof PAYMENT_CONFIG !== 'undefined' && PAYMENT_CONFIG.QR_STYLE) ? PAYMENT_CONFIG.QR_STYLE : {
      colorDark: '#00d084',
      colorLight: 'rgba(22, 33, 62, 0.5)'
    };
    new QRCode(elements.qrCode, {
      text: qrText,
      width: DEPOSIT_CONFIG.QR_CODE_SIZE,
      height: DEPOSIT_CONFIG.QR_CODE_SIZE,
      colorDark: qrStyle.colorDark,
      colorLight: qrStyle.colorLight,
      correctLevel: QRCode.CorrectLevel.H
    });
  } else {
    elements.qrCode.textContent = address;
  }
}

function handleCopyAddress() {
  if (!depositState.depositAddress) return;
  navigator.clipboard.writeText(depositState.depositAddress).then(() => showToast('Address copied to clipboard', 'success')).catch(() => showToast('Failed to copy address', 'error'));
}

function handleNextToProof() {
  showStep('proof');
}

function handleFileSelect(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!DEPOSIT_CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
    showToast('Invalid file type. Please upload PNG, JPG, or PDF.', 'error');
    return;
  }
  if (file.size > DEPOSIT_CONFIG.MAX_FILE_SIZE) {
    showToast('File size exceeds 5MB limit.', 'error');
    return;
  }
  depositState.fileName = file.name;
  depositState.fileSize = file.size;
  if (elements.fileName) elements.fileName.textContent = `File: ${file.name}`;
  if (elements.fileSize) elements.fileSize.textContent = `Size: ${(file.size / 1024).toFixed(2)} KB`;
  if (elements.fileInfo) elements.fileInfo.style.display = 'block';
  showFilePreview(file);
  if (elements.confirmDepositBtn) elements.confirmDepositBtn.disabled = false;
  depositState.fileData = file;
  showToast('File selected successfully', 'success');
}

function showFilePreview(file) {
  if (!elements.filePreviewContainer) return;
  elements.filePreviewContainer.innerHTML = '';
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = document.createElement('img');
      img.src = ev.target.result;
      img.style.maxWidth = '100%';
      img.style.borderRadius = '8px';
      elements.filePreviewContainer.appendChild(img);
    };
    reader.readAsDataURL(file);
  } else {
    elements.filePreviewContainer.innerHTML = `<div class="pdf-icon">📄 ${file.name}</div>`;
  }
  elements.filePreviewContainer.style.display = 'block';
}

async function handleConfirmDeposit() {
  if (!depositState.fileData || !depositState.amount) {
    showToast('Please complete all steps', 'error');
    return;
  }
  if (elements.confirmDepositBtn) {
    elements.confirmDepositBtn.disabled = true;
    elements.confirmDepositBtn.textContent = 'Uploading...';
  }

  // show upload status
  if (elements.uploadStatus) {
    elements.uploadStatus.className = 'upload-status loading';
    elements.uploadStatus.innerHTML = `<p class="status-message">Uploading proof... please wait</p>`;
  }

  try {
    // First upload file to Cloudinary
    console.log('Uploading to Cloudinary...');
    const cloudinaryFormData = new FormData();
    cloudinaryFormData.append('file', depositState.fileData, depositState.fileName || 'proof');

    const cloudinaryResp = await fetch('/api/cloudinary/upload', {
      method: 'POST',
      body: cloudinaryFormData,
      credentials: 'include'
    });

    if (cloudinaryResp.status === 401) {
      showToast('Please log in to submit deposits', 'error');
      if (elements.confirmDepositBtn) {
        elements.confirmDepositBtn.disabled = false;
        elements.confirmDepositBtn.textContent = 'Confirm Deposit';
      }
      if (elements.uploadStatus) {
        elements.uploadStatus.className = 'upload-status error';
        elements.uploadStatus.innerHTML = `<p class="status-message">Unauthorized. Please log in.</p>`;
      }
      return;
    }

    const cloudinaryJson = await cloudinaryResp.json();
    if (!cloudinaryResp.ok || !cloudinaryJson.success) {
      const message = cloudinaryJson.message || 'Cloudinary upload failed';
      showToast(message, 'error');
      if (elements.uploadStatus) {
        elements.uploadStatus.className = 'upload-status error';
        elements.uploadStatus.innerHTML = `<p class="status-message">${message}</p>`;
      }
      if (elements.confirmDepositBtn) {
        elements.confirmDepositBtn.disabled = false;
        elements.confirmDepositBtn.textContent = 'Confirm Deposit';
      }
      return;
    }

    const proofUrl = cloudinaryJson.url;
    console.log('Cloudinary upload successful:', proofUrl);

    // Now submit deposit with Cloudinary URL
    if (elements.uploadStatus) {
      elements.uploadStatus.className = 'upload-status loading';
      elements.uploadStatus.innerHTML = `<p class="status-message">Saving deposit... please wait</p>`;
    }

    const depositFormData = new FormData();
    depositFormData.append('planType', depositState.planType || 'custom');
    depositFormData.append('planName', depositState.planName || 'Custom Deposit');
    depositFormData.append('depositAddress', depositState.depositAddress || '');
    depositFormData.append('proofUrl', proofUrl);

    const depositResp = await fetch('/api/deposits/submit', {
      method: 'POST',
      body: depositFormData,
      credentials: 'include'
    });

    if (depositResp.status === 401) {
      showToast('Please log in to submit deposits', 'error');
      if (elements.confirmDepositBtn) {
        elements.confirmDepositBtn.disabled = false;
        elements.confirmDepositBtn.textContent = 'Confirm Deposit';
      }
      if (elements.uploadStatus) {
        elements.uploadStatus.className = 'upload-status error';
        elements.uploadStatus.innerHTML = `<p class="status-message">Unauthorized. Please log in.</p>`;
      }
      return;
    }

    const depositJson = await depositResp.json();

    if (!depositResp.ok) {
      const message = depositJson.message || 'Deposit submission failed';
      showToast(message, 'error');
      if (elements.uploadStatus) {
        elements.uploadStatus.className = 'upload-status error';
        elements.uploadStatus.innerHTML = `<p class="status-message">${message}</p>`;
      }
      if (elements.confirmDepositBtn) {
        elements.confirmDepositBtn.disabled = false;
        elements.confirmDepositBtn.textContent = 'Confirm Deposit';
      }
      return;
    }

    // success
    if (elements.uploadStatus) {
      elements.uploadStatus.className = 'upload-status success';
      elements.uploadStatus.innerHTML = `<p class="status-message">${depositJson.message || 'Deposit submitted successfully'}</p>`;
    }
    // show success step
    showStep('success');
    if (elements.successAmount) elements.successAmount.textContent = `${depositState.amount.toFixed(2)} USDT`;

    // Optionally show deposit id
    if (depositJson.depositId && elements.successStep) {
      const details = elements.successStep.querySelector('.success-details');
      if (details) {
        const el = document.createElement('div');
        el.className = 'detail-item';
        el.innerHTML = `<div class="detail-label">Deposit ID</div><div class="detail-value">${depositJson.depositId}</div>`;
        details.appendChild(el);
      }
    }

  } catch (err) {
    console.error('Deposit error:', err);
    showToast('Submission failed. Please try again.', 'error');
    if (elements.uploadStatus) {
      elements.uploadStatus.className = 'upload-status error';
      elements.uploadStatus.innerHTML = `<p class="status-message">Submission failed. Try again.</p>`;
    }
    if (elements.confirmDepositBtn) {
      elements.confirmDepositBtn.disabled = false;
      elements.confirmDepositBtn.textContent = 'Confirm Deposit';
    }
  }
}

function showStep(step) {
  if (elements.addressStep) elements.addressStep.style.display = step === 'address' ? 'block' : 'none';
  if (elements.proofStep) elements.proofStep.style.display = step === 'proof' ? 'block' : 'none';
  if (elements.successStep) elements.successStep.style.display = step === 'success' ? 'block' : 'none';
}

function showToast(msg, type = 'info', duration = 2500) {
  if (window.showToast) return window.showToast(msg, type, duration);
  // minimal fallback
  console.log('[toast]', type, msg);
}
