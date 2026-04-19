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

export const TERMINAL_EVENTS = [
  { id: 'unknown_command', label: 'Unknown command entered' },
  { id: 'command_success', label: 'Command executed successfully' },
  { id: 'command_error', label: 'Command failed with error' },
  { id: 'sudo_used', label: 'Sudo or admin command used' },
  { id: 'git_commit', label: 'Git commit created' },
  { id: 'npm_install', label: 'Package install completed' },
];

export const SOUND_LIBRARY = DEFAULT_SOUNDS.map((sound) => ({
  id: sound.id,
  name: sound.name,
  url: sound.url
}));

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
  soundfx setup
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

__soundfx_preexec() {
  __soundfx_last_command="$BASH_COMMAND"
  case "$__soundfx_last_command" in
    sudo*) ${bashCommand} event sudo_used >/dev/null 2>&1 & ;;
  esac
}

trap '__soundfx_preexec' DEBUG

__soundfx_precmd() {
  local exit_code=$?
  if [[ -n "$__soundfx_last_command" && "$__soundfx_last_command" != "${bashCommand} event "* ]]; then
    if [[ $exit_code -eq 0 ]]; then
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
  ${bashCommand} event unknown_command >/dev/null 2>&1 &
  echo "command not found: $1"
  return 127
}

command_not_found_handler() {
  ${bashCommand} event unknown_command >/dev/null 2>&1 &
  echo "command not found: $1"
  return 127
}
${markerEnd}`;
  }

  if (shellName === 'zsh') {
    return `${markerStart}
typeset -g SOUNDFX_LAST_COMMAND=""

function soundfx_preexec() {
  SOUNDFX_LAST_COMMAND="$1"
  case "$SOUNDFX_LAST_COMMAND" in
    sudo*) ${bashCommand} event sudo_used >/dev/null 2>&1 & ;;
  esac
}

function soundfx_precmd() {
  local exit_code=$?
  if [[ -n "$SOUNDFX_LAST_COMMAND" && "$SOUNDFX_LAST_COMMAND" != "${bashCommand} event "* ]]; then
    if [[ $exit_code -eq 0 ]]; then
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
    sampleSoundName: sample?.name || sampleSound
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
