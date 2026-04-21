import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawn, spawnSync, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import ffmpegPath from 'ffmpeg-static';
import { DEFAULT_SOUNDS } from '../../shared/default-sounds.js';
import { playWindowsSoundFile, playWindowsWavFile } from '../platform/windows/audio.js';
import { playMacSoundFile } from '../platform/macos/audio.js';
import { playLinuxSoundFile } from '../platform/linux/audio.js';

export const CONFIG_PATH = path.join(os.homedir(), '.soundfx-cli.json');
export const LEGACY_CONFIG_PATH = path.join(os.homedir(), '.sonicbarn-cli.json');
export const SOUNDS_CACHE_DIR = path.join(os.homedir(), '.soundfx-cache');
export const LEGACY_SOUNDS_CACHE_DIR = path.join(os.homedir(), '.sonicbarn-cache');
export const EVENT_LOG_PATH = path.join(os.homedir(), '.soundfx-events.log');
export const LEGACY_EVENT_LOG_PATH = path.join(os.homedir(), '.sonicbarn-events.log');
export const PLAYBACK_LOG_PATH = path.join(os.homedir(), '.soundfx-playback.log');
export const LEGACY_PLAYBACK_LOG_PATH = path.join(os.homedir(), '.sonicbarn-playback.log');
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY_PATH = path.join(MODULE_DIR, 'cli.js');
let currentPreviewProcess = null;
let currentPreviewSoundId = null;

export const TERMINAL_EVENTS = [
  { id: 'unknown_command', label: 'Unknown command entered' },
  { id: 'command_success', label: 'Command executed successfully' },
  { id: 'command_error', label: 'Command failed with error' },
  { id: 'command_interrupted', label: 'Command interrupted with Ctrl+C' },
  { id: 'sudo_used', label: 'Sudo or admin command used' },
  { id: 'git_commit', label: 'Git commit created' },
  { id: 'npm_install', label: 'Package install completed' },
];

export const SOUND_LIBRARY = [
  { id: 'none', name: 'No sound', url: null },
  ...DEFAULT_SOUNDS.map((sound) => ({
  id: sound.id,
  name: sound.name,
  url: sound.url
}))
];

const LEGACY_SOUND_ID_MAP = {
  error: 'default-16',
  vine_boom: 'default-9',
  ahh: 'default-13',
  bruh: 'default-7',
  fbi: 'default-40',
  success_chime: 'default-1',
  minecraft_xp: 'default-3',
  windows_error: 'default-16'
};

