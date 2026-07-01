# Shepherd launch kit

## The self-install prompt (the viral unit)

Everything the launch drives toward is this one paste-into-your-agent block:

```
Give yourself a voice: run `npm install -g @buildingwithai/soundfx && soundfx agents init`,
then play `soundfx test-event agent_done` so I can hear that you're wired,
and tell me which sound each of your events makes now.
```

Why it works: the screenshot of Claude Code installing its own notification
voice IS the shareable artifact. The agent announces its own completion sound —
the product demos itself in the install step.

## The 25-second launch clip (storyboard)

Record with `scripts/demo-parallel-agents.sh` (drives the real pipeline).
⚠ Per docs/sound-provenance.md: record with an ORIGINAL sound pack active,
not the meme library.

| t | On screen | You hear |
|---|---|---|
| 0-4s | Four terminal panes, each running an agent. Menu bar shows `6·7`. Caption: "4 agents. 0 watching." | silence |
| 4-8s | You're in a browser (docs/figma — clearly NOT watching the terminals). Pane 2 finishes behind the browser. | voice B: *done* |
| 8-13s | Menu bar ticks to `6·7 (1)`. Pane 4 hits a permission prompt. Caption: "each agent has its own voice" | voice D: *needs you* (distinct timbre) |
| 13-18s | Cursor never leaves the browser. Two subagents in pane 1 finish 100ms apart — both audible, overlapping. | voice A: *subagent* ×2 |
| 18-22s | Open the menu: **Needs You / Working / Done** roster. Click nothing. Caption: "you already knew, by ear" | silence |
| 22-25s | Terminal front and center: `soundfx agents init`. Caption: "one command. `soundfx agents init`" | *done* sound, once |

Rules: no music bed (the product IS the audio), real terminals not mockups,
captions carry the words so it works muted-with-subtitles on X too.

## Show HN draft

> **Show HN: Hear your AI coding agents — each parallel session gets its own voice**
>
> I run 3-5 Claude Code/Codex sessions in parallel and kept missing the moment
> one finished — or worse, sat blocked on a permission prompt for 20 minutes
> while I stared at a different terminal.
>
> So I gave them voices. soundfx wires Claude Code hooks (Stop / SubagentStop /
> Notification) and Codex notify into semantic sounds: *done*, *needs your
> input*, *subagent finished*, *error*. Each concurrent session gets a distinct
> voice (collision-free assignment), so you know WHO by ear. Sounds are
> focus-aware — quiet while you're already looking at that terminal — and
> parallel completions overlap instead of cutting each other off. A macOS
> menu-bar app shows the roster: Needs You / Working / Done.
>
> It plays CESP sound packs (the openpeon.json format), so the existing
> community packs work as-is.
>
> Install is one command — or paste this into Claude Code and it installs its
> own voice: [the self-install prompt]
>
> macOS-first (menu bar + focus-awareness); CLI sounds work on Windows/Linux.
> Honest limitations: Codex only exposes turn-complete today, so rich semantics
> are Claude Code-only; focus-awareness is app-level (can't see tmux panes).

First comment to pre-empt: "how is this different from peon-ping?" Answer
ready: CESP-compatible (their packs work here), plus per-session voice
identity, needs-input vs done semantics, focus-awareness, overlap, and the
session roster — the supervision layer, not just the ding.

## Channel order

1. The clip + self-install prompt on X (quote-tweet bait: "my agent installed
   its own voice")
2. Show HN (weekday, ~14:00 UTC)
3. r/ClaudeAI + the Claude Code / Cursor Discords (the babysitting-complaint
   threads are the audience)
4. Free-Pro-forever DMs to 30 dev-streamers (their streams broadcast the sounds)

## Pre-launch checklist

- [ ] Original default sound pack recorded/licensed (BLOCKER — see
      docs/sound-provenance.md)
- [ ] Launch clip recorded with original pack
- [ ] npm publish with packs + agents features
- [ ] README quickstart verified on a clean machine
- [ ] peon-ping comparison answer rehearsed (be generous — CESP compat means
      their ecosystem is our friend)
