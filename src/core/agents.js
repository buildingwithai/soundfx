import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { getHookCommandSpec } from './index.js';

// Shepherd week 1: wire AI coding agents (Claude Code + Codex) into soundfx.
// Claude Code lifecycle hooks and the Codex notify program both end up calling
// `soundfx agent-event <id>`, which plays the configured sound WITH overlap so
// parallel subagent completions don't cut each other off.

export const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
export const CODEX_CONFIG_PATH = path.join(os.homedir(), '.codex', 'config.toml');
export const CODEX_DISPATCHER_PATH = path.join(os.homedir(), '.soundfx', 'codex-notify.sh');

export const AGENT_HOOK_MARKER = '# soundfx-agent-hook';

// Claude Code hook event -> soundfx agent event.
// Notification covers "agent needs your permission/input" — the expensive state.
// PostToolUseFailure is wired but defaults to no sound (opt-in via the TUI): it
// fires on every failed tool call, which is too chatty to ding by default.
// UserPromptSubmit / SessionEnd are silent state-tracking events: they keep the
// menu-bar roster's Working list accurate and remove ended sessions.
export const CLAUDE_HOOK_MAP = {
  Stop: 'agent_done',
  SubagentStop: 'subagent_done',
  Notification: 'agent_needs_input',
  PostToolUseFailure: 'agent_error',
  UserPromptSubmit: 'agent_working',
  SessionEnd: 'agent_session_end'
};

export const SILENT_AGENT_EVENTS = new Set(['agent_working', 'agent_session_end']);

