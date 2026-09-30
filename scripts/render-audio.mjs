// Render every Loci sound to WAV so humans can listen: node scripts/render-audio.mjs [sampleRate] [--dry] [--only=substr]
// Writes test-results/audio/*.wav (cues & flame & objects mixed with the same room reverb the headset uses,
// plus a 45 s ambience preview) and prints a duration / peak / RMS table.
import { runnerImport } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const sr = Number(args.find((a) => /^\d+$/.test(a)) ?? 44100);
const dry = args.includes('--dry');
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const outDir = resolve(root, 'test-results/audio');
mkdirSync(outDir, { recursive: true });

const { module: oc } = await runnerImport(resolve(root, 'src/audio/offline-check.ts'), { root, configFile: false, logLevel: 'error' });

const t0 = performance.now();
const ir = oc.roomIR(sr);
const all = oc.renderAll(sr).filter((s) => !only || s.name.includes(only));
const rows = [];
for (const s of all) {
  rows.push(oc.analyze(s.name, s.ch, sr));
  const ch = dry || s.group === 'ambience' ? s.ch : oc.previewMix(s.ch, sr, s.send, ir);
  writeFileSync(resolve(outDir, `${s.name}.wav`), oc.encodeWav(ch, sr));
}
if (!only || 'ambience'.includes(only)) {
  const amb = oc.composeAmbience(sr, 45);
  rows.push(oc.analyze('ambience-preview-45s', amb, sr));
  writeFileSync(resolve(outDir, 'ambience-preview-45s.wav'), oc.encodeWav(amb, sr));
}
console.log(oc.formatTable(rows));
console.log(`\n${rows.length} sounds rendered at ${sr} Hz in ${((performance.now() - t0) / 1000).toFixed(1)} s → ${outDir}`);
