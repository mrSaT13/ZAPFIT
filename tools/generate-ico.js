const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
let pngToIco = require('png-to-ico');
if (pngToIco && typeof pngToIco !== 'function' && pngToIco.default) pngToIco = pngToIco.default;

(async () => {
  try {
    const publicDir = path.join(__dirname, '..', 'public');
    const candidates = [
      'icon-16x16.png',
      'icon-32x32.png',
      'icon-48x48.png',
      'icon-192x192.png',
      'icon-256x256.png',
      'icon-512x512.png',
      'icon.png'
    ].map(n => path.join(publicDir, n)).filter(p => fs.existsSync(p));

    if (candidates.length === 0) {
      console.error('No PNG icon candidates found in public/');
      process.exit(2);
    }

    // png-to-ico accepts array of file paths; prefer paths to avoid Buffer mismatches
    const icoBuffer = await pngToIco(candidates);
    const out = path.join(publicDir, 'icon.ico');
    await fsp.writeFile(out, icoBuffer);
    console.log('Generated', out, 'from:', candidates.join(', '));
  } catch (e) {
    console.error('generate-ico failed:', e);
    process.exit(1);
  }
})();
