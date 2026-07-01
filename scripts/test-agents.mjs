import assert from 'node:assert';
import {
  AGENT_HOOK_MARKER,
  AGENT_VOICES,
  buildDispatcherScript,
  claudeAgentHooksInstalled,
  extractOriginalNotify,
  isMuted,
  mergeClaudeAgentHooks,
  pickVoiceIndex,
  reduceSessions,
  removeClaudeAgentHooks,
  resolveAgentSound,
  restoreCodexNotify,
  rewriteCodexNotify
} from '../src/core/agents.js';

const spec = { executable: '/usr/local/bin/node', scriptPath: '/lib/soundfx/cli.js' };

// Fixture modeled on the real ~/.claude/settings.json: SuperIsland already
// occupies Stop / Notification / PostToolUseFailure with its own hook groups.
const superIsland = (arg) => ({
  hooks: [{ type: 'command', command: `'/Applications/SuperIsland.app/hooks/cc-event-hook.sh' ${arg} # cc-status-hook` }]
});
const settings = {
  env: { PATH: '/usr/bin' },
  hooks: {
    Stop: [superIsland('Idle')],
    Notification: [superIsland('Waiting')],
    PostToolUseFailure: [superIsland('ToolFail')],
    PermissionRequest: [{ hooks: [{ type: 'http', url: 'http://127.0.0.1:7823/hooks/permission' }] }]
  }
};

// --- Claude merge: non-clobbering, complete, idempotent ---
const merged = mergeClaudeAgentHooks(settings, spec);
assert.strictEqual(merged.hooks.Stop.length, 2, 'Stop keeps SuperIsland group and adds ours');
assert.ok(merged.hooks.Stop[0].hooks[0].command.includes('cc-status-hook'), 'SuperIsland Stop group untouched');
assert.ok(merged.hooks.Stop[1].hooks[0].command.includes('agent-event agent_done'), 'our Stop group plays agent_done');
assert.ok(merged.hooks.SubagentStop?.[0].hooks[0].command.includes('agent-event subagent_done'), 'SubagentStop created for subagents');
assert.ok(merged.hooks.Notification[1].hooks[0].command.includes('agent_needs_input'), 'Notification maps to needs-input');
assert.ok(merged.hooks.PostToolUseFailure[1].hooks[0].command.includes('agent_error'), 'PostToolUseFailure maps to agent_error');
assert.strictEqual(merged.hooks.PermissionRequest.length, 1, 'unrelated hook events untouched');
assert.ok(claudeAgentHooksInstalled(merged), 'installed detection is true after merge');
assert.deepStrictEqual(mergeClaudeAgentHooks(merged, spec), merged, 'merge is idempotent');
assert.ok(!claudeAgentHooksInstalled(settings), 'original object untouched (pure)');

// --- Claude remove: strips only ours ---
const removed = removeClaudeAgentHooks(merged);
assert.strictEqual(removed.hooks.Stop.length, 1, 'remove keeps SuperIsland Stop group');
assert.ok(removed.hooks.Stop[0].hooks[0].command.includes('cc-status-hook'), 'the surviving group is SuperIsland');
assert.strictEqual(removed.hooks.SubagentStop, undefined, 'empty SubagentStop key deleted');
assert.ok(!JSON.stringify(removed).includes(AGENT_HOOK_MARKER), 'no marker left after remove');

// --- Codex rewrite: preserves original, idempotent, handles absence ---
const toml = `approval_policy = "never"
model = "gpt-5.5"

notify = ["/Users/x/Codex Computer Use.app/Contents/MacOS/SkyComputerUseClient", "turn-ended"]

[plugins."github"]
enabled = true
`;
const dispatcher = '/Users/x/.soundfx/codex-notify.sh';
const rewritten = rewriteCodexNotify(toml, dispatcher);
assert.ok(rewritten.changed, 'rewrite reports change');
assert.deepStrictEqual(rewritten.originalNotify, ['/Users/x/Codex Computer Use.app/Contents/MacOS/SkyComputerUseClient', 'turn-ended'], 'original notify captured (path with spaces)');
assert.ok(rewritten.toml.includes(`notify = ["${dispatcher}"]`), 'notify now points at dispatcher');
assert.ok(rewritten.toml.includes('[plugins."github"]'), 'rest of toml preserved');
const again = rewriteCodexNotify(rewritten.toml, dispatcher);
assert.strictEqual(again.changed, false, 'rewrite is idempotent — no nesting');

const noNotify = rewriteCodexNotify('model = "gpt-5.5"\n', dispatcher);
assert.ok(noNotify.changed && noNotify.originalNotify === null, 'missing notify line is appended');
assert.ok(noNotify.toml.includes(`notify = ["${dispatcher}"]`), 'appended notify points at dispatcher');

// --- restore round-trip ---
const restored = restoreCodexNotify(rewritten.toml, rewritten.originalNotify);
assert.ok(restored.includes('SkyComputerUseClient", "turn-ended"]'), 'uninstall restores the original notify');
const restoredNone = restoreCodexNotify(noNotify.toml, null);
assert.ok(!restoredNone.match(/^notify/m), 'uninstall removes notify when there was none before');

// --- dispatcher script: forwards + fires + records original ---
const script = buildDispatcherScript(rewritten.originalNotify, spec);
assert.ok(script.startsWith('#!/bin/sh'), 'script has shebang');
assert.ok(script.includes('"/Users/x/Codex Computer Use.app/Contents/MacOS/SkyComputerUseClient" "turn-ended" "$PAYLOAD"'), 'forwards payload to previous notify program');
assert.ok(script.includes('*agent-turn-complete*'), 'filters on turn-complete payloads');
assert.ok(script.includes('agent-event agent_done'), 'fires the agent_done sound');
assert.deepStrictEqual(extractOriginalNotify(script), rewritten.originalNotify, 'original notify round-trips through the script');

