// Legacy serverless status endpoint removed to avoid dual-session strategies.
// The primary Express server provides `/api/auth/status` using express-session.
// Keep this handler simple and advise using the main server when accessed.
export default function handler(req, res) {
  res.status(410).json({
    message: 'Endpoint deprecated. Please use the main server /api/auth/status endpoint backed by express-session.'
  });
}
