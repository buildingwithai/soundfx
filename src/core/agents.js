import fs from 'fs';
import os from 'os';
import path from 'path';
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
export const CLAUDE_HOOK_MAP = {
  Stop: 'agent_done',
  SubagentStop: 'subagent_done',
  Notification: 'agent_needs_input',
  PostToolUseFailure: 'agent_error'
};

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
