#!/usr/bin/env node

import {
  appendEventLog,
  clearEventLog,
  clearPlaybackLog,
  detectPreferredShell,
  ensureSetupForLaunch,
  findEvent,
  findSound,
  formatDoctorReport,
  getDoctorReport,
  getHookSnippet,
  getHotkeyConfig,
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
  runSetup,
  runUninstall,
  saveConfig,
  setHotkeySound,
  shouldSuppressEvent,
  uninstallHookSnippet
} from './index.js';
import {
  getLaunchAgentStatus,
  installLaunchAgent,
  runHotkeyListener,
  uninstallLaunchAgent
} from './hotkey.js';
import { runTui } from './tui.js';

const args = process.argv.slice(2);
const command = args[0];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  console.log(formatDoctorReport(report));
  process.exit(0);
}

if (command === 'play' || command === 'event') {
  const eventId = args[1] || 'unknown_command';
  (async () => {
    if (eventId === 'command_error' || eventId === 'command_success') {
      await sleep(120);
    }
    if (shouldSuppressEvent(eventId)) {
      setTimeout(() => process.exit(0), 50);
      return;
    }
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

if (command === 'setup') {
  const shellName = args[1] || detectPreferredShell();
  const result = await runSetup(shellName);
  console.log(result.message);
  process.exit(result.ok ? 0 : 1);
}

if (command === 'uninstall') {
  const shellName = args[1] || detectPreferredShell();
  const result = await runUninstall(shellName);
  console.log(result.message);
  process.exit(result.ok ? 0 : 1);
}

if (command === 'listen') {
  await runHotkeyListener();
}

if (command === 'hotkey') {
  const sub = args[1] || 'status';
  if (sub === 'install') {
    const result = installLaunchAgent();
    console.log(result.message);
    process.exit(result.ok ? 0 : 1);
  } else if (sub === 'uninstall') {
    const result = uninstallLaunchAgent();
    console.log(result.message);
    process.exit(result.ok ? 0 : 1);
  } else if (sub === 'sound') {
    const soundId = args[2];
    const sound = findSound(soundId);
    if (!sound) {
      console.log(`Unknown sound: ${soundId}`);
      printSounds();
      process.exit(1);
    }
    (async () => {
      const hotkey = await setHotkeySound(sound.id);
      console.log(`Hotkey ${hotkey.sequence.join(' → ')} now plays ${sound.name} (${sound.id}).`);
      console.log('If the listener is already running, restart it: `soundfx hotkey uninstall && soundfx hotkey install`.');
      process.exit(0);
    })();
  } else if (sub === 'test') {
    (async () => {
      const { soundId, sequence } = getHotkeyConfig();
      console.log(`Playing the ${sequence.join(' → ')} sound (${soundId})`);
      await playSound(soundId);
      setTimeout(() => process.exit(0), 100);
    })();
  } else if (sub === 'status') {
    const status = getLaunchAgentStatus();
    console.log(`
soundfx hotkey

- Sequence: ${status.sequence.join(' → ')} (within ${status.windowMs}ms)
- Plays: ${findSound(status.soundId)?.name || status.soundId} (${status.soundId})
- Auto-start agent: ${status.installed ? 'installed' : 'not installed'}${status.installed ? ` (${status.running ? 'running' : 'not running'})` : ''}
- Plist: ${status.plistPath}

Commands: hotkey install | hotkey uninstall | hotkey sound <soundId> | hotkey test | listen
`);
    process.exit(0);
  } else {
    console.log(`Unknown hotkey command: ${sub}`);
    console.log('Use: hotkey install | uninstall | status | sound <soundId> | test');
    process.exit(1);
  }
}

if (command === 'tui' || !command) {
  const launchContext = ensureSetupForLaunch(detectPreferredShell());
  await runTui(args, launchContext);
}

if (command && !['hook', 'install-hook', 'uninstall-hook', 'hook-status', 'event-log', 'playback-log', 'doctor', 'play', 'event', 'events', 'sounds', 'assign', 'test-event', 'test-sound', 'tui', 'setup', 'uninstall', 'listen', 'hotkey'].includes(command)) {
  printUsage();
  process.exit(1);
}
