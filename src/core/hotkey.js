import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { getHookCommandSpec, getHotkeyConfig, playSound } from './index.js';

const require = createRequire(import.meta.url);

// node-global-key-listener ships a native helper binary. If npm dropped its
// executable bit, the library falls back to a sudo password prompt to chmod it
// (which would hang a background launch agent). We own the file, so a plain
// chmod fixes it silently first. ponytail: this backend covers macOS + Windows
// only — no Linux key server, so `listen` is mac/win for now.
function ensureKeyServerExecutable() {
  if (os.platform() === 'win32') return; // .exe needs no chmod
  try {
    const pkgPath = require.resolve('node-global-key-listener/package.json');
    const binPath = path.join(path.dirname(pkgPath), 'bin', 'MacKeyServer');
    fs.chmodSync(binPath, 0o755);
  } catch {}
}

export const LAUNCH_AGENT_LABEL = 'com.buildingwithai.soundfx.hotkey';
export const LAUNCH_AGENT_PATH = path.join(
  os.homedir(),
  'Library',
  'LaunchAgents',
  `${LAUNCH_AGENT_LABEL}.plist`
);
export const HOTKEY_LOG_PATH = path.join(os.homedir(), '.soundfx-hotkey.log');

function log(message) {
  // Security: we log only state transitions and trigger events, never key names.
  try {
    fs.appendFileSync(HOTKEY_LOG_PATH, `${new Date().toISOString()} ${message}\n`);
  } catch {}
}

// node-global-key-listener emits names like "6" and "NUMPAD 6"; collapse them.
export function normalizeKeyName(rawName) {
  return String(rawName).replace(/^NUMPAD /, '').trim();
}

// Pure, event-driven sequence detector. No timers, so nothing to leak: the
// timing window is enforced by comparing timestamps when the next key arrives.
// Returns a `handleKey(rawName)` function that calls onTrigger when the full
// sequence is entered within the window (with a cooldown to swallow auto-repeat).
export function createSequenceDetector({
  sequence,
  windowMs,
  cooldownMs = 600,
  onTrigger,
  now = Date.now
}) {
  if (!Array.isArray(sequence) || sequence.length === 0) {
    throw new Error('sequence must be a non-empty array of key names');
  }
  const keys = sequence.map(normalizeKeyName);
  let progress = 0;
  let lastAt = 0;
  let lastTrigger = -Infinity; // first trigger must never be swallowed by cooldown

  return function handleKey(rawName) {
    const name = normalizeKeyName(rawName);
    const t = now();

    if (progress > 0 && name === keys[progress] && t - lastAt <= windowMs) {
      progress += 1;
      lastAt = t;
    } else if (name === keys[0]) {
      progress = 1;
      lastAt = t;
    } else {
      progress = 0;
      return;
    }

    if (progress === keys.length) {
      progress = 0;
      if (t - lastTrigger >= cooldownMs) {
        lastTrigger = t;
        onTrigger();
      }
    }
  };
}

function macPermissionHelp() {
  return [
    'macOS needs permission to watch the keyboard globally.',
    'Grant it once: System Settings → Privacy & Security → Input Monitoring,',
    'then enable your terminal app (or node). Re-run `soundfx listen` afterward.'
  ].join('\n');
}

