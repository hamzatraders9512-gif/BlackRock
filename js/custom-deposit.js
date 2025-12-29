// Custom Deposit Page JavaScript

// Configuration - merge with global PAYMENT_CONFIG
const DEPOSIT_CONFIG = {
  ...(typeof PAYMENT_CONFIG !== 'undefined' ? PAYMENT_CONFIG.SETTINGS : {}),
  MIN_AMOUNT: 50,
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_FILE_TYPES: ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'],
  CLOUDINARY_UPLOAD_URL: 'https://api.cloudinary.com/v1_1/YOUR_CLOUD_NAME/image/upload',
  QR_CODE_SIZE: 200
};

// State Management
const depositState = {
  amount: null,
  depositAddress: null,
  fileData: null,
  fileName: null,
  fileSize: null,
  cloudinaryUrl: null,
  transactionHash: null,
  isLoading: false
};

// DOM Elements
const elements = {
  // Amount Step
  customAmount: document.getElementById('customAmount'),
  proceedAmountBtn: document.getElementById('proceedAmountBtn'),
  amountStep: document.getElementById('amountStep'),
  
  // Address Step
  addressStep: document.getElementById('addressStep'),
  displayAmount: document.getElementById('displayAmount'),
  depositAddressDisplay: document.getElementById('depositAddressDisplay'),
  copyAddressBtnCustom: document.getElementById('copyAddressBtnCustom'),
  qrCode: document.getElementById('qrCode'),
  nextToProofBtn: document.getElementById('nextToProofBtn'),
  
  // Proof Step
  proofStep: document.getElementById('proofStep'),
  proofFileInput: document.getElementById('proofFileInput'),
  filePreviewContainer: document.getElementById('filePreviewContainer'),
  previewContent: document.getElementById('previewContent'),
  removeProofBtn: document.getElementById('removeProofBtn'),
  uploadStatus: document.getElementById('uploadStatus'),
  fileInfo: document.getElementById('fileInfo'),
  fileName: document.getElementById('fileName'),
  fileSize: document.getElementById('fileSize'),
  confirmDepositBtn: document.getElementById('confirmDepositBtn'),
  
  // Success Step
  successStep: document.getElementById('successStep'),
  successAmount: document.getElementById('successAmount'),
  goToDashboardBtn: document.getElementById('goToDashboardBtn'),
  
  // General
  backBtn: document.getElementById('backBtn'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  loadingText: document.getElementById('loadingText'),
  toastContainer: document.getElementById('toastContainer')
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await initializeDeposit();
  attachEventListeners();
});

/**
 * Initialize deposit page
 */
async function initializeDeposit() {
  try {
    // Check authentication
    const authStatus = await checkAuthenticationStatus();
    if (!authStatus.isAuthenticated) {
      showToast('Please sign in first', 'error');
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 2000);
      return;
    }

    // Generate deposit address
    depositState.depositAddress = generateUniqueDepositAddress();

    // If page was opened from a plan selection, prefill amount and skip amount step
    const params = new URLSearchParams(window.location.search);
    const planParam = params.get('plan');
    const amountParam = params.get('amount');

    if (planParam && amountParam) {
      const amt = parseFloat(amountParam);
      if (!isNaN(amt) && amt >= DEPOSIT_CONFIG.MIN_AMOUNT) {
        depositState.amount = amt;
        // Update display and QR
        elements.displayAmount.textContent = `${amt.toFixed(2)} USDT`;
        elements.depositAddressDisplay.textContent = depositState.depositAddress;
        generateQRCode(depositState.depositAddress, amt);
        // Show address step directly
        showStep('address');
        return;
      }
    }

    // Default initial state
    showStep('amount');
    
  } catch (error) {
    console.error('Initialization error:', error);
    showToast('Failed to initialize deposit page', 'error');
  }
}

/**
 * Attach event listeners
 */
