const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

async function render() {
  const root = path.join(__dirname, '..');
  const svgPath = path.join(root, 'assets', 'icon.svg');
  if (!fs.existsSync(svgPath)) {
    console.error('SVG not found at', svgPath);
    process.exit(1);
  }

  const out192 = path.join(root, 'assets', 'icon-192.png');
  const out512 = path.join(root, 'assets', 'icon-512.png');

  // Render with a subtle drop shadow and white 'BR' text (SVG already contains text)
  try {
    await sharp(svgPath)
      .resize(192, 192, { fit: 'contain' })
      .png({ quality: 90 })
      .toFile(out192);
    console.log('Rendered', out192);

    await sharp(svgPath)
      .resize(512, 512, { fit: 'contain' })
      .png({ quality: 90 })
      .toFile(out512);
    console.log('Rendered', out512);
  } catch (err) {
    console.error('Render failed', err);
    process.exit(1);
  }
}

render();
