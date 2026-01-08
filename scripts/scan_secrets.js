const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IGNORE_DIRS = ['node_modules', '.git', 'vendor', 'uploads', 'dist', 'build'];
const MAX_BYTES = 1024 * 1024; // 1MB

const regex = /SESSION_SECRET|JWT_SECRET|GMAIL_APP_PASSWORD|CLOUDINARY_API_SECRET|GOOGLE_CLIENT_SECRET|MONGODB_URI|mongodb\+srv|API_KEY|api_key|PASSWORD=|password=|pass=|SECRET=|secret=|PRIVATE KEY|-----BEGIN PRIVATE KEY-----|ENCRYPTED PRIVATE KEY|AKIA[A-Z0-9]{16}/i;

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    try {
      const full = path.join(dir, e.name);
      if (IGNORE_DIRS.some(d => full.includes(path.sep + d + path.sep) || full.endsWith(path.sep + d))) continue;
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile()) {
        // skip large files
        const stat = fs.statSync(full);
        if (stat.size > MAX_BYTES) continue;
        let text;
        try {
          text = fs.readFileSync(full, 'utf8');
        } catch (err) {
          continue;
        }
        const lines = text.split(/\r?\n/);
        lines.forEach((line, idx) => {
          if (regex.test(line)) {
            console.log(`${path.relative(ROOT, full)}:${idx+1}: ${line.trim()}`);
          }
        });
      }
    } catch (err) {
      // ignore and continue
    }
  }
}

walk(ROOT);
console.log('Scan complete.');
