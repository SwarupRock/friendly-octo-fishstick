// node shot.mjs <t1> <t2> ... → stills/<t>.jpg   |   node shot.mjs --all → frames piped to ffmpeg
import puppeteer from 'puppeteer-core';
import ffmpeg from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const FPS = 30;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--allow-file-access-from-files', '--force-color-profile=srgb', '--hide-scrollbars'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()));
await page.setViewport({ width: 960, height: 540, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(path.resolve('comp.html')).href, { waitUntil: 'networkidle0' });
await page.evaluate(() => window.ready);
const dur = await page.evaluate(() => window.DURATION);
const args = process.argv.slice(2);
if (args[0] === '--all') {
  const n = Math.round(dur * FPS);
  const ff = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-r', String(FPS), 'video.mp4'], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.render(t), i / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 97 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 60 === 0) console.log('frame', i, '/', n);
  }
  ff.stdin.end(); await new Promise((r) => ff.on('close', r));
} else {
  fs.mkdirSync('stills', { recursive: true });
  for (const a of args) {
    await page.evaluate((t) => window.render(t), parseFloat(a));
    await page.screenshot({ path: `stills/${a}.jpg`, type: 'jpeg', quality: 80 });
  }
  console.log(await page.evaluate(() => JSON.stringify(H)));
}
await browser.close();
