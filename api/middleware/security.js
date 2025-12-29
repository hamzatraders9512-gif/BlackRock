export function addSecurityHeaders(req, res) {
  // Add security headers
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Quick patch: include script-src and style-src with 'unsafe-inline' to allow certain vendor libraries and inline styles
  // Security note: this weakens CSP by permitting 'unsafe-inline' and 'unsafe-eval'. Use only for trusted/dev environments.
  res.setHeader('Content-Security-Policy', "default-src 'self' https: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https: data:; object-src 'none'; frame-ancestors 'none';");
}