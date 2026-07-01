import assert from 'node:assert';
import {
  AGENT_HOOK_MARKER,
  buildDispatcherScript,
  claudeAgentHooksInstalled,
  extractOriginalNotify,
  mergeClaudeAgentHooks,
  removeClaudeAgentHooks,
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

console.log('agent hooks: all checks passed');
