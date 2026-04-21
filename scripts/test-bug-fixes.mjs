import assert from 'node:assert/strict';
import { getHookSnippet, SOUND_LIBRARY } from '../src/core/index.js';
import { isPrintableSearchInput } from '../src/core/tui.js';

function assertSearchInputBehavior() {
  const soundPane = 'sounds';
  const eventPane = 'events';
  const plainKey = { ctrl: false, meta: false };

  for (const letter of ['p', 'q', 'r', 'f', 'h', 'l', 'e', 's']) {
    assert.equal(
      isPrintableSearchInput(letter, plainKey, soundPane),
      true,
      `expected "${letter}" to be accepted as search text in the sound pane`
    );
  }

  assert.equal(
    isPrintableSearchInput('p', { ctrl: true, meta: false }, soundPane),
    false,
    'Ctrl+P should stay a shortcut, not search text'
  );
  assert.equal(
    isPrintableSearchInput(' ', plainKey, soundPane),
    false,
    'Space should stay reserved for preview toggle'
  );
  assert.equal(
    isPrintableSearchInput('p', plainKey, eventPane),
    false,
    'Search text should only start in the sound pane'
  );
}

function assertPowerShellInterruptBehavior() {
  const snippet = getHookSnippet('powershell');
  assert.ok(snippet, 'expected a PowerShell hook snippet');
  assert.match(snippet, /PipelineStoppedException/, 'expected interrupt detection in PowerShell hook');
  assert.match(snippet, /Invoke-SoundfxEvent 'command_interrupted'/, 'expected command_interrupted event in PowerShell hook');

  const interruptIndex = snippet.indexOf("Invoke-SoundfxEvent 'command_interrupted'");
  const errorIndex = snippet.indexOf("Invoke-SoundfxEvent 'command_error'");
  assert.ok(interruptIndex >= 0 && errorIndex >= 0 && interruptIndex < errorIndex,
    'expected PowerShell hook to classify Ctrl+C before generic command_error');
}

function assertSoundLibraryStillIncludesNoSound() {
  assert.equal(SOUND_LIBRARY[0]?.id, 'none', 'expected No sound to stay pinned at the top of the library');
}

assertSearchInputBehavior();
assertPowerShellInterruptBehavior();
assertSoundLibraryStillIncludesNoSound();

console.log('Bug-fix checks passed.');
