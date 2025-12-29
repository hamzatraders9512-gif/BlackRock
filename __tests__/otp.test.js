const { initializeOTPInputs } = require('../js/auth-shared.js');

describe('initializeOTPInputs', () => {
  test('typing in an OTP input focuses the next input', () => {
    document.body.innerHTML = '';
    const container = document.createElement('div');
    const inputs = [];
    for (let i = 0; i < 6; i++) {
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 1;
      input.className = 'otp-input';
      container.appendChild(input);
      inputs.push(input);
    }
    document.body.appendChild(container);

    initializeOTPInputs(inputs);

    // Simulate input in first field
    inputs[0].value = '5';
    const ev = new Event('input', { bubbles: true });
    inputs[0].dispatchEvent(ev);

    // After entering a digit, focus should move to the second input
    expect(document.activeElement).toBe(inputs[1]);
  });

  test('backspace on empty moves focus to previous', () => {
    document.body.innerHTML = '';
    const container = document.createElement('div');
    const inputs = [];
    for (let i = 0; i < 3; i++) {
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 1;
      input.className = 'otp-input';
      container.appendChild(input);
      inputs.push(input);
    }
    document.body.appendChild(container);

    initializeOTPInputs(inputs);

    // Focus second, press backspace when empty
    inputs[1].focus();
    const keyEv = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
    inputs[1].dispatchEvent(keyEv);

    // Focus should move to first input
    expect(document.activeElement).toBe(inputs[0]);
  });
});