function attachEventListeners() {
  // Amount input
  elements.customAmount.addEventListener('input', handleAmountInput);
  
  // Proceed button
  elements.proceedAmountBtn.addEventListener('click', handleProceedAmount);
  
  // Copy address
  elements.copyAddressBtnCustom.addEventListener('click', handleCopyAddress);
  
  // Next to proof
  elements.nextToProofBtn.addEventListener('click', handleNextToProof);
  
  // File upload
  elements.proofFileInput.addEventListener('change', handleFileSelect);
  
  // Remove file
  elements.removeProofBtn.addEventListener('click', handleRemoveFile);
  
  // Confirm deposit
  elements.confirmDepositBtn.addEventListener('click', handleConfirmDeposit);
  
  // Go to dashboard
  elements.goToDashboardBtn.addEventListener('click', () => {
    window.location.href = '/dashboard';
  });
  
  // Back button
  elements.backBtn.addEventListener('click', handleBackButton);
}

/**
 * Handle amount input
 */
function handleAmountInput(e) {
  const value = parseFloat(e.target.value);
  
  // Enable/disable proceed button
  if (value >= DEPOSIT_CONFIG.MIN_AMOUNT && !isNaN(value)) {
    elements.proceedAmountBtn.disabled = false;
  } else {
    elements.proceedAmountBtn.disabled = true;
  }
}

/**
 * Handle proceed with amount
 */
function handleProceedAmount() {
  const amount = parseFloat(elements.customAmount.value);
  
  if (isNaN(amount) || amount < DEPOSIT_CONFIG.MIN_AMOUNT) {
    showToast(`Minimum deposit amount is $${DEPOSIT_CONFIG.MIN_AMOUNT}`, 'error');
    return;
  }
  
  depositState.amount = amount;
  
  // Update display
  elements.displayAmount.textContent = `${amount.toFixed(2)} USDT`;
  elements.depositAddressDisplay.textContent = depositState.depositAddress;
  
  // Generate QR code
  generateQRCode(depositState.depositAddress, amount);
  
  // Show address step
  showStep('address');
  
  showToast(`Amount set to $${amount}. Send USDT to the address below.`, 'info', 5000);
}

/**
 * Generate unique deposit address (Mock - Replace with real backend call)
 */
function generateUniqueDepositAddress() {
  // Use the fixed deposit address from PAYMENT_CONFIG if available
  if (typeof PAYMENT_CONFIG !== 'undefined' && PAYMENT_CONFIG.DEPOSIT_ADDRESS) {
    return PAYMENT_CONFIG.DEPOSIT_ADDRESS;
  }
  
  // In a real application, this would call your backend API
  // For now, we'll generate a mock ERC20 address
  
  // Check if user has a stored address in session
  const storedAddress = sessionStorage.getItem('depositAddress');
  if (storedAddress) {
    return storedAddress;
  }
  
  // Generate random ERC20 address (for demo)
  const chars = '0123456789abcdef';
  let address = '0x';
  for (let i = 0; i < 40; i++) {
    address += chars[Math.floor(Math.random() * chars.length)];
  }
  
  // Store in session
  sessionStorage.setItem('depositAddress', address);
  return address;
}

/**
 * Generate QR code for address
 */
function generateQRCode(address, amount) {
  // Clear previous QR code
  elements.qrCode.innerHTML = '';
  
  // Create QR code with address
  // Format: ethereum:<address>
  const qrText = `ethereum:${address}`;
  
  try {
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
  } catch (error) {
    console.error('QR Code generation error:', error);
    // Fallback: show text representation
    elements.qrCode.innerHTML = `
      <div style="color: var(--text-dim); font-size: 0.85rem; padding: 1rem; text-align: center;">
        <p>Scan address with your wallet</p>
        <code style="display: block; word-break: break-all; margin-top: 0.5rem;">${address}</code>
      </div>
    `;
  }
}

/**
 * Handle copy address button
 */
