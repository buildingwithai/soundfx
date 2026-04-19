#!/usr/bin/env node

import {
  appendEventLog,
  clearEventLog,
  clearPlaybackLog,
  detectPreferredShell,
  findEvent,
  findSound,
  getDoctorReport,
  getHookSnippet,
  installHookSnippet,
  isHookInstalled,
  loadConfig,
  loadConfigWithSync,
  playSound,
  printEvents,
  printSounds,
  printUsage,
  readEventLog,
  readPlaybackLog,
  saveConfig,
  uninstallHookSnippet
} from './index.js';
import { runTui } from './tui.js';

const args = process.argv.slice(2);
const command = args[0];

if (command === 'hook') {
  const shellName = args[1] || 'bash';
  const snippet = getHookSnippet(shellName);
  if (!snippet) {
    console.log(`Unsupported shell: ${shellName}`);
    printUsage();
    process.exit(1);
  }
  console.log(snippet);
  process.exit(0);
}

if (command === 'install-hook') {
  const shellName = args[1] || (process.platform === 'win32' ? 'powershell' : 'bash');
  const result = installHookSnippet(shellName);
  console.log(result.message);
  process.exit(result.ok ? 0 : 1);
}

if (command === 'hook-status') {
  const shellName = args[1] || (process.platform === 'win32' ? 'powershell' : 'bash');
  if (!getHookSnippet(shellName)) {
    console.log(`Unsupported shell: ${shellName}`);
    process.exit(1);
  }
  const status = isHookInstalled(shellName);
  console.log(status.installed
    ? `soundfx hook is installed for ${shellName} at ${status.profilePath}`
    : `soundfx hook is not installed for ${shellName}. Use \`soundfx install-hook ${shellName}\`.`);
  process.exit(0);
}

if (command === 'uninstall-hook') {
  const shellName = args[1] || (process.platform === 'win32' ? 'powershell' : 'bash');
  const result = uninstallHookSnippet(shellName);
  console.log(result.message);
  process.exit(result.ok ? 0 : 1);
}

if (command === 'event-log') {
  if (args[1] === 'clear') {
    clearEventLog();
    console.log('Cleared soundfx event log.');
    process.exit(0);
  }
  console.log(readEventLog());
  process.exit(0);
}

if (command === 'playback-log') {
  if (args[1] === 'clear') {
    clearPlaybackLog();
    console.log('Cleared soundfx playback log.');
    process.exit(0);
  }
  console.log(readPlaybackLog());
  process.exit(0);
}

if (command === 'doctor') {
  const shellName = args[1] || detectPreferredShell();
  const report = getDoctorReport(shellName);
  console.log(`
soundfx doctor

- Package: ${report.packageName}
- Node: ${report.nodeVersion}
- Platform: ${report.platform}
- Shell: ${report.shell}
- Hook installed: ${report.hookInstalled ? 'yes' : 'no'}
- Shell profile: ${report.profilePath}
- Config file: ${report.configPath}
- Cache folder: ${report.cacheDir}
- Default unknown-command sound: ${report.sampleSoundName} (${report.sampleSoundId})
`);
  if (!report.hookInstalled) {
    console.log(`Next step: run \`soundfx install-hook ${report.shell}\``);
  } else {
    console.log(`Next step: run \`soundfx test-sound ${report.sampleSoundId}\` to confirm you can hear audio.`);
  }
  process.exit(0);
}

if (command === 'play' || command === 'event') {
  const eventId = args[1] || 'unknown_command';
  (async () => {
    const config = await loadConfigWithSync();
    const soundId = config[eventId];
    appendEventLog(eventId, soundId);
    if (soundId) {
      await playSound(soundId);
    }
    setTimeout(() => process.exit(0), 100);
  })();
}

if (command === 'events') {
  (async () => {
    const config = await loadConfigWithSync();
    printEvents(config);
    process.exit(0);
  })();
}

if (command === 'sounds') {
  printSounds();
  process.exit(0);
}

if (command === 'assign') {
  const eventId = args[1];
  const soundId = args[2];
  (async () => {
    const event = findEvent(eventId);
    const sound = findSound(soundId);

    if (!event) {
      console.log(`Unknown event: ${eventId}`);
      printEvents(loadConfig());
      process.exit(1);
    }

    if (!sound) {
      console.log(`Unknown sound: ${soundId}`);
      printSounds();
      process.exit(1);
    }

    const config = await loadConfigWithSync();
    config[event.id] = sound.id;
    await saveConfig(config);
    console.log(`Assigned ${event.id} -> ${sound.name}`);
    process.exit(0);
  })();
}

if (command === 'test-event') {
  const eventId = args[1];
  (async () => {
    const event = findEvent(eventId);
    if (!event) {
      console.log(`Unknown event: ${eventId}`);
      printEvents(loadConfig());
      process.exit(1);
    }

    const config = await loadConfigWithSync();
    const soundId = config[event.id];
    if (!soundId) {
      console.log(`No sound is assigned to ${event.id}`);
      process.exit(1);
    }

    console.log(`Testing ${event.id} -> ${soundId}`);
    await playSound(soundId);
    setTimeout(() => process.exit(0), 100);
  })();
}

if (command === 'test-sound') {
  const soundId = args[1];
  (async () => {
    const sound = findSound(soundId);
    if (!sound) {
      console.log(`Unknown sound: ${soundId}`);
      printSounds();
      process.exit(1);
    }

    console.log(`Testing sound ${sound.name}`);
    await playSound(sound.id);
    setTimeout(() => process.exit(0), 100);
  })();
}

if (command === 'tui' || command === 'setup' || !command) {
  await runTui(args);
}

if (command && !['hook', 'install-hook', 'uninstall-hook', 'hook-status', 'event-log', 'playback-log', 'doctor', 'play', 'event', 'events', 'sounds', 'assign', 'test-event', 'test-sound', 'tui', 'setup'].includes(command)) {
  printUsage();
  process.exit(1);
}
