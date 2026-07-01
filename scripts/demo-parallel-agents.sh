#!/bin/bash
# Drives the real agent-event pipeline as if 4 parallel agent sessions were
# running — for recording the launch clip or just hearing what Shepherd does.
# Usage: ./scripts/demo-parallel-agents.sh
set -euo pipefail
cd "$(dirname "$0")/.."

CLI="node src/core/cli.js"
fire() { # fire <session> <project> <event>
  echo "{\"session_id\":\"demo-$1\",\"cwd\":\"/demo/$2\"}" | $CLI agent-event "$3"
}

# Focus-aware playback would rightly silence us while this terminal is
# frontmost — disable for the demo, restore after.
$CLI agents focus off >/dev/null
trap '$CLI agents focus on >/dev/null; for s in one two three four; do echo "{\"session_id\":\"demo-$s\"}" | '"$CLI"' agent-event agent_session_end; done; echo; echo "demo cleaned up (focus-aware restored)"' EXIT

echo "4 agents starting… (watch the menu bar, listen for distinct voices)"
fire one   frontend  agent_working
fire two   backend   agent_working
fire three infra     agent_working
fire four  docs-site agent_working
sleep 3

echo "agent two finished →"
fire two backend agent_done
sleep 3

echo "agent four needs your input →"
fire four docs-site agent_needs_input
sleep 3

echo "two subagents of agent one finish 150ms apart (both audible) →"
fire one frontend subagent_done &
sleep 0.15
fire one frontend subagent_done
sleep 3

echo "agent one and three finish →"
fire one frontend agent_done
sleep 1
fire three infra agent_done
sleep 2

echo "open the menu bar now: Needs You (docs-site) / Done (frontend, backend, infra)"
sleep 6