async function handleCopyAddress() {
  try {
    await navigator.clipboard.writeText(depositState.depositAddress);
    
    // Visual feedback
    const originalText = elements.copyAddressBtnCustom.innerHTML;
    elements.copyAddressBtnCustom.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      <span>Copied!</span>
    `;
    
    showToast('Address copied to clipboard', 'success', 2000);
    
    setTimeout(() => {
      elements.copyAddressBtnCustom.innerHTML = originalText;
    }, 2000);
    
  } catch (error) {
    console.error('Copy error:', error);
    showToast('Failed to copy address', 'error');
  }
}

/**
 * Handle next to proof step
 */
function handleNextToProof() {
  showStep('proof');
  showToast('Upload a screenshot of the transaction proof', 'info', 4000);
}

/**
 * Handle file selection
 */
function handleFileSelect(e) {
  const file = e.target.files[0];
  
  if (!file) {
    return;
  }
  
  // Validate file type
  if (!DEPOSIT_CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
    showToast('Invalid file type. Please upload PNG, JPG, or PDF.', 'error');
    return;
  }
  
  // Validate file size
  if (file.size > DEPOSIT_CONFIG.MAX_FILE_SIZE) {
    showToast(`File size exceeds 5MB limit. Your file: ${(file.size / 1024 / 1024).toFixed(2)}MB`, 'error');
    return;
  }
  
  // Store file data
  depositState.fileName = file.name;
  depositState.fileSize = file.size;
  
  // Update file info
  elements.fileName.textContent = `File: ${file.name}`;
  elements.fileSize.textContent = `Size: ${(file.size / 1024).toFixed(2)} KB`;
  elements.fileInfo.style.display = 'block';
  
  // Show preview
  showFilePreview(file);
  
  // Enable confirm button
  elements.confirmDepositBtn.disabled = false;
  
  // Store file for upload
  depositState.fileData = file;
  
  showToast('File selected successfully', 'success', 2000);
}

/**
 * Show file preview
 */
function showFilePreview(file) {
  elements.previewContent.innerHTML = '';
  
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement('img');
      img.src = e.target.result;
      elements.previewContent.appendChild(img);
    };
    reader.readAsDataURL(file);
  } else if (file.type === 'application/pdf') {
    const pdfIcon = `
      <div class="pdf-icon">
        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
          <polyline points="13 2 13 9 20 9"/>
          <text x="12" y="16" font-size="8" text-anchor="middle" fill="currentColor">PDF</text>
        </svg>
        <p>${file.name}</p>
      </div>
    `;
    elements.previewContent.innerHTML = pdfIcon;
  }
  
  elements.filePreviewContainer.style.display = 'block';
}

/**
 * Handle remove file
 */
function handleRemoveFile() {
  depositState.fileData = null;
  depositState.fileName = null;
  depositState.fileSize = null;
  
  elements.proofFileInput.value = '';
  elements.filePreviewContainer.style.display = 'none';
  elements.fileInfo.style.display = 'none';
  elements.uploadStatus.style.display = 'none';
  elements.confirmDepositBtn.disabled = true;
  
  showToast('File removed', 'info', 2000);
}

/**
 * Handle confirm deposit
 */
async function handleConfirmDeposit() {
  if (!depositState.fileData || !depositState.amount) {
    showToast('Please complete all steps', 'error');
    return;
  }
  
  try {
    showLoading(true, 'Processing deposit...');
    console.log('Starting deposit confirmation process...');
    console.log('Deposit state:', {
      amount: depositState.amount,
      address: depositState.depositAddress,
      fileName: depositState.fileName,
      fileSize: depositState.fileSize
    });
    
    // Step 1: Upload file to server (which uploads to Cloudinary)
    let cloudinaryUrl = null;
    try {
      showLoading(true, 'Uploading payment proof...');
      console.log('Step 1: Uploading file to server...');
      cloudinaryUrl = await uploadToCloudinary(depositState.fileData);
      console.log('Step 1 complete: File uploaded to Cloudinary -', cloudinaryUrl);
    } catch (uploadError) {
      console.error('File upload failed:', uploadError);
      showLoading(false);
      showToast(`Upload failed: ${uploadError.message}`, 'error');
      return;  // Stop here - don't continue without upload
    }
    
    depositState.cloudinaryUrl = cloudinaryUrl;
    
    // Step 2: Send deposit data to backend
    showLoading(true, 'Submitting deposit to backend...');
    console.log('Step 2: Submitting deposit to backend...');
    
    const depositData = {
      amount: depositState.amount,
      depositAddress: depositState.depositAddress,
      proofUrl: cloudinaryUrl,
      fileName: depositState.fileName,
      fileSize: depositState.fileSize,
      timestamp: new Date().toISOString()
    };
    
    console.log('Sending deposit data:', depositData);
    
    let response;
    try {
      response = await fetch('/api/deposits/custom-submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(depositData)
      });
    } catch (fetchError) {
      console.error('Network fetch error:', fetchError);
      console.error('Fetch error details:', {
        name: fetchError.name,
        message: fetchError.message,
        stack: fetchError.stack
      });
      throw new Error(`Network error: ${fetchError.message}`);
    }
    
    console.log('Backend response status:', response.status);
    console.log('Backend response OK:', response.ok);
    console.log('Backend response headers:', {
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length')
    });
    
    if (!response.ok) {
      let errorMessage = 'Unknown backend error';
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || `Error ${response.status}`;
      } catch (e) {
        const responseText = await response.text();
        errorMessage = `Server error: ${response.status} ${response.statusText}. Response: ${responseText.substring(0, 100)}`;
      }
      console.error('Backend error:', errorMessage);
      throw new Error(errorMessage);
    }
    
    let result;
    try {
      result = await response.json();
    } catch (parseError) {
      console.error('Response parse error:', parseError);
      throw new Error('Invalid server response');
    }
    
    console.log('Step 2 complete: Deposit accepted -', result);
    
    showLoading(false);
    
    // Update success display
    elements.successAmount.textContent = `${depositState.amount.toFixed(2)} USDT`;
    
    // Show success step
    showStep('success');
    
    showToast('Deposit submitted successfully!', 'success', 3000);
    
    // Auto-redirect after 5 seconds
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 5000);
    
  } catch (error) {
    console.error('Deposit submission error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      status: error.status
    });
    showLoading(false);
    showToast(`Error: ${error.message}`, 'error');
  }
}

/**
 * Upload file to Cloudinary via server proxy
 * Server-side upload is more secure and reliable than direct client uploads
 */
async function uploadToCloudinary(file) {
  try {
    console.log('Starting file upload to server proxy...');
    
    // Create FormData with the file
    const formData = new FormData();
    formData.append('file', file);
    
    console.log('Uploading file to /api/cloudinary/upload...');
    console.log('File details:', {
      name: file.name,
      size: file.size,
      type: file.type
    });
    
    // Upload to server endpoint (which will upload to Cloudinary)
    const response = await fetch('/api/cloudinary/upload', {
      method: 'POST',
      credentials: 'include',  // Send auth cookies
      body: formData
      // Note: Do NOT set Content-Type header - browser will set it with boundary for multipart/form-data
    });
    
    console.log('Server response status:', response.status);
    
    if (!response.ok) {
      let errorMessage = 'Upload failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || `Error ${response.status}`;
      } catch (e) {
        errorMessage = `Server error ${response.status}: ${response.statusText}`;
      }
      console.error('Upload error:', errorMessage);
      throw new Error(errorMessage);
    }
    
    const result = await response.json();
    console.log('Upload successful, URL:', result.url);
    
    if (!result.url) {
      throw new Error('No URL returned from upload');
    }
    
    return result.url;
    
  } catch (error) {
    console.error('File upload error:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    throw error;
  }
}

/**
 * Show specific step
 */
function showStep(stepName) {
  // Hide all steps
  elements.amountStep.style.display = 'none';
  elements.addressStep.style.display = 'none';
  elements.proofStep.style.display = 'none';
  elements.successStep.style.display = 'none';
  
  // Show selected step
  switch(stepName) {
    case 'amount':
      elements.amountStep.style.display = 'block';
      elements.customAmount.focus();
      break;
    case 'address':
      elements.addressStep.style.display = 'block';
      window.scrollTo(0, 0);
      break;
    case 'proof':
      elements.proofStep.style.display = 'block';
      window.scrollTo(0, 0);
      break;
    case 'success':
      elements.successStep.style.display = 'block';
      window.scrollTo(0, 0);
      break;
  }
}

/**
 * Handle back button - Redirect to dashboard
 */
function handleBackButton() {
  // Redirect back to dashboard
  window.location.href = '/dashboard';
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  elements.toastContainer.appendChild(toast);
  
  // Auto-remove after duration
  setTimeout(() => {
    toast.remove();
  }, duration);
}

/**
 * Show/hide loading overlay
 */
function showLoading(show = true, text = 'Processing...') {
  if (show) {
    elements.loadingText.textContent = text;
    elements.loadingOverlay.style.display = 'flex';
    depositState.isLoading = true;
  } else {
    elements.loadingOverlay.style.display = 'none';
    depositState.isLoading = false;
  }
}

/**
 * Check authentication status
 */
async function checkAuthenticationStatus() {
  try {
    const response = await fetch('/api/auth/status');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Auth check error:', error);
    return { isAuthenticated: false };
  }
}