export function getDefaultConfig() {
  return {
    unknown_command: 'default-16',
    command_error: 'default-7',
    command_success: 'default-1',
    command_interrupted: 'none',
    sudo_used: 'default-16',
    git_commit: 'default-3',
    npm_install: 'default-1'
  };
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function loadConfig() {
  const savedConfig = readJsonFile(CONFIG_PATH) || readJsonFile(LEGACY_CONFIG_PATH);
  if (savedConfig) {
    const migratedConfig = Object.fromEntries(
      Object.entries(savedConfig).map(([eventId, soundId]) => [eventId, LEGACY_SOUND_ID_MAP[soundId] || soundId])
    );
    return { ...getDefaultConfig(), ...migratedConfig };
  }
  return getDefaultConfig();
}

export async function loadConfigWithSync() {
  return loadConfig();
}

export async function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function findEvent(eventId) {
  return TERMINAL_EVENTS.find((event) => event.id === eventId);
}

export function findSound(soundId) {
  return SOUND_LIBRARY.find((sound) => sound.id === soundId);
}

export function formatEvents(config) {
  return TERMINAL_EVENTS.map((event, index) => {
    const sound = findSound(config[event.id]);
    return `  ${index + 1}. ${event.id.padEnd(18)} ${event.label.padEnd(32)} -> ${sound?.name || 'none'}`;
  }).join('\n');
}

export function formatSounds() {
  return SOUND_LIBRARY.map((sound, index) => {
    return `  ${index + 1}. ${sound.id.padEnd(18)} ${sound.name}`;
  }).join('\n');
}

export function printEvents(config) {
  console.log(`\nTerminal events:\n${formatEvents(config)}\n`);
}

export function printSounds() {
  console.log(`\nAvailable sounds:\n${formatSounds()}\n`);
}

export function printUsage() {
  console.log(`
soundfx CLI

Usage:
  soundfx tui
  soundfx setup [shell]
  soundfx uninstall [shell]
  soundfx doctor [shell]
  soundfx events
  soundfx sounds
  soundfx assign <eventId> <soundId>
  soundfx event <eventId>
  soundfx test-event <eventId>
  soundfx test-sound <soundId>
  soundfx hook [bash|zsh|powershell]
  soundfx install-hook [bash|zsh|powershell]
  soundfx uninstall-hook [bash|zsh|powershell]
  soundfx hook-status [bash|zsh|powershell]
  soundfx event-log [clear]
  soundfx playback-log [clear]
  Note: powershell = Windows PowerShell, pwsh = PowerShell 7+
`);
}

function commandExists(command) {
  const result = spawnSync('which', [command], { stdio: 'pipe', encoding: 'utf8' });
  return result.status === 0;
}

export function getShellProfilePath(shellName) {
  if (shellName === 'bash') {
    return path.join(os.homedir(), '.bashrc');
  }
  if (shellName === 'zsh') {
    return path.join(os.homedir(), '.zshrc');
  }
  if (shellName === 'powershell') {
    return path.join(os.homedir(), 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1');
  }
  if (shellName === 'pwsh') {
    return path.join(os.homedir(), 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1');
  }
  return null;
}

export function getHookCommandSpec() {
  return {
    executable: process.execPath,
    scriptPath: CLI_ENTRY_PATH
  };
}

function shellQuote(value) {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

function powershellSingleQuote(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

export function isHookInstalled(shellName) {
  const profilePath = getShellProfilePath(shellName);
  if (!profilePath || !fs.existsSync(profilePath)) {
    return { installed: false, profilePath };
  }

  const markerStart = `# >>> soundfx ${shellName} hook >>>`;
  const contents = fs.readFileSync(profilePath, 'utf-8');
  return { installed: contents.includes(markerStart), profilePath };
}

export function getHookSnippet(shellName, commandSpec = getHookCommandSpec()) {
  const markerStart = `# >>> soundfx ${shellName} hook >>>`;
  const markerEnd = `# <<< soundfx ${shellName} hook <<<`;
  const bashCommand = `${shellQuote(commandSpec.executable)} ${shellQuote(commandSpec.scriptPath)}`;
  const powershellExecutable = powershellSingleQuote(commandSpec.executable);
  const powershellScript = powershellSingleQuote(commandSpec.scriptPath);

  if (shellName === 'bash') {
    return `${markerStart}
__soundfx_last_command=""
__soundfx_unknown_command_fired=0

__soundfx_preexec() {
  __soundfx_last_command="$BASH_COMMAND"
  __soundfx_unknown_command_fired=0
  case "$__soundfx_last_command" in
    sudo*) ${bashCommand} event sudo_used >/dev/null 2>&1 & ;;
  esac
}

trap '__soundfx_preexec' DEBUG

__soundfx_precmd() {
  local exit_code=$?
  if [[ -n "$__soundfx_last_command" && "$__soundfx_last_command" != "${bashCommand} event "* ]]; then
    if [[ $__soundfx_unknown_command_fired -eq 1 ]]; then
      __soundfx_unknown_command_fired=0
    elif [[ $exit_code -eq 130 ]]; then
      ${bashCommand} event command_interrupted >/dev/null 2>&1 &
    elif [[ $exit_code -eq 0 ]]; then
      ${bashCommand} event command_success >/dev/null 2>&1 &
    else
      ${bashCommand} event command_error >/dev/null 2>&1 &
    fi

    case "$__soundfx_last_command" in
      "git commit"*) ${bashCommand} event git_commit >/dev/null 2>&1 & ;;
      "npm install"*|"pnpm install"*|"yarn add"*) ${bashCommand} event npm_install >/dev/null 2>&1 & ;;
    esac
  fi
}

PROMPT_COMMAND="__soundfx_precmd"

command_not_found_handle() {
  __soundfx_unknown_command_fired=1
  ${bashCommand} event unknown_command >/dev/null 2>&1 &
  echo "command not found: $1"
  return 127
}

command_not_found_handler() {
  __soundfx_unknown_command_fired=1
  ${bashCommand} event unknown_command >/dev/null 2>&1 &
  echo "command not found: $1"
  return 127
}
${markerEnd}`;
  }

  if (shellName === 'zsh') {
    return `${markerStart}
typeset -g SOUNDFX_LAST_COMMAND=""
typeset -g SOUNDFX_UNKNOWN_COMMAND_FIRED=0

function soundfx_preexec() {
  SOUNDFX_LAST_COMMAND="$1"
  SOUNDFX_UNKNOWN_COMMAND_FIRED=0
  case "$SOUNDFX_LAST_COMMAND" in
    sudo*) ${bashCommand} event sudo_used >/dev/null 2>&1 & ;;
  esac
}

function soundfx_precmd() {
  local exit_code=$?
  if [[ -n "$SOUNDFX_LAST_COMMAND" && "$SOUNDFX_LAST_COMMAND" != "${bashCommand} event "* ]]; then
    if [[ $SOUNDFX_UNKNOWN_COMMAND_FIRED -eq 1 ]]; then
      SOUNDFX_UNKNOWN_COMMAND_FIRED=0
    elif [[ $exit_code -eq 130 ]]; then
      ${bashCommand} event command_interrupted >/dev/null 2>&1 &
    elif [[ $exit_code -eq 0 ]]; then
      ${bashCommand} event command_success >/dev/null 2>&1 &
    else
      ${bashCommand} event command_error >/dev/null 2>&1 &
    fi

    case "$SOUNDFX_LAST_COMMAND" in
      "git commit"*) ${bashCommand} event git_commit >/dev/null 2>&1 & ;;
      "npm install"*|"pnpm install"*|"yarn add"*) ${bashCommand} event npm_install >/dev/null 2>&1 & ;;
    esac
  fi
}

autoload -Uz add-zsh-hook
add-zsh-hook preexec soundfx_preexec
add-zsh-hook precmd soundfx_precmd

command_not_found_handler() {
  SOUNDFX_UNKNOWN_COMMAND_FIRED=1
  ${bashCommand} event unknown_command >/dev/null 2>&1 &
  echo "command not found: $1"
  return 127
}
${markerEnd}`;
  }

  if (shellName === 'powershell') {
    return `${markerStart}
$global:SoundfxLastHistoryId = -1
$global:SoundfxLastCommand = ""
$global:SoundfxLastErrorCount = $error.Count

function Invoke-SoundfxEvent {
  param([string]$EventName)
  try {
    Start-Process -FilePath ${powershellExecutable} -ArgumentList @(${powershellScript}, 'event', $EventName) -WindowStyle Hidden | Out-Null
  } catch {
    try {
      & ${powershellExecutable} ${powershellScript} event $EventName | Out-Null
    } catch {}
  }
}

$global:SoundfxOriginalPrompt = $function:prompt

function prompt {
  $history = Get-History -Count 1 -ErrorAction SilentlyContinue
  if ($history -and $history.Id -ne $global:SoundfxLastHistoryId) {
    $global:SoundfxLastHistoryId = $history.Id
    $global:SoundfxLastCommand = $history.CommandLine

    if ($global:SoundfxLastCommand -like 'sudo*') {
      Invoke-SoundfxEvent 'sudo_used'
    }

    $newErrorCount = $error.Count
    $latestError = if ($newErrorCount -gt 0) { $error[0] } else { $null }
    $hasNewError = $newErrorCount -gt $global:SoundfxLastErrorCount
    $isUnknownCommand = $false

    if ($hasNewError -and $latestError -and (
      "$($latestError.FullyQualifiedErrorId)" -like '*CommandNotFoundException*' -or
      "$($latestError.CategoryInfo.Reason)" -eq 'CommandNotFoundException'
    )) {
      $isUnknownCommand = $true
    }

    if ($isUnknownCommand) {
      Invoke-SoundfxEvent 'unknown_command'
    } elseif ($hasNewError) {
      Invoke-SoundfxEvent 'command_error'
    } else {
      Invoke-SoundfxEvent 'command_success'
    }

    $global:SoundfxLastErrorCount = $newErrorCount

    if ($global:SoundfxLastCommand -like 'git commit*') {
      Invoke-SoundfxEvent 'git_commit'
    }

    if ($global:SoundfxLastCommand -like 'npm install*' -or $global:SoundfxLastCommand -like 'pnpm install*' -or $global:SoundfxLastCommand -like 'yarn add*') {
      Invoke-SoundfxEvent 'npm_install'
    }
  }

  if ($global:SoundfxOriginalPrompt) {
    & $global:SoundfxOriginalPrompt
  } else {
    "PS $($executionContext.SessionState.Path.CurrentLocation)> "
  }
}
${markerEnd}`;
  }

  return null;
}

export function installHookSnippet(shellName, commandSpec = getHookCommandSpec()) {
  const profilePath = getShellProfilePath(shellName);
  const snippet = getHookSnippet(shellName, commandSpec);

  if (!profilePath || !snippet) {
    return { ok: false, message: `Unsupported shell: ${shellName}` };
  }

  const markerStart = `# >>> soundfx ${shellName} hook >>>`;
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });

  const existing = fs.existsSync(profilePath) ? fs.readFileSync(profilePath, 'utf-8') : '';
  if (existing.includes(markerStart)) {
    const markerEnd = `# <<< soundfx ${shellName} hook <<<`;
    const blockPattern = new RegExp(`${markerStart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${markerEnd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`, 'm');
    const nextContents = existing.replace(blockPattern, snippet).replace(/\n{3,}/g, '\n\n');
    fs.writeFileSync(profilePath, nextContents.trimEnd() + '\n');
    return { ok: true, message: `Updated soundfx hook in ${profilePath}`, profilePath };
  }

  const prefix = existing && !existing.endsWith('\n') ? '\n\n' : '\n';
  fs.appendFileSync(profilePath, `${prefix}${snippet}\n`);
  return { ok: true, message: `Installed soundfx hook into ${profilePath}`, profilePath };
}

export function uninstallHookSnippet(shellName) {
  const profilePath = getShellProfilePath(shellName);
  if (!profilePath || !fs.existsSync(profilePath)) {
    return { ok: false, message: `No profile found for ${shellName}`, profilePath };
  }

  const markerStart = `# >>> soundfx ${shellName} hook >>>`;
  const markerEnd = `# <<< soundfx ${shellName} hook <<<`;
  const contents = fs.readFileSync(profilePath, 'utf-8');
  const blockPattern = new RegExp(`${markerStart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${markerEnd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`, 'm');

  if (!blockPattern.test(contents)) {
    return { ok: true, message: `soundfx hook was not installed in ${profilePath}`, profilePath };
  }

  const nextContents = contents.replace(blockPattern, '').replace(/\n{3,}/g, '\n\n');
  fs.writeFileSync(profilePath, nextContents.trimEnd() + '\n');
  return { ok: true, message: `Removed soundfx hook from ${profilePath}`, profilePath };
}

export function detectPreferredShell() {
  if (process.platform === 'win32') return 'powershell';
  const shellPath = process.env.SHELL || '';
  if (shellPath.includes('zsh')) return 'zsh';
  return 'bash';
}

export function getDoctorReport(shellName = detectPreferredShell()) {
  const resolvedShell = getHookSnippet(shellName) ? shellName : detectPreferredShell();
  const hookStatus = getHookSnippet(resolvedShell) ? isHookInstalled(resolvedShell) : { installed: false, profilePath: getShellProfilePath(resolvedShell) };
  const sampleSound = getDefaultConfig().unknown_command;
  const sample = findSound(sampleSound);
  const audioBackend = getAudioBackendStatus();
  const shellReloadNeeded = hookStatus.installed;

  return {
    packageName: 'soundfx',
    version: process.env.npm_package_version || null,
    nodeVersion: process.version,
    platform: process.platform,
    shell: resolvedShell,
    profilePath: hookStatus.profilePath || 'not-found',
    hookInstalled: hookStatus.installed,
    configPath: CONFIG_PATH,
    cacheDir: SOUNDS_CACHE_DIR,
    sampleSoundId: sampleSound,
    sampleSoundName: sample?.name || sampleSound,
    audioBackend,
    shellReloadNeeded,
    nextSteps: getDoctorNextSteps({
      shell: resolvedShell,
      hookInstalled: hookStatus.installed,
      audioBackend
    })
  };
}

export function getAudioBackendStatus() {
  if (os.platform() === 'darwin') {
    return {
      platformLabel: 'macOS',
      backendName: 'afplay',
      available: commandExists('afplay'),
      permissionsNote: 'No special macOS permission should be required for normal speaker playback.',
      fallbackTestCommand: 'afplay /System/Library/Sounds/Glass.aiff'
    };
  }

  if (os.platform() === 'win32') {
    return {
      platformLabel: 'Windows',
      backendName: 'PowerShell media playback',
      available: true,
      permissionsNote: 'No extra permission is normally required.',
      fallbackTestCommand: null
    };
  }

  return {
    platformLabel: 'Linux',
    backendName: 'ffplay, paplay, aplay, or play',
    available: true,
    permissionsNote: 'No extra permission is normally required, but one supported audio player must exist.',
    fallbackTestCommand: null
  };
}

export function getDoctorNextSteps({ shell, hookInstalled, audioBackend }) {
  const steps = [];

  if (!audioBackend.available) {
    steps.push(`Install or restore the ${audioBackend.backendName} audio backend for ${audioBackend.platformLabel}.`);
    return steps;
  }

  if (!hookInstalled) {
    steps.push(`Run \`soundfx install-hook ${shell}\`.`);
    steps.push(`Open a new terminal window or run \`exec ${shell}\` so the hook is loaded.`);
    steps.push('Run `soundfx test-sound default-16` to confirm you can hear audio.');
    return steps;
  }

  steps.push('Run `soundfx test-sound default-16` to confirm you can hear audio.');
  steps.push(`Open a new terminal window or run \`exec ${shell}\` before testing command-triggered sounds.`);
  if (audioBackend.fallbackTestCommand) {
    steps.push(`If that still fails, test your system audio directly with \`${audioBackend.fallbackTestCommand}\`.`);
  }
  return steps;
}

export function formatDoctorReport(report) {
  const nextStepsText = report.nextSteps.map((step) => `- ${step}`).join('\n');
  const audioBackendLabel = report.audioBackend.available
    ? `${report.audioBackend.backendName} (ready)`
    : `${report.audioBackend.backendName} (missing)`;

  return `
soundfx doctor

- Package: ${report.packageName}
- Node: ${report.nodeVersion}
- Platform: ${report.platform}
- Shell: ${report.shell}
- Hook installed: ${report.hookInstalled ? 'yes' : 'no'}
- Shell profile: ${report.profilePath}
- Config file: ${report.configPath}
- Cache folder: ${report.cacheDir}
- Audio backend: ${audioBackendLabel}
- Default unknown-command sound: ${report.sampleSoundName} (${report.sampleSoundId})

${report.audioBackend.permissionsNote}

Next steps:
${nextStepsText}
`;
}

export async function runSetup(shellName = detectPreferredShell()) {
  const resolvedShell = getHookSnippet(shellName) ? shellName : detectPreferredShell();
  const installResult = installHookSnippet(resolvedShell);
  const report = getDoctorReport(resolvedShell);
  const lines = [
    'soundfx setup',
    '',
    installResult.message,
    '',
    'What this means:',
    `- soundfx is now connected to your ${resolvedShell} shell profile.`,
    `- You still need to open a new terminal window or run \`exec ${resolvedShell}\` before command sounds can trigger.`,
    `- No special macOS security permission should be needed for normal speaker playback.`
  ];

  if (!report.audioBackend.available) {
    lines.push(`- The ${report.audioBackend.backendName} audio backend is missing, so sound playback cannot work yet.`);
  } else {
    lines.push(`- The ${report.audioBackend.backendName} audio backend is available on this machine.`);
  }

  lines.push('', 'Do this next:');
  for (const step of report.nextSteps) {
    lines.push(`- ${step}`);
  }

  return {
    ok: installResult.ok,
    message: lines.join('\n'),
    report
  };
}

export async function runUninstall(shellName = detectPreferredShell()) {
  const resolvedShell = getHookSnippet(shellName) ? shellName : detectPreferredShell();
  const uninstallResult = uninstallHookSnippet(resolvedShell);
  const lines = [
    'soundfx uninstall',
    '',
    uninstallResult.message,
    '',
    'What this means:',
    `- soundfx will stop wiring itself into your ${resolvedShell} shell for future terminal sessions.`,
    `- If your current terminal window is still making sounds, open a new terminal window or run \`exec ${resolvedShell}\` once.`,
    '- If you also want to remove the package itself, run `npm uninstall -g @buildingwithai/soundfx`.'
  ];

  return {
    ok: uninstallResult.ok,
    message: lines.join('\n')
  };
}

export function getLaunchContext(shellName = detectPreferredShell()) {
  const resolvedShell = getHookSnippet(shellName) ? shellName : detectPreferredShell();
  const hookStatus = isHookInstalled(resolvedShell);
  const audioBackend = getAudioBackendStatus();

  return {
    shell: resolvedShell,
    hookInstalled: hookStatus.installed,
    profilePath: hookStatus.profilePath,
    audioBackend
  };
}

export function ensureSetupForLaunch(shellName = detectPreferredShell()) {
  const initial = getLaunchContext(shellName);
  if (initial.hookInstalled) {
    return {
      shell: initial.shell,
      hookInstalled: true,
      hookChanged: false,
      profilePath: initial.profilePath,
      audioBackend: initial.audioBackend,
      installMessage: null
    };
  }

  const installResult = installHookSnippet(initial.shell);
  const afterInstall = getLaunchContext(initial.shell);
  return {
    shell: afterInstall.shell,
    hookInstalled: afterInstall.hookInstalled,
    hookChanged: installResult.ok,
    profilePath: afterInstall.profilePath,
    audioBackend: afterInstall.audioBackend,
    installMessage: installResult.message
  };
}

export function appendEventLog(eventId, soundId) {
  const line = `${new Date().toISOString()} event=${eventId} sound=${soundId || 'none'}\n`;
  fs.appendFileSync(EVENT_LOG_PATH, line);
}

export function clearEventLog() {
  fs.writeFileSync(EVENT_LOG_PATH, '');
}

export function readEventLog() {
  if (!fs.existsSync(EVENT_LOG_PATH)) return '';
  return fs.readFileSync(EVENT_LOG_PATH, 'utf-8');
}

export function clearPlaybackLog() {
  fs.writeFileSync(PLAYBACK_LOG_PATH, '');
}

export function readPlaybackLog() {
  if (!fs.existsSync(PLAYBACK_LOG_PATH)) return '';
  return fs.readFileSync(PLAYBACK_LOG_PATH, 'utf-8');
}

function appendPlaybackLog(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  fs.appendFileSync(PLAYBACK_LOG_PATH, line);
}

function getCachedSoundPath(url) {
  const parsedUrl = new URL(url);
  const extension = path.extname(parsedUrl.pathname) || '.bin';
  const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
  return path.join(SOUNDS_CACHE_DIR, `${path.basename(parsedUrl.pathname, extension)}-${hash}${extension}`);
}

async function downloadAndPlay(url, playerCmd, extraArgs = []) {
  if (!fs.existsSync(SOUNDS_CACHE_DIR)) {
    fs.mkdirSync(SOUNDS_CACHE_DIR, { recursive: true });
  }

  const cacheFile = getCachedSoundPath(url);
  if (!fs.existsSync(cacheFile)) {
    try {
      execSync(`curl -sL "${url}" -o "${cacheFile}"`);
    } catch {
      appendPlaybackLog(`download-failed url=${url}`);
      return;
    }
  }

  const cacheFileUri = `file:///${cacheFile.replace(/\\/g, '/')}`;
  const finalArgs = extraArgs.length > 0
    ? extraArgs.map((arg) => arg.replaceAll('{path}', cacheFile).replaceAll('{fileuri}', cacheFileUri))
    : [cacheFile];
  spawn(playerCmd, finalArgs, { detached: true, stdio: 'ignore' }).unref();
  appendPlaybackLog(`spawned backend=${playerCmd} file=${cacheFile}`);
}

function playLocalFile(filePath, playerCmd, extraArgs = []) {
  const fileUri = `file:///${filePath.replace(/\\/g, '/')}`;
  const finalArgs = extraArgs.length > 0
    ? extraArgs.map((arg) => arg.replaceAll('{path}', filePath).replaceAll('{fileuri}', fileUri))
    : [filePath];
  spawn(playerCmd, finalArgs, { detached: true, stdio: 'ignore' }).unref();
}

function playLocalFileSync(filePath, playerCmd, extraArgs = []) {
  const fileUri = `file:///${filePath.replace(/\\/g, '/')}`;
  const finalArgs = extraArgs.length > 0
    ? extraArgs.map((arg) => arg.replaceAll('{path}', filePath).replaceAll('{fileuri}', fileUri))
    : [filePath];
  spawnSync(playerCmd, finalArgs, { stdio: 'ignore' });
}

function playLocalFileDetached(filePath, playerCmd, extraArgs = []) {
  const fileUri = `file:///${filePath.replace(/\\/g, '/')}`;
  const finalArgs = extraArgs.length > 0
    ? extraArgs.map((arg) => arg.replaceAll('{path}', filePath).replaceAll('{fileuri}', fileUri))
    : [filePath];
  spawn(playerCmd, finalArgs, { detached: true, stdio: 'ignore' }).unref();
}

async function ensureWavFile(cacheFile) {
  const wavFile = cacheFile.replace(/\.[^/.]+$/, '.wav');
  if (fs.existsSync(wavFile)) {
    appendPlaybackLog(`wav-cache-hit file=${wavFile}`);
    return wavFile;
  }

  if (!ffmpegPath) {
    appendPlaybackLog(`wav-convert-skipped reason=no-ffmpeg source=${cacheFile}`);
    return null;
  }

  try {
    execSync(`"${ffmpegPath}" -y -i "${cacheFile}" "${wavFile}"`, { stdio: 'ignore' });
    appendPlaybackLog(`wav-convert-ok source=${cacheFile} output=${wavFile}`);
    return fs.existsSync(wavFile) ? wavFile : null;
  } catch {
    appendPlaybackLog(`wav-convert-failed source=${cacheFile}`);
    return null;
  }
}

async function ensureCachedSoundFile(url) {
  if (!fs.existsSync(SOUNDS_CACHE_DIR)) {
    fs.mkdirSync(SOUNDS_CACHE_DIR, { recursive: true });
  }

  const cacheFile = getCachedSoundPath(url);
  if (!fs.existsSync(cacheFile)) {
    try {
      execSync(`curl -sL "${url}" -o "${cacheFile}"`);
      appendPlaybackLog(`cache-download-ok file=${cacheFile}`);
    } catch {
      appendPlaybackLog(`cache-download-failed url=${url}`);
      return null;
    }
  } else {
    appendPlaybackLog(`cache-hit file=${cacheFile}`);
  }

  return cacheFile;
}

function tryWindowsNativeMediaPlayback(filePath) {
  const result = playWindowsSoundFile(filePath);
  if (result.ok) {
    appendPlaybackLog(`backend=windows-native-mp3 file=${filePath}`);
    return true;
  }
  appendPlaybackLog(`backend=windows-native-mp3-failed file=${filePath} code=${result.code ?? 'null'} stderr=${result.stderr}`);
  return false;
}

function tryWindowsWavFallback(filePath) {
  const result = playWindowsWavFile(filePath);
  if (result.ok) {
    appendPlaybackLog(`backend=windows-wav-fallback file=${filePath}`);
    return true;
  }
  appendPlaybackLog(`backend=windows-wav-fallback-failed file=${filePath} code=${result.code ?? 'null'} stderr=${result.stderr}`);
  return false;
}

export async function playSound(soundId) {
  const sound = findSound(soundId);
  if (!sound) return;
  if (!sound.url) return;

  if (os.platform() === 'win32') {
    const cacheFile = await ensureCachedSoundFile(sound.url);
    if (!cacheFile) {
      return;
    }

    const playedDirect = tryWindowsNativeMediaPlayback(cacheFile);
    if (playedDirect) {
      return;
    }

    const wavFile = await ensureWavFile(cacheFile);
    if (wavFile && tryWindowsWavFallback(wavFile)) {
      return;
    }

    appendPlaybackLog(`backend=windows-final-fallback-failed sound=${sound.id}`);
    return;
  }

  if (os.platform() === 'darwin') {
    const cacheFile = await ensureCachedSoundFile(sound.url);
    if (!cacheFile) return;
    const result = playMacSoundFile(cacheFile);
    appendPlaybackLog(result.ok
      ? `backend=macos-afplay file=${cacheFile}`
      : `backend=macos-afplay-failed file=${cacheFile} code=${result.code ?? 'null'} stderr=${result.stderr}`);
    return;
  }

  if (os.platform() === 'linux') {
    const cacheFile = await ensureCachedSoundFile(sound.url);
    if (!cacheFile) return;
    const result = playLinuxSoundFile(cacheFile);
    appendPlaybackLog(result.ok
      ? `backend=linux-${result.player} file=${cacheFile}`
      : `backend=linux-failed file=${cacheFile} stderr=${result.stderr}`);
    return;
  }
}

function clearPreviewState(processRef = null) {
  if (!processRef || currentPreviewProcess === processRef) {
    currentPreviewProcess = null;
    currentPreviewSoundId = null;
  }
}

function attachPreviewLifecycle(child, soundId) {
  currentPreviewProcess = child;
  currentPreviewSoundId = soundId;

  child.on('exit', () => {
    clearPreviewState(child);
  });

  child.on('error', () => {
    clearPreviewState(child);
  });
}

function startMacPreview(filePath, soundId) {
  const child = spawn('afplay', [filePath], { stdio: 'ignore' });
  attachPreviewLifecycle(child, soundId);
  return { ok: true, soundId };
}

function startLinuxPreview(filePath, soundId) {
  const linuxPlayers = [
    ['paplay', [filePath]],
    ['aplay', [filePath]],
    ['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', filePath]]
  ];

  for (const [player, args] of linuxPlayers) {
    try {
      const child = spawn(player, args, { stdio: 'ignore' });
      attachPreviewLifecycle(child, soundId);
      return { ok: true, soundId };
    } catch {}
  }

  return {
    ok: false,
    soundId,
    reason: 'No supported Linux audio player was found.'
  };
}

function startWindowsPreview(filePath, soundId) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName presentationCore",
    `$player = New-Object System.Windows.Media.MediaPlayer`,
    `$player.Open([Uri]'file:///${filePath.replace(/\\/g, '/')}')`,
    "$deadline = [DateTime]::UtcNow.AddSeconds(5)",
    "while (-not $player.NaturalDuration.HasTimeSpan -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 100 }",
    "$player.Volume = 1.0",
    "$player.Play()",
    "if ($player.NaturalDuration.HasTimeSpan) {",
    "  $durationMs = [Math]::Ceiling($player.NaturalDuration.TimeSpan.TotalMilliseconds) + 250",
    "  Start-Sleep -Milliseconds ([Math]::Min($durationMs, 15000))",
    "} else {",
    "  Start-Sleep -Seconds 4",
    "}",
    "$player.Stop()",
    "$player.Close()"
  ].join('; ');

  try {
    const child = spawn('powershell', [
      '-NoProfile',
      '-STA',
      '-WindowStyle',
      'Hidden',
      '-Command',
      script
    ], { stdio: 'ignore' });
    attachPreviewLifecycle(child, soundId);
    return { ok: true, soundId };
  } catch (error) {
    return {
      ok: false,
      soundId,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

export function getCurrentPreviewSoundId() {
  return currentPreviewSoundId;
}

export function stopPreviewSound() {
  if (!currentPreviewProcess) {
    return { ok: true, stopped: false };
  }

  const processRef = currentPreviewProcess;
  try {
    processRef.kill('SIGTERM');
  } catch {}
  clearPreviewState(processRef);
  return { ok: true, stopped: true };
}

export async function togglePreviewSound(soundId) {
  if (!soundId || soundId === 'none') {
    const result = stopPreviewSound();
    return { ok: true, action: result.stopped ? 'stopped' : 'idle', soundId: 'none' };
  }

  if (currentPreviewSoundId === soundId) {
    stopPreviewSound();
    return { ok: true, action: 'stopped', soundId };
  }

  stopPreviewSound();

  const sound = findSound(soundId);
  if (!sound?.url) {
    return { ok: false, action: 'error', soundId, reason: 'No previewable sound file exists.' };
  }

  const cacheFile = await ensureCachedSoundFile(sound.url);
  if (!cacheFile) {
    return { ok: false, action: 'error', soundId, reason: 'Could not download the sound file.' };
  }

  if (os.platform() === 'darwin') {
    const result = startMacPreview(cacheFile, soundId);
    return { ...result, action: result.ok ? 'started' : 'error' };
  }

  if (os.platform() === 'linux') {
    const result = startLinuxPreview(cacheFile, soundId);
    return { ...result, action: result.ok ? 'started' : 'error' };
  }

  if (os.platform() === 'win32') {
    const result = startWindowsPreview(cacheFile, soundId);
    return { ...result, action: result.ok ? 'started' : 'error' };
  }

  return { ok: false, action: 'error', soundId, reason: 'Unsupported platform.' };
}
