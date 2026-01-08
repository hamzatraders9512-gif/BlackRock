export function addSecurityHeaders(req, res) {
  // Add security headers
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Strict CSP: do NOT allow 'unsafe-inline' or 'unsafe-eval'. Use nonces/hashes for inline scripts when needed.
  res.setHeader('Content-Security-Policy', "default-src 'self' https:; script-src 'self' https:; style-src 'self' https:; object-src 'none'; frame-ancestors 'none';");
}