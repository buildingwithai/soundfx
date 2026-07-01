// Generates the soundfx-classic CESP pack: original synthesized earcons we
// fully own (no third-party audio — see docs/sound-provenance.md).
//
// Sound design: 6 "voices" spread across consonant roots so overlapping
// sessions sound musical, not chaotic. Per voice:
//   task.complete   rising major arpeggio (root-3rd-5th), bright, resolved
//   input.required  two-note rising 4th that stays UNRESOLVED (a question)
//   task.progress   single soft pluck (subagents fire often — keep it light)
//   task.error      falling minor second, low (shared, 2 variants)
//
// Run once: node scripts/generate-classic-pack.mjs  (outputs are committed)

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import ffmpegPath from 'ffmpeg-static';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACK_DIR = path.join(ROOT, 'packs', 'soundfx-classic');
const SOUNDS_DIR = path.join(PACK_DIR, 'sounds');
fs.mkdirSync(SOUNDS_DIR, { recursive: true });

// Voice roots (Hz): C4 D4 E4 G4 A4 C5 — pentatonic-ish, mutually consonant.
const ROOTS = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];

// tone(freq, start, dur, gain, decay, harmonic2): one plucked partial as an
// aevalsrc term — sine + a touch of 2nd harmonic, exponential decay envelope.
function tone(freq, start, dur, gain, decay, h2 = 0.3) {
  const t = `(t-${start.toFixed(3)})`;
  const env = `exp(-${decay}*${t})*between(t,${start.toFixed(3)},${(start + dur).toFixed(3)})`;
  return `${gain}*${env}*(sin(2*PI*${freq.toFixed(2)}*${t})+${h2}*sin(2*PI*${(freq * 2).toFixed(2)}*${t}))`;
}

function render(file, terms, totalSeconds) {
  const expr = terms.join('+');
  const result = spawnSync(ffmpegPath, [
    '-y', '-f', 'lavfi',
    '-i', `aevalsrc='${expr}':s=44100:d=${totalSeconds}`, // quoted: commas in between() must survive the filtergraph parser
    '-af', 'afade=t=out:st=' + (totalSeconds - 0.05) + ':d=0.05,volume=0.9',
    '-ac', '1', '-ar', '44100', '-sample_fmt', 's16',
    path.join(SOUNDS_DIR, file)
  ], { stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`ffmpeg failed for ${file}:\n${result.stderr?.slice(-400)}`);
    process.exit(1);
  }
  console.log(`  ${file}`);
}

console.log('Rendering soundfx-classic earcons…');
const manifest = {
  cesp_version: '1.0',
  name: 'soundfx-classic',
  display_name: 'soundfx Classic',
  version: '1.0.0',
  author: 'buildingwithai',
  license: 'MIT',
  description: 'Original synthesized earcons. Six voices — variant N is per-session voice N.',
  categories: {
    'task.complete': { sounds: [] },
    'input.required': { sounds: [] },
    'task.progress': { sounds: [] },
    'task.error': { sounds: [] }
  }
};

ROOTS.forEach((root, i) => {
  const third = root * 1.26; // major third
  const fifth = root * 1.5;
  const fourth = root * 4 / 3;

  // done: root -> third -> fifth, each pluck slightly later and brighter
  render(`done-${i + 1}.wav`, [
    tone(root, 0, 0.5, 0.5, 9),
    tone(third, 0.09, 0.5, 0.45, 8),
    tone(fifth, 0.18, 0.6, 0.5, 6)
  ], 0.85);
  manifest.categories['task.complete'].sounds.push({ file: `sounds/done-${i + 1}.wav`, label: `Done (voice ${i + 1})` });

  // needs input: root then up a 4th, second note held longer — unresolved
  render(`needs-input-${i + 1}.wav`, [
    tone(root, 0, 0.3, 0.5, 10),
    tone(fourth, 0.22, 0.7, 0.55, 4.5)
  ], 1.0);
  manifest.categories['input.required'].sounds.push({ file: `sounds/needs-input-${i + 1}.wav`, label: `Needs you (voice ${i + 1})` });

  // subagent tick: one light pluck, octave up, fast decay
  render(`tick-${i + 1}.wav`, [
    tone(root * 2, 0, 0.3, 0.4, 14, 0.15)
  ], 0.35);
  manifest.categories['task.progress'].sounds.push({ file: `sounds/tick-${i + 1}.wav`, label: `Subagent (voice ${i + 1})` });
});

// error: shared across voices — falling minor second, low register
[196.0, 155.56].forEach((freq, i) => {
  render(`error-${i + 1}.wav`, [
    tone(freq, 0, 0.35, 0.55, 7, 0.5),
    tone(freq * 0.944, 0.18, 0.5, 0.5, 6, 0.5) // down a semitone
  ], 0.8);
  manifest.categories['task.error'].sounds.push({ file: `sounds/error-${i + 1}.wav`, label: `Error ${i + 1}` });
});

fs.writeFileSync(path.join(PACK_DIR, 'openpeon.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\nWrote ${PACK_DIR}/openpeon.json (${ROOTS.length * 3 + 2} sounds)`);
