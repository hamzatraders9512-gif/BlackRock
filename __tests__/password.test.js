const { evaluatePasswordStrength } = require('../js/auth-shared.js');

describe('evaluatePasswordStrength', () => {
  test('empty password fails all rules', () => {
    const res = evaluatePasswordStrength('');
    expect(res.rules.length).toBe(false);
    expect(res.rules.upper).toBe(false);
    expect(res.rules.lower).toBe(false);
    expect(res.rules.number).toBe(false);
    expect(res.rules.special).toBe(false);
    expect(res.score).toBe(0);
  });

  test('password with mixed rules scores high', () => {
    const res = evaluatePasswordStrength('Abcdef1!');
    expect(res.rules.length).toBe(true);
    expect(res.rules.upper).toBe(true);
    expect(res.rules.lower).toBe(true);
    expect(res.rules.number).toBe(true);
    expect(res.rules.special).toBe(true);
    expect(res.score).toBe(100);
  });

  test('password missing special character scores lower', () => {
    const res = evaluatePasswordStrength('Abcdef12');
    expect(res.rules.length).toBe(true);
    expect(res.rules.upper).toBe(true);
    expect(res.rules.lower).toBe(true);
    expect(res.rules.number).toBe(true);
    expect(res.rules.special).toBe(false);
    expect(res.score).toBe(80);
  });
});
