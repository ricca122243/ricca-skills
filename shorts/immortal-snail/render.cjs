// Renders scene.html frame by frame and pipes JPEG frames into ffmpeg.
// node render.js timeline.json out.mp4 [comma-separated preview times]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

(async () => {
  const [tlPath, outPath, preview] = process.argv.slice(2);
  const tl = JSON.parse(fs.readFileSync(tlPath, 'utf8'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('console', m => console.log('[page]', m.text()));
  page.on('pageerror', e => { console.error('[page error]', e); process.exit(1); });
  await page.goto('file://' + path.join(__dirname, 'scene.html'));
  await page.evaluate(async t => { await document.fonts.ready; window.setTimeline(t); }, tl);

  const grab = async t => {
    const url = await page.evaluate(t => { window.render(t); return document.getElementById('c').toDataURL('image/jpeg', 0.93); }, t);
    return Buffer.from(url.split(',')[1], 'base64');
  };

  if (preview) {
    const dir = path.dirname(outPath);
    for (const s of preview.split(',')) {
      const t = parseFloat(s);
      fs.writeFileSync(path.join(dir, `preview_${t.toFixed(2)}.jpg`), await grab(t));
    }
    await browser.close();
    return;
  }

  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(tl.fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', outPath], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.ceil(tl.total * tl.fps);
  for (let i = 0; i < frames; i++) {
    const buf = await grab(i / tl.fps);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i}/${frames}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  console.log('video ok');
})();
