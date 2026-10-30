const path = require('path');

(async () => {
  try {
    const JimpModule = await import('jimp');
    const Jimp = JimpModule.Jimp || JimpModule.default || JimpModule;
    const src = path.join(__dirname, '..', 'public', 'icon.png');
    const out = path.join(__dirname, '..', 'public', 'icon-square.png');
    const image = await Jimp.read(src);
    const w = image.bitmap.width;
    const h = image.bitmap.height;
    const size = Math.max(w, h, 256);

    const canvas = new Jimp(size, size, 0x00000000);
    const x = Math.floor((size - w) / 2);
    const y = Math.floor((size - h) / 2);
    canvas.composite(image, x, y);

    // Ensure PNG has required minimum size (256)
    if (size < 256) {
      await canvas.resize(256, 256, Jimp.RESIZE_BICUBIC);
    }

    await canvas.writeAsync(out);
    console.log('Created square icon:', out);
    process.exit(0);
  } catch (err) {
    console.error('make-square-icon error:', err);
    process.exit(1);
  }
})();