const bare = buildDispatcherScript(null, spec);
assert.ok(bare.includes('no previous notify program'), 'no-forward variant is explicit');
assert.strictEqual(extractOriginalNotify(bare), null, 'bare script records no original');

// --- Week 2: session roster reducer ---
const T = 1_000_000_000_000;
let sessions = {};
sessions = reduceSessions(sessions, { eventId: 'agent_working', sessionKey: 's1', label: 'soundfx', project: '/p/soundfx', now: T });
assert.strictEqual(sessions.s1.state, 'working', 'prompt submit -> working');
sessions = reduceSessions(sessions, { eventId: 'agent_needs_input', sessionKey: 's1', label: 'soundfx', project: '/p/soundfx', now: T + 1000 });
assert.strictEqual(sessions.s1.state, 'needs_input', 'notification -> needs_input');
sessions = reduceSessions(sessions, { eventId: 'subagent_done', sessionKey: 's1', label: 'soundfx', project: '/p/soundfx', now: T + 2000 });
assert.strictEqual(sessions.s1.state, 'needs_input', 'subagent done does not change session state');
sessions = reduceSessions(sessions, { eventId: 'agent_done', sessionKey: 's1', label: 'soundfx', project: '/p/soundfx', now: T + 3000 });
assert.strictEqual(sessions.s1.state, 'done', 'stop -> done');
sessions = reduceSessions(sessions, { eventId: 'agent_working', sessionKey: 's2', label: 'leakguard', project: '/p/leakguard', now: T + 4000 });
assert.strictEqual(Object.keys(sessions).length, 2, 'two parallel sessions tracked');
sessions = reduceSessions(sessions, { eventId: 'agent_session_end', sessionKey: 's1', now: T + 5000 });
assert.strictEqual(sessions.s1, undefined, 'session end removes from roster');
const evicted = reduceSessions(sessions, { eventId: 'agent_working', sessionKey: 's3', label: 'x', project: '/p/x', now: T + 13 * 60 * 60 * 1000 });
assert.strictEqual(evicted.s2, undefined, 'idle sessions evicted after TTL');
assert.ok(evicted.s3, 'new session survives eviction pass');

// --- Week 2: per-session voices ---
assert.strictEqual(pickVoiceIndex('/p/soundfx'), pickVoiceIndex('/p/soundfx'), 'voice is stable per project');
const indices = new Set(['/a', '/b', '/c', '/d', '/e', '/f', '/g', '/h'].map((p) => pickVoiceIndex(p)));
assert.ok(indices.size >= 2, 'different projects spread across voices');
for (const voice of AGENT_VOICES) {
  assert.ok(voice.agent_done && voice.agent_needs_input && voice.subagent_done, 'every voice covers the trio');
}
const cfg = { agent_done: 'default-28', agent_error: 'none', __agents: {} };
const voiceSound = resolveAgentSound('agent_done', cfg, '/p/leakguard');
assert.strictEqual(voiceSound, AGENT_VOICES[pickVoiceIndex('/p/leakguard')].agent_done, 'voices pick by project hash');
assert.strictEqual(resolveAgentSound('agent_error', cfg, '/p/leakguard'), 'none', 'agent_error always follows config (opt-in)');
const cfgOff = { ...cfg, __agents: { perSessionVoices: false } };
assert.strictEqual(resolveAgentSound('agent_done', cfgOff, '/p/leakguard'), 'default-28', 'voices off -> config mapping');
assert.strictEqual(resolveAgentSound('agent_done', cfg, null), 'default-28', 'no project dir -> config mapping');

// --- Week 2: collision-free voice assignment for concurrent sessions ---
{
  // Two projects that hash to the SAME voice must still sound different live.
  let s = {};
  s = reduceSessions(s, { eventId: 'agent_working', sessionKey: 'k1', label: 'a', project: '/proj/alpha', now: T });
  s = reduceSessions(s, { eventId: 'agent_working', sessionKey: 'k2', label: 'b', project: '/proj/beta', now: T + 1 });
  s = reduceSessions(s, { eventId: 'agent_working', sessionKey: 'k3', label: 'c', project: '/proj/gamma', now: T + 2 });
  const voices = [s.k1.voiceIndex, s.k2.voiceIndex, s.k3.voiceIndex];
  assert.strictEqual(new Set(voices).size, 3, `concurrent sessions get distinct voices (got ${voices})`);
  const before = s.k1.voiceIndex;
  s = reduceSessions(s, { eventId: 'agent_done', sessionKey: 'k1', label: 'a', project: '/proj/alpha', now: T + 3 });
  assert.strictEqual(s.k1.voiceIndex, before, 'voice is stable across a session’s events');
  const viaIndex = resolveAgentSound('agent_done', cfg, '/proj/alpha', undefined, 3);
  assert.strictEqual(viaIndex, AGENT_VOICES[3].agent_done, 'explicit roster voiceIndex wins over project hash');
}

// --- Week 2: mute ---
assert.strictEqual(isMuted(null), false, 'no mute state -> not muted');
assert.strictEqual(isMuted({ until: T + 1000 }, T), true, 'muted before expiry');
assert.strictEqual(isMuted({ until: T - 1 }, T), false, 'mute expires');

console.log('agent hooks: all checks passed');
