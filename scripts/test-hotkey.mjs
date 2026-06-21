import assert from 'node:assert';
import { createSequenceDetector, normalizeKeyName } from '../src/core/hotkey.js';

// Fake clock so timing-window behavior is deterministic.
let clock = 0;
const now = () => clock;

function makeDetector(overrides = {}) {
  let fired = 0;
  const handle = createSequenceDetector({
    sequence: ['6', '7'],
    windowMs: 400,
    cooldownMs: 600,
    onTrigger: () => {
      fired += 1;
    },
    now,
    ...overrides
  });
  return { handle, fired: () => fired };
}

// 6 then 7 within the window triggers.
{
  clock = 0;
  const { handle, fired } = makeDetector();
  handle('6');
  clock = 100;
  handle('7');
  assert.strictEqual(fired(), 1, '6 -> 7 within window should fire');
}

// 6 then 7 too slow does not trigger.
{
  clock = 0;
  const { handle, fired } = makeDetector();
  handle('6');
  clock = 500;
  handle('7');
  assert.strictEqual(fired(), 0, '6 -> 7 after window should not fire');
}

// An intervening key breaks the sequence.
{
  clock = 0;
  const { handle, fired } = makeDetector();
  handle('6');
  clock = 50;
  handle('9');
  clock = 80;
  handle('7');
  assert.strictEqual(fired(), 0, '6 -> 9 -> 7 should not fire');
}

// Wrong order does not trigger.
{
  clock = 0;
  const { handle, fired } = makeDetector();
  handle('7');
  clock = 50;
  handle('6');
  assert.strictEqual(fired(), 0, '7 -> 6 should not fire');
}

// Numpad names normalize to the same digits.
{
  clock = 0;
  const { handle, fired } = makeDetector();
  handle('NUMPAD 6');
  clock = 50;
  handle('NUMPAD 7');
  assert.strictEqual(fired(), 1, 'NUMPAD 6 -> NUMPAD 7 should fire');
}

// A repeated first key still allows the match (6, 6, 7 fires once).
{
  clock = 0;
  const { handle, fired } = makeDetector();
  handle('6');
  clock = 30;
  handle('6');
  clock = 60;
  handle('7');
  assert.strictEqual(fired(), 1, '6 -> 6 -> 7 should fire once');
}

// Cooldown swallows a second trigger that comes too fast, then allows it later.
{
  clock = 0;
  const { handle, fired } = makeDetector();
  handle('6');
  clock = 50;
  handle('7');
  assert.strictEqual(fired(), 1, 'first trigger');
  clock = 100;
  handle('6');
  clock = 150;
  handle('7');
  assert.strictEqual(fired(), 1, 'second trigger suppressed by cooldown');
  clock = 800;
  handle('6');
  clock = 850;
  handle('7');
  assert.strictEqual(fired(), 2, 'trigger allowed again after cooldown');
}

// normalizeKeyName basics.
assert.strictEqual(normalizeKeyName('NUMPAD 6'), '6');
assert.strictEqual(normalizeKeyName(' 7 '), '7');

// Empty sequence is rejected.
assert.throws(
  () => createSequenceDetector({ sequence: [], windowMs: 400, onTrigger: () => {} }),
  /non-empty/,
  'empty sequence should throw'
);

console.log('hotkey detector: all checks passed');
