// Pull the exact lucide icon shapes the app uses, so the video draws the same icons.
import fs from 'node:fs';
const dir = '../../friendly-octo-fishstick/frontend/node_modules/lucide-react/dist/esm/icons/';
const names = ['audio-lines','check','copy','download','history','keyboard','layout-grid','log-out','mic','pencil','plus','sparkles','moon','sun','arrow-right'];
const out = {};
for (const n of names) {
  const src = fs.readFileSync(dir + n + '.js', 'utf8');
  const arr = src.match(/createLucideIcon\("[^"]+",\s*(\[[\s\S]*?\])\s*\);/)[1];
  const nodes = (0, eval)(arr);
  out[n] = nodes.map(([tag, a]) => `<${tag} ${Object.entries(a).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
}
fs.writeFileSync('icons.js', 'window.ICONS=' + JSON.stringify(out) + ';');
console.log(Object.keys(out).length, 'icons');
