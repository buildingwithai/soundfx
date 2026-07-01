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
  playSoundFile,
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
import {
  SILENT_AGENT_EVENTS,
  applySessionEvent,
  getAgentHookStatus,
  getAgentPrefs,
  installAgentHooks,
  isMuted,
  isTerminalFrontmost,
  readMuteState,
  readSessions,
  resolveAgentSound,
  setMute,
  uninstallAgentHooks
} from './agents.js';
import {
  getPack,
  installPack,
  listInstalledPacks,
  resolvePackSound,
  uninstallPack
} from './packs.js';
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

// Claude Code hooks pipe a JSON payload (session_id, cwd, ...) on stdin.
// Read it with a short timeout so manual terminal invocations don't hang.
function readStdinJson(timeoutMs = 250) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve(null);
    let data = '';
    const finish = () => {
      try { resolve(JSON.parse(data)); } catch { resolve(null); }
    };
    const timer = setTimeout(finish, timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => { clearTimeout(timer); finish(); });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(null); });
  });
}

// Called by Claude Code hooks / the Codex dispatcher. Plays with overlap so
// parallel subagents finishing together are all heard. No suppression guard —
// agent events are semantic, not racy shell-exit heuristics.
if (command === 'agent-event') {
  const eventId = args[1];
  (async () => {
    const payload = await readStdinJson();
    const session = applySessionEvent(eventId, payload);

    if (SILENT_AGENT_EVENTS.has(eventId)) {
      process.exit(0);
    }

    if (isMuted(readMuteState())) {
      appendEventLog(eventId, 'muted');
      process.exit(0);
    }

    const config = await loadConfigWithSync();
    const prefs = getAgentPrefs(config);
    if (prefs.focusAware && isTerminalFrontmost()) {
      appendEventLog(eventId, 'suppressed-focus');
      process.exit(0);
    }

    // Precedence: active CESP pack > per-session voice > per-event config.
    // A missing/broken pack falls through to voices — never silent by accident.
    // The session's voiceIndex picks the pack variant deterministically, so
    // parallel agents stay distinguishable by ear even with a pack active.
    const activePack = config.__packs?.active ? getPack(config.__packs.active) : null;
    if (activePack) {
      const variantIndex = prefs.perSessionVoices ? session?.voiceIndex ?? null : null;
      const packFile = resolvePackSound(eventId, activePack.dir, activePack.manifest, { variantIndex });
      if (packFile && (await playSoundFile(packFile))) {
        appendEventLog(eventId, `pack:${activePack.name}${variantIndex !== null ? `#${variantIndex}` : ''}`);
        setTimeout(() => process.exit(0), 100);
        return;
      }
    }

    const soundId = resolveAgentSound(eventId, config, payload?.cwd, prefs, session?.voiceIndex ?? null);
    appendEventLog(eventId, soundId);
    if (soundId) {
      await playSound(soundId, { overlap: true });
    }
    setTimeout(() => process.exit(0), 100);
  })();
}

if (command === 'agents') {
  const sub = args[1] || 'status';
  if (sub === 'init' || sub === 'install') {
    const result = installAgentHooks();
    for (const message of result.messages) console.log(`- ${message}`);
    console.log(`
Agent events and their sounds (change with \`soundfx tui\` or \`soundfx assign\`):
`);
    const config = loadConfig();
    for (const id of ['agent_done', 'agent_needs_input', 'subagent_done', 'agent_error']) {
      const sound = findSound(config[id]);
      console.log(`  ${id.padEnd(18)} -> ${sound?.name || 'none'}`);
    }
    console.log(`
Already-running Claude Code sessions load hooks at startup — new sessions pick
these up automatically. Test now with: soundfx test-event agent_done`);
    process.exit(result.ok ? 0 : 1);
  } else if (sub === 'uninstall') {
    const result = uninstallAgentHooks();
    for (const message of result.messages) console.log(`- ${message}`);
    process.exit(result.ok ? 0 : 1);
  } else if (sub === 'mute') {
    const arg = args[2];
    if (arg === 'off') {
      setMute(0);
      console.log('Agent sounds unmuted.');
    } else {
      const minutes = Number.parseInt(arg, 10) || 60;
      const state = setMute(minutes);
      console.log(`Agent sounds muted until ${new Date(state.until).toLocaleTimeString()}.`);
    }
    process.exit(0);
  } else if (sub === 'focus' || sub === 'voices') {
    const value = args[2];
    if (value !== 'on' && value !== 'off') {
      console.log(`Usage: soundfx agents ${sub} <on|off>`);
      process.exit(1);
    }
    (async () => {
      const config = await loadConfigWithSync();
      config.__agents = { ...getAgentPrefs(config), [sub === 'focus' ? 'focusAware' : 'perSessionVoices']: value === 'on' };
      await saveConfig(config);
      console.log(sub === 'focus'
        ? `Focus-aware playback ${value}. (${value === 'on' ? 'Sounds stay quiet while a terminal/IDE is frontmost.' : 'Sounds always play.'})`
        : `Per-session voices ${value}. (${value === 'on' ? 'Each project gets its own sound set.' : 'All sessions use your configured event sounds.'})`);
      process.exit(0);
    })();
  } else if (sub === 'status') {
    const status = getAgentHookStatus();
    const prefs = getAgentPrefs(loadConfig());
    const mute = readMuteState();
    const sessions = Object.entries(readSessions())
      .sort((a, b) => (b[1].lastEventAt || 0) - (a[1].lastEventAt || 0));
    const stateLabels = { needs_input: 'needs you', working: 'working', done: 'done' };
    const roster = sessions.length === 0
      ? '  (no agent sessions yet)'
      : sessions.map(([, s]) => {
          const age = Math.max(0, Math.round((Date.now() - (s.lastEventAt || 0)) / 60000));
          return `  ${(s.label || '?').padEnd(28)} ${stateLabels[s.state] || s.state}  · ${age}m ago`;
        }).join('\n');
    console.log(`
soundfx agents

- Claude Code hooks: ${status.claudeInstalled ? 'installed' : 'not installed'} (${status.claudeSettingsPath})
- Codex dispatcher:  ${status.codexInstalled ? 'installed' : 'not installed'} (${status.dispatcherPath})
- Focus-aware playback: ${prefs.focusAware ? 'on' : 'off'}
- Per-session voices: ${prefs.perSessionVoices ? 'on' : 'off'}
- Muted: ${isMuted(mute) ? `yes, until ${new Date(mute.until).toLocaleTimeString()}` : 'no'}

Sessions:
${roster}

Commands: agents init | uninstall | status | mute [minutes|off] | focus on|off | voices on|off
`);
    process.exit(0);
  } else {
    console.log(`Unknown agents command: ${sub}`);
    console.log('Use: agents init | uninstall | status | mute [minutes|off] | focus on|off | voices on|off');
    process.exit(1);
  }
}

if (command === 'packs') {
  const sub = args[1] || 'list';
  if (sub === 'list') {
    const packs = listInstalledPacks();
    const active = loadConfig().__packs?.active || null;
    if (packs.length === 0) {
      console.log('\nNo sound packs installed.');
      console.log('Install any CESP pack (openpeon.json format): soundfx packs install <dir-or-git-url>');
      console.log('Community packs: https://github.com/PeonPing/openpeon\n');
    } else {
      console.log('\nInstalled packs:');
      for (const pack of packs) {
        const marker = pack.name === active ? ' (active)' : '';
        const categories = Object.keys(pack.manifest.categories).length;
        console.log(`  ${pack.name.padEnd(24)} ${pack.manifest.display_name || ''} — ${categories} categories${marker}`);
      }
      console.log(`\nActivate one: soundfx packs use <name> | back to voices: soundfx packs off\n`);
    }
    process.exit(0);
  } else if (sub === 'install') {
    const source = args[2];
    if (!source) {
      console.log('Usage: soundfx packs install <directory-or-git-url>');
      process.exit(1);
    }
    const result = installPack(source);
    console.log(result.message);
    if (result.ok) console.log(`Activate it: soundfx packs use ${result.name}`);
    process.exit(result.ok ? 0 : 1);
  } else if (sub === 'uninstall') {
    const result = uninstallPack(args[2]);
    console.log(result.message);
    process.exit(result.ok ? 0 : 1);
  } else if (sub === 'use') {
    const pack = getPack(args[2]);
    if (!pack) {
      console.log(`Pack not installed: ${args[2]} (see: soundfx packs list)`);
      process.exit(1);
    }
    (async () => {
      const config = await loadConfigWithSync();
      config.__packs = { active: pack.name };
      await saveConfig(config);
      console.log(`Agent sounds now play from "${pack.manifest.display_name || pack.name}".`);
      process.exit(0);
    })();
  } else if (sub === 'off') {
    (async () => {
      const config = await loadConfigWithSync();
      config.__packs = { active: null }; // explicit off — a deleted key would resurrect the default pack
      await saveConfig(config);
      console.log('Pack deactivated — agent sounds use per-session voices again.');
      process.exit(0);
    })();
  } else {
    console.log(`Unknown packs command: ${sub}`);
    console.log('Use: packs list | install <dir-or-git-url> | use <name> | off | uninstall <name>');
    process.exit(1);
  }
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

if (command && !['hook', 'install-hook', 'uninstall-hook', 'hook-status', 'event-log', 'playback-log', 'doctor', 'play', 'event', 'events', 'sounds', 'assign', 'test-event', 'test-sound', 'tui', 'setup', 'uninstall', 'listen', 'hotkey', 'agents', 'agent-event', 'packs'].includes(command)) {
  printUsage();
  process.exit(1);
}
