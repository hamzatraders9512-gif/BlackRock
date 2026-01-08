const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return [parseInt(v.substring(0,2),16), parseInt(v.substring(2,4),16), parseInt(v.substring(4,6),16)];
}

function createIcon(size, outPath) {
  const bg = hexToRgb('#0f172a');
  const circle = hexToRgb('#15b37a');

  const png = new PNG({ width: size, height: size });
  const cx = size/2;
  const cy = size/2 - Math.round(size*0.06);
  const radius = Math.round(size*0.34);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      // fill with background
      png.data[idx] = bg[0];
      png.data[idx+1] = bg[1];
      png.data[idx+2] = bg[2];
      png.data[idx+3] = 255;

      // draw circle
      const dx = x - cx;
      const dy = y - cy;
      if (dx*dx + dy*dy <= radius*radius) {
        png.data[idx] = circle[0];
        png.data[idx+1] = circle[1];
        png.data[idx+2] = circle[2];
        png.data[idx+3] = 255;
      }
    }
  }

  // write file
  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const stream = fs.createWriteStream(outPath);
  png.pack().pipe(stream);
  stream.on('finish', () => console.log('Generated', outPath));
}

const root = path.join(__dirname, '..');
createIcon(192, path.join(root, 'assets', 'icon-192.png'));
createIcon(512, path.join(root, 'assets', 'icon-512.png'));
