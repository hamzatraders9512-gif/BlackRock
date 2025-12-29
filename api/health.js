// Simple health check endpoint for Vercel serverless
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).send(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
};
