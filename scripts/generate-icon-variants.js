const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const variants = [
  {
    name: 'green',
    bg: '#0f172a',
    shape: '#15b37a',
    text: '#ffffff',
    shadow: true
  },
  {
    name: 'sunset',
    bg: '#1f1238',
    shape: 'url(#grad)',
    text: '#fff7f0',
    gradient: ['#ff7a18','#ffb199'],
    shadow: true
  },
  {
    name: 'midnight',
    bg: '#071029',
    shape: '#3aa0ff',
    text: '#e6f7ff',
    shadow: false
  },
  {
    name: 'glass',
    bg: '#0a0e27',
    shape: 'rgba(255,255,255,0.08)',
    text: '#15b37a',
    shadow: false,
    roundedSquare: true
  }
];

function makeSVG(opts) {
  const size = 512;
  const cx = size/2;
  const cy = size/2 - 20;
  const r = Math.round(size * 0.34);

  const gradDef = opts.gradient ? `
    <defs>
      <linearGradient id="grad" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="${opts.gradient[0]}" />
        <stop offset="100%" stop-color="${opts.gradient[1]}" />
      </linearGradient>
      <filter id="ds"><feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#000" flood-opacity="0.35"/></filter>
    </defs>
  ` : `
    <defs>
      <filter id="ds"><feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#000" flood-opacity="0.35"/></filter>
    </defs>
  `;

  const shape = opts.roundedSquare
    ? `<rect x="48" y="48" rx="64" ry="64" width="416" height="416" fill="${opts.shape}" ${opts.shadow ? 'filter="url(#ds)"' : ''}/>`
    : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${opts.shape}" ${opts.shadow ? 'filter="url(#ds)"' : ''}/>`;

  // Use larger bold text; relying on system fonts for rendering
  const text = `<text x="50%" y="64%" text-anchor="middle" font-family="Segoe UI, Roboto, Arial, sans-serif" font-weight="800" font-size="200" fill="${opts.text}" dominant-baseline="middle">BR</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${gradDef}
  <rect width="100%" height="100%" fill="${opts.bg}" />
  ${shape}
  ${text}
</svg>`;
}

async function renderVariant(v) {
  const root = path.join(__dirname, '..');
  const svgName = `icon-${v.name}.svg`;
  const svgPath = path.join(root, 'assets', svgName);
  const svgContent = makeSVG(v);
  fs.writeFileSync(svgPath, svgContent, 'utf8');

  const out192 = path.join(root, 'assets', `icon-${v.name}-192.png`);
  const out512 = path.join(root, 'assets', `icon-${v.name}-512.png`);

  await sharp(Buffer.from(svgContent))
    .resize(192, 192)
    .png({ quality: 90 })
    .toFile(out192);

  await sharp(Buffer.from(svgContent))
    .resize(512, 512)
    .png({ quality: 90 })
    .toFile(out512);

  console.log(`Rendered variant: ${v.name}`);
}

async function run() {
  for (const v of variants) {
    try {
      await renderVariant(v);
    } catch (err) {
      console.error('Error rendering', v.name, err);
    }
  }
}

run();
