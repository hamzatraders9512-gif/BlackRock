// Deposit Configuration - Contains payment information
const PAYMENT_CONFIG = {
  // Main deposit address for all payment methods
  DEPOSIT_ADDRESS: '0x1eb17E4367F8D6aAF8C3cEC631f8e01103d7A716',
  
  // Network configuration
  NETWORK: {
    NAME: 'ERC20',
    CHAIN_ID: 1,
    DESCRIPTION: 'Ethereum Mainnet'
  },
  
  // Deposit settings
  SETTINGS: {
    MIN_AMOUNT: 50,
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_FILE_TYPES: ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'],
    QR_CODE_SIZE: 200
  },
  
  // QR Code styling
  QR_STYLE: {
    colorDark: '#00d084',
    colorLight: 'rgba(22, 33, 62, 0.5)',
    correctLevel: 'H'
  }
};

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PAYMENT_CONFIG;
}
