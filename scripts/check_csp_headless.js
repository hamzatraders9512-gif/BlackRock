const fs = require('fs');
const path = require('path');

function walk(dir) {
  const res = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const d of list) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (d.name === 'node_modules' || d.name === '.git') continue;
      res.push(...walk(full));
    } else {
      res.push(full);
    }
  }
  return res;
}

function findHtmlFiles(root) {
  return walk(root).filter(f => f.endsWith('.html'));
}

function analyzeHtml(file) {
  const src = fs.readFileSync(file, 'utf8');
  const inlineScripts = [];
  const scriptTagRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptTagRegex.exec(src)) !== null) {
    const attrs = m[1];
    const body = m[2] || '';
    const hasSrc = /\bsrc\s*=/.test(attrs);
    const hasNonce = /\bnonce\b\s*=/.test(attrs);
    const bodyTrim = body.replace(/<!--([\s\S]*?)-->/g, '').trim();
    if (!hasSrc && bodyTrim.length > 0) {
      inlineScripts.push({ attrs: attrs.trim(), length: bodyTrim.length, sample: bodyTrim.slice(0, 120).replace(/\s+/g, ' ') });
    } else if (hasSrc && hasNonce) {
      // script with src and nonce — likely fine
    }
  }

  // detect inline event handlers like onclick="..."
  const inlineHandlers = [];
  const handlerRegex = /\son\w+\s*=\s*"[^"]+"/gi;
  let h;
  while ((h = handlerRegex.exec(src)) !== null) {
    inlineHandlers.push(h[0]);
  }

  return { file, inlineScripts, inlineHandlers };
}

function checkServerCSP(root) {
  const serverFile = path.join(root, 'server', 'index.js');
  if (!fs.existsSync(serverFile)) return { found: false };
  const src = fs.readFileSync(serverFile, 'utf8');
  const hasNonce = /script-src[^;]*'nonce-\$?\{?nonce\}?/i.test(src) || /'nonce-\${?nonce}?/i.test(src) || /'nonce-/.test(src);
  const cspSnippetMatch = src.match(/res.setHeader\(['\"]Content-Security-Policy['\"],[\s\S]*?\);/i);
  return { found: true, hasNonce, cspSnippet: cspSnippetMatch ? cspSnippetMatch[0].slice(0, 400) : null };
}

function main() {
  const root = path.resolve(__dirname, '..');
  console.log('Scanning HTML files under', root);
  const htmlFiles = findHtmlFiles(root);
  const results = [];
  for (const f of htmlFiles) {
    const r = analyzeHtml(f);
    if (r.inlineScripts.length || r.inlineHandlers.length) results.push(r);
  }

  const serverCsp = checkServerCSP(root);

  console.log('\nServer CSP check:');
  if (!serverCsp.found) {
    console.log('- server/index.js not found');
  } else {
    console.log(`- CSP uses nonce per-request: ${serverCsp.hasNonce ? 'YES' : 'NO'}`);
    if (serverCsp.cspSnippet) console.log('- CSP snippet (truncated):', serverCsp.cspSnippet.replace(/\n/g, ' '));
  }

  console.log('\nPages with inline scripts or inline handlers:');
  if (results.length === 0) {
    console.log('✔ No inline scripts or inline event handlers found in HTML files.');
  } else {
    for (const r of results) {
      console.log('\n- ' + path.relative(root, r.file));
      if (r.inlineScripts.length) {
        console.log('  inline <script> blocks:', r.inlineScripts.length);
        r.inlineScripts.forEach((s, i) => console.log(`    [${i+1}] attrs: ${s.attrs || '(none)'} length:${s.length} sample:${s.sample}`));
      }
      if (r.inlineHandlers.length) {
        console.log('  inline event handlers found:', r.inlineHandlers.length);
        const sample = Array.from(new Set(r.inlineHandlers)).slice(0,6).join(', ');
        console.log('    examples:', sample);
      }
      if (serverCsp.hasNonce) {
        console.log('  => Warning: server sends nonce-based CSP; inline scripts will be blocked unless server injects a matching nonce into the script tag at render time.');
      }
    }
  }

  // exit code non-zero if risky items found
  process.exit(results.length ? 2 : 0);
}

main();
