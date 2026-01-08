// Externalized from payments.html
(function(){
  function initializePayments() {
    const addressElement = document.getElementById('paymentAddress');
    const qrcodeElement = document.getElementById('paymentQRCode');
    const copyBtn = document.getElementById('copyAddressBtn');

    let depositAddress = '0x1eb17E4367F8D6aAF8C3cEC631f8e01103d7A716';
    if (typeof PAYMENT_CONFIG !== 'undefined' && PAYMENT_CONFIG.DEPOSIT_ADDRESS) {
      depositAddress = PAYMENT_CONFIG.DEPOSIT_ADDRESS;
    }

    if (addressElement) addressElement.textContent = depositAddress;

    if (typeof QRCode !== 'undefined' && qrcodeElement) {
      try {
        const qrStyle = (typeof PAYMENT_CONFIG !== 'undefined' && PAYMENT_CONFIG.QR_STYLE) ? PAYMENT_CONFIG.QR_STYLE : {
          colorDark: '#00d084',
          colorLight: 'rgba(22, 33, 62, 0.5)'
        };

        new QRCode(qrcodeElement, {
          text: `ethereum:${depositAddress}`,
          width: 200,
          height: 200,
          colorDark: qrStyle.colorDark,
          colorLight: qrStyle.colorLight,
          correctLevel: QRCode.CorrectLevel.H
        });
      } catch (error) {
        console.error('QR Code generation error:', error);
      }
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(depositAddress).then(() => {
          const originalText = copyBtn.textContent;
          copyBtn.textContent = 'Copied!';
          copyBtn.style.background = '#4CAF50';

          setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.style.background = 'var(--green, #15b37a)';
          }, 2000);
        }).catch(() => {
          copyBtn.textContent = 'Failed to copy';
          setTimeout(() => {
            copyBtn.textContent = 'Copy Address';
          }, 2000);
        });
      });
    }
  }

  document.addEventListener('DOMContentLoaded', initializePayments);
})();