function shQuote(value) {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

function agentEventCommand(eventId, commandSpec = getHookCommandSpec()) {
  return `${shQuote(commandSpec.executable)} ${shQuote(commandSpec.scriptPath)} agent-event ${eventId} ${AGENT_HOOK_MARKER}`;
}

// ---------- Claude Code (settings.json) — pure merge/remove ----------

/** Returns a new settings object with our hook groups appended (never clobbers
 *  existing groups, e.g. SuperIsland's). Idempotent: re-running changes nothing
 *  once the marker is present. */
export function mergeClaudeAgentHooks(settings, commandSpec = getHookCommandSpec()) {
  const next = JSON.parse(JSON.stringify(settings ?? {}));
  next.hooks = next.hooks || {};
  for (const [hookEvent, agentEvent] of Object.entries(CLAUDE_HOOK_MAP)) {
    const groups = Array.isArray(next.hooks[hookEvent]) ? next.hooks[hookEvent] : [];
    const installed = groups.some((group) =>
      (group.hooks || []).some((h) => typeof h.command === 'string' && h.command.includes(AGENT_HOOK_MARKER)));
    if (!installed) {
      groups.push({ hooks: [{ type: 'command', command: agentEventCommand(agentEvent, commandSpec) }] });
    }
    next.hooks[hookEvent] = groups;
  }
  return next;
}

/** Returns a new settings object with only our marker-tagged groups removed. */
export function removeClaudeAgentHooks(settings) {
  const next = JSON.parse(JSON.stringify(settings ?? {}));
  if (!next.hooks) return next;
  for (const hookEvent of Object.keys(CLAUDE_HOOK_MAP)) {
    if (!Array.isArray(next.hooks[hookEvent])) continue;
    next.hooks[hookEvent] = next.hooks[hookEvent].filter((group) => {
      const hooks = group.hooks || [];
      const ours = hooks.length > 0 && hooks.every((h) => typeof h.command === 'string' && h.command.includes(AGENT_HOOK_MARKER));
      return !ours;
    });
    if (next.hooks[hookEvent].length === 0) delete next.hooks[hookEvent];
  }
  return next;
}

export function claudeAgentHooksInstalled(settings) {
  return Object.keys(CLAUDE_HOOK_MAP).every((hookEvent) =>
    (settings?.hooks?.[hookEvent] || []).some((group) =>
      (group.hooks || []).some((h) => typeof h.command === 'string' && h.command.includes(AGENT_HOOK_MARKER))));
}

// ---------- Codex (config.toml notify) — pure rewrite/restore ----------

const NOTIFY_LINE = /^notify\s*=\s*(\[.*\])\s*$/m;
const ORIGINAL_NOTIFY_TAG = '# soundfx:original-notify=';

/** Rewrites the top-level `notify` line to point at our dispatcher. Returns
 *  { toml, originalNotify } — originalNotify is the previous array (or null),
 *  which the dispatcher script must keep forwarding to. Throws if an existing
 *  notify line cannot be parsed (never corrupt the user's config). */
export function rewriteCodexNotify(toml, dispatcherPath = CODEX_DISPATCHER_PATH) {
  const line = `notify = [${JSON.stringify(dispatcherPath)}]`;
  const match = toml.match(NOTIFY_LINE);

  if (!match) {
    const sep = toml.endsWith('\n') || toml === '' ? '' : '\n';
    return { toml: `${toml}${sep}${line}\n`, originalNotify: null, changed: true };
  }

  const originalNotify = JSON.parse(match[1]); // codex uses double-quoted strings — JSON-compatible
  if (originalNotify.length === 1 && originalNotify[0] === dispatcherPath) {
    return { toml, originalNotify: null, changed: false }; // already installed — don't nest
  }
  return { toml: toml.replace(NOTIFY_LINE, line), originalNotify, changed: true };
}

/** Restores the notify line from what the dispatcher script recorded. */
export function restoreCodexNotify(toml, originalNotify) {
  if (!toml.match(NOTIFY_LINE)) return toml;
  if (originalNotify && originalNotify.length > 0) {
    // Match codex's own formatting: `["a", "b"]` with a space after the comma.
    const items = originalNotify.map((item) => JSON.stringify(item)).join(', ');
    return toml.replace(NOTIFY_LINE, `notify = [${items}]`);
  }
  return toml.replace(NOTIFY_LINE, '').replace(/\n{3,}/g, '\n\n');
}

/** The dispatcher: forwards the payload to the user's previous notify program
 *  (preserving e.g. the Computer Use client) AND fires the agent_done sound on
 *  turn completion. Codex passes the notification JSON as the last argument. */
export function buildDispatcherScript(originalNotify, commandSpec = getHookCommandSpec()) {
  const forward = originalNotify && originalNotify.length > 0
    ? `${originalNotify.map(shQuote).join(' ')} "$PAYLOAD" >/dev/null 2>&1 &`
    : ': # no previous notify program to forward to';
  return `#!/bin/sh
# soundfx codex notify dispatcher — generated by \`soundfx agents init\`
${ORIGINAL_NOTIFY_TAG}${JSON.stringify(originalNotify || [])}
PAYLOAD="\${1:-}"
${forward}
case "$PAYLOAD" in
  *agent-turn-complete*) ${shQuote(commandSpec.executable)} ${shQuote(commandSpec.scriptPath)} agent-event agent_done >/dev/null 2>&1 & ;;
esac
exit 0
`;
}

export function extractOriginalNotify(scriptContents) {
  const line = scriptContents.split('\n').find((l) => l.startsWith(ORIGINAL_NOTIFY_TAG));
  if (!line) return null;
  try {
    const parsed = JSON.parse(line.slice(ORIGINAL_NOTIFY_TAG.length));
    return parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

// ---------- install / uninstall / status (thin file I/O) ----------

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function installAgentHooks() {
  const messages = [];

  // Claude Code
  const settings = readJson(CLAUDE_SETTINGS_PATH) || {};
  if (claudeAgentHooksInstalled(settings)) {
    messages.push(`Claude Code hooks already installed in ${CLAUDE_SETTINGS_PATH}`);
  } else {
    const merged = mergeClaudeAgentHooks(settings);
    fs.mkdirSync(path.dirname(CLAUDE_SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(merged, null, 2) + '\n');
    messages.push(`Installed Claude Code hooks (Stop, SubagentStop, Notification, PostToolUseFailure) in ${CLAUDE_SETTINGS_PATH}`);
  }

  // Codex (only if a config exists — don't create one for a tool that isn't installed)
  if (fs.existsSync(CODEX_CONFIG_PATH)) {
    const toml = fs.readFileSync(CODEX_CONFIG_PATH, 'utf-8');
    let result;
    try {
      result = rewriteCodexNotify(toml);
    } catch {
      messages.push(`Skipped Codex: could not safely parse the notify line in ${CODEX_CONFIG_PATH} — wire it manually.`);
      return { ok: true, messages };
    }
    if (!result.changed) {
      messages.push(`Codex notify dispatcher already installed at ${CODEX_DISPATCHER_PATH}`);
    } else {
      fs.mkdirSync(path.dirname(CODEX_DISPATCHER_PATH), { recursive: true });
      fs.writeFileSync(CODEX_DISPATCHER_PATH, buildDispatcherScript(result.originalNotify), { mode: 0o755 });
      fs.writeFileSync(CODEX_CONFIG_PATH, result.toml);
      messages.push(result.originalNotify
        ? `Installed Codex dispatcher at ${CODEX_DISPATCHER_PATH} (still forwards to your previous notify program)`
        : `Installed Codex dispatcher at ${CODEX_DISPATCHER_PATH}`);
    }
  } else {
    messages.push('Codex config not found — skipped (install Codex first, then re-run).');
  }

  return { ok: true, messages };
}

export function uninstallAgentHooks() {
  const messages = [];

  const settings = readJson(CLAUDE_SETTINGS_PATH);
  if (settings && claudeAgentHooksInstalled(settings)) {
    fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(removeClaudeAgentHooks(settings), null, 2) + '\n');
    messages.push(`Removed Claude Code agent hooks from ${CLAUDE_SETTINGS_PATH}`);
  } else {
    messages.push('Claude Code agent hooks were not installed.');
  }

  if (fs.existsSync(CODEX_DISPATCHER_PATH)) {
    const originalNotify = extractOriginalNotify(fs.readFileSync(CODEX_DISPATCHER_PATH, 'utf-8'));
    if (fs.existsSync(CODEX_CONFIG_PATH)) {
      const toml = fs.readFileSync(CODEX_CONFIG_PATH, 'utf-8');
      fs.writeFileSync(CODEX_CONFIG_PATH, restoreCodexNotify(toml, originalNotify));
    }
    fs.unlinkSync(CODEX_DISPATCHER_PATH);
    messages.push(originalNotify
      ? 'Removed Codex dispatcher and restored your previous notify program.'
      : 'Removed Codex dispatcher.');
  } else {
    messages.push('Codex dispatcher was not installed.');
  }

  return { ok: true, messages };
}

export function getAgentHookStatus() {
  const settings = readJson(CLAUDE_SETTINGS_PATH);
  const codexToml = fs.existsSync(CODEX_CONFIG_PATH) ? fs.readFileSync(CODEX_CONFIG_PATH, 'utf-8') : null;
  const codexInstalled = Boolean(codexToml && codexToml.includes(CODEX_DISPATCHER_PATH) && fs.existsSync(CODEX_DISPATCHER_PATH));
  return {
    claudeInstalled: Boolean(settings && claudeAgentHooksInstalled(settings)),
    claudeSettingsPath: CLAUDE_SETTINGS_PATH,
    codexInstalled,
    codexConfigPath: CODEX_CONFIG_PATH,
    dispatcherPath: CODEX_DISPATCHER_PATH
  };
}

// ---------- Week 2: session roster, per-session voices, focus, mute ----------

export const AGENT_SESSIONS_PATH = path.join(os.homedir(), '.soundfx-agent-sessions.json');
export const AGENT_MUTE_PATH = path.join(os.homedir(), '.soundfx-agent-mute.json');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // evict sessions idle half a day

// Per-session voices: the session's project directory hashes to one of these,
// so parallel agents are distinguishable BY EAR. Each voice keeps the same
// semantic trio (done / needs-input / subagent-done) in a different timbre.
export const AGENT_VOICES = [
  { agent_done: 'default-28', agent_needs_input: 'default-25', subagent_done: 'default-2' },  // Another One / Huh? / Boing
  { agent_done: 'default-106', agent_needs_input: 'default-108', subagent_done: 'default-92' }, // Noice / Come On Man / yoshi ow
  { agent_done: 'default-12', agent_needs_input: 'default-15', subagent_done: 'default-4' },  // Anime Wow / ACK / Clang
  { agent_done: 'default-105', agent_needs_input: 'default-41', subagent_done: 'default-3' }, // Fetty Wap / shocking! / Shatter
  { agent_done: 'default-26', agent_needs_input: 'default-40', subagent_done: 'default-5' },  // gah dayum / FBI open UP / Faaah
  { agent_done: 'default-9', agent_needs_input: 'default-20', subagent_done: 'default-13' }   // Vine Boom / Daddyy Chill / anime ahh
];

/** Stable non-crypto hash (FNV-1a) so a project always keeps the same voice. */
export function pickVoiceIndex(projectDir, voiceCount = AGENT_VOICES.length) {
  let h = 0x811c9dc5;
  for (const c of String(projectDir || '')) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % voiceCount;
}

/** Which sound should this event make for this session? Voices override the
 *  per-event config for the trio; agent_error always follows config (it is
 *  opt-in). Voices off -> plain config mapping. An explicit voiceIndex (from
 *  the session roster, collision-free) wins over the plain project hash. */
export function resolveAgentSound(eventId, config, projectDir, prefs = getAgentPrefs(config), voiceIndex = null) {
  if (prefs.perSessionVoices && (projectDir || voiceIndex !== null) && eventId !== 'agent_error') {
    const voice = AGENT_VOICES[voiceIndex ?? pickVoiceIndex(projectDir)];
    if (voice?.[eventId]) return voice[eventId];
  }
  return config[eventId];
}

export function getAgentPrefs(config) {
  const saved = config && typeof config.__agents === 'object' ? config.__agents : {};
  return {
    focusAware: saved.focusAware !== false,
    perSessionVoices: saved.perSessionVoices !== false
  };
}

/** Pure roster reducer: applies one agent event to the sessions map.
 *  States: working -> needs_input -> done; session_end removes; idle evicted. */
export function reduceSessions(sessions, { eventId, sessionKey, label, project, now }) {
  const next = {};
  for (const [key, session] of Object.entries(sessions || {})) {
    if (now - (session.lastEventAt || 0) < SESSION_TTL_MS) next[key] = session;
  }
  if (!sessionKey) return next;

  if (eventId === 'agent_session_end') {
    delete next[sessionKey];
    return next;
  }

  const stateFor = {
    agent_working: 'working',
    agent_done: 'done',
    agent_needs_input: 'needs_input',
    subagent_done: next[sessionKey]?.state || 'working', // subagent done ≠ session done
    agent_error: next[sessionKey]?.state || 'working'
  };

  // Voice assignment: hash is the starting point, but live sessions never share
  // a voice — probe forward past voices already taken (collision-free while
  // concurrent sessions <= AGENT_VOICES.length). Stable for the session's life.
  let voiceIndex = next[sessionKey]?.voiceIndex;
  if (voiceIndex === undefined) {
    const taken = new Set(Object.values(next).map((s) => s.voiceIndex).filter((v) => v !== undefined));
    voiceIndex = pickVoiceIndex(project || sessionKey);
    for (let i = 0; i < AGENT_VOICES.length && taken.has(voiceIndex); i += 1) {
      voiceIndex = (voiceIndex + 1) % AGENT_VOICES.length;
    }
  }

  next[sessionKey] = {
    label: label || next[sessionKey]?.label || sessionKey.slice(0, 8),
    project: project || next[sessionKey]?.project || null,
    state: stateFor[eventId] || next[sessionKey]?.state || 'working',
    voiceIndex,
    lastEvent: eventId,
    lastEventAt: now
  };
  return next;
}

export function readSessions() {
  const parsed = readJson(AGENT_SESSIONS_PATH);
  return parsed?.sessions || {};
}

/** Updates the roster file and returns the session's entry (for its
 *  collision-free voiceIndex), or null for manual/test invocations. */
export function applySessionEvent(eventId, payload, now = Date.now()) {
  const sessionKey = payload?.session_id || null;
  if (!sessionKey) return null; // manual/test invocations don't join the roster
  const project = payload?.cwd || null;
  const label = project ? path.basename(project) : null;
  const sessions = reduceSessions(readSessions(), { eventId, sessionKey, label, project, now });
  fs.writeFileSync(AGENT_SESSIONS_PATH, JSON.stringify({ sessions }, null, 2));
  return sessions[sessionKey] || null;
}

/** Pure mute check; state is { until: epochMs } or null. */
export function isMuted(muteState, now = Date.now()) {
  return Boolean(muteState?.until && now < muteState.until);
}

export function readMuteState() {
  return readJson(AGENT_MUTE_PATH);
}

export function setMute(minutes) {
  if (!minutes) {
    try { fs.unlinkSync(AGENT_MUTE_PATH); } catch {}
    return null;
  }
  const state = { until: Date.now() + minutes * 60 * 1000 };
  fs.writeFileSync(AGENT_MUTE_PATH, JSON.stringify(state));
  return state;
}

// Apps where the agent's output is already on screen — if one is frontmost,
// the sound is redundant noise. ponytail: app-level heuristic; it can't tell
// WHICH tmux pane or editor tab you're in. Upgrade path: per-terminal
// integrations. Off switch: `soundfx agents focus off`.
const TERMINAL_APPS = new Set([
  'Terminal', 'iTerm2', 'Warp', 'Ghostty', 'kitty', 'Alacritty', 'WezTerm',
  'Hyper', 'Code', 'Visual Studio Code', 'Cursor', 'Windsurf', 'Zed'
]);

/** True when a terminal/IDE is the frontmost app (macOS only; uses lsappinfo,
 *  which needs no privacy permission). Fails open: unknown -> not suppressed. */
export function isTerminalFrontmost() {
  if (os.platform() !== 'darwin') return false;
  try {
    const front = spawnSync('lsappinfo', ['front'], { encoding: 'utf8', timeout: 500 });
    const asn = front.stdout?.trim();
    if (!asn) return false;
    const info = spawnSync('lsappinfo', ['info', '-only', 'name', asn], { encoding: 'utf8', timeout: 500 });
    const match = info.stdout?.match(/"name"="([^"]+)"/);
    return Boolean(match && TERMINAL_APPS.has(match[1]));
  } catch {
    return false;
  }
}