export async function runHotkeyListener() {
  const { sequence, windowMs, soundId } = getHotkeyConfig();
  const label = sequence.join(' → ');

  ensureKeyServerExecutable();

  let GlobalKeyboardListener;
  try {
    ({ GlobalKeyboardListener } = await import('node-global-key-listener'));
  } catch {
    console.error('soundfx: the global key listener dependency is missing.');
    console.error('Reinstall the package: npm install -g @buildingwithai/soundfx');
    process.exit(1);
  }

  const detector = createSequenceDetector({
    sequence,
    windowMs,
    onTrigger: () => {
      log(`trigger sequence="${label}" sound=${soundId}`);
      playSound(soundId).catch(() => {});
    }
  });

  let listener;
  try {
    listener = new GlobalKeyboardListener();
  } catch (error) {
    log(`listener-start-failed ${error instanceof Error ? error.message : String(error)}`);
    console.error('soundfx: could not start the global key listener.');
    console.error(macPermissionHelp());
    process.exit(1);
  }

  // Only the key name reaches the detector, and it is never persisted.
  listener.addListener((event) => {
    if (event.state === 'DOWN') detector(event.name);
  });

  log(`listener-start sequence="${label}" window=${windowMs}ms sound=${soundId}`);
  console.log(`soundfx: listening for ${label} (within ${windowMs}ms) → plays ${soundId}`);
  console.log('Press Ctrl+C to stop. On first run, grant Input Monitoring if macOS asks.');

  const stop = () => {
    try {
      listener.kill();
    } catch {}
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

function buildLaunchAgentPlist() {
  const { executable, scriptPath } = getHookCommandSpec();
  const args = [executable, scriptPath, 'listen']
    .map((value) => `    <string>${value}</string>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${HOTKEY_LOG_PATH}</string>
  <key>StandardErrorPath</key>
  <string>${HOTKEY_LOG_PATH}</string>
</dict>
</plist>
`;
}

export function installLaunchAgent() {
  if (os.platform() !== 'darwin') {
    // ponytail: macOS-only for now. Upgrade path: Windows Task Scheduler /
    // startup shortcut, Linux systemd --user service. Run `soundfx listen`
    // manually on those platforms in the meantime.
    return {
      ok: false,
      message: 'Auto-start is macOS-only right now. Run `soundfx listen` to start it manually.'
    };
  }

  ensureKeyServerExecutable();
  fs.mkdirSync(path.dirname(LAUNCH_AGENT_PATH), { recursive: true });
  fs.writeFileSync(LAUNCH_AGENT_PATH, buildLaunchAgentPlist());
  spawnSync('launchctl', ['unload', LAUNCH_AGENT_PATH], { stdio: 'ignore' });
  const result = spawnSync('launchctl', ['load', '-w', LAUNCH_AGENT_PATH], {
    stdio: 'pipe',
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    return {
      ok: false,
      message: `Wrote ${LAUNCH_AGENT_PATH} but launchctl load failed: ${result.stderr || 'unknown error'}`
    };
  }

  return {
    ok: true,
    message: [
      `Installed launch agent at ${LAUNCH_AGENT_PATH}.`,
      'It now starts at login and after crashes.',
      '',
      'First time only: macOS will ask for Input Monitoring permission.',
      'If you hear nothing, open System Settings → Privacy & Security → Input',
      'Monitoring and enable node (or run `soundfx listen` once in a terminal to',
      'trigger the prompt, then reinstall the agent).'
    ].join('\n')
  };
}

export function uninstallLaunchAgent() {
  if (os.platform() !== 'darwin') {
    return { ok: true, message: 'Nothing to uninstall (auto-start is macOS-only).' };
  }

  if (fs.existsSync(LAUNCH_AGENT_PATH)) {
    spawnSync('launchctl', ['unload', LAUNCH_AGENT_PATH], { stdio: 'ignore' });
    fs.unlinkSync(LAUNCH_AGENT_PATH);
    return { ok: true, message: `Removed launch agent ${LAUNCH_AGENT_PATH}.` };
  }

  return { ok: true, message: 'No launch agent was installed.' };
}

export function getLaunchAgentStatus() {
  const installed = os.platform() === 'darwin' && fs.existsSync(LAUNCH_AGENT_PATH);
  let running = false;
  if (installed) {
    const result = spawnSync('launchctl', ['list', LAUNCH_AGENT_LABEL], { stdio: 'ignore' });
    running = result.status === 0;
  }
  const { sequence, windowMs, soundId } = getHotkeyConfig();
  return { installed, running, sequence, windowMs, soundId, plistPath: LAUNCH_AGENT_PATH };
}
