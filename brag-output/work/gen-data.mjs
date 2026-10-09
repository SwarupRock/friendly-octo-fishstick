// Turn the real pipeline output into the data the composition displays.
import fs from 'node:fs';
const r = JSON.parse(fs.readFileSync('pipeline.json', 'utf8'));
const f = r.created.factsheet.facts, o = f.offer;
// same row order as summarize() in VoiceWorkspace.jsx
const rows = [
  { label: 'Business', value: f.business.name }, { label: 'Offer', value: o.product.join(', ') },
  { label: 'Discount', value: `${o.discount_percent}% off` }, { label: 'Days', value: o.days.join(', ') },
  { label: 'Time', value: [o.start_time, o.end_time].join(' – ') }, { label: 'Where', value: o.location },
];
const captions = {};
for (const a of r.assets) if (a.kind === 'caption' && a.locale === 'en-IN') captions[a.provenance.channel] ??= a.text_content;
fs.writeFileSync('data.js', 'window.DATA=' + JSON.stringify({ transcript: r.created.transcript.raw, rows, captions }, null, 1) + ';');
console.log(r.created.transcript.raw, rows, r.assets.filter(a=>a.kind==='poster').map(a=>[a.status,a.asset_status,a.verification_status]));
