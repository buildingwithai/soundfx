# Shepherd — the ambient attention layer for AI coding agents

**One-liner:** Hear your agents instead of watching them. One command wires Claude Code
and Codex into distinct, focus-aware sounds — *done / needs-your-input / error /
subagent-done* — with a unique voice per session, so a dev running five parallel agents
knows who finished and who is stuck without looking.

Synthesized 2026-07-01 from a 7-angle research sweep + 3 independent concept designs
(virality-first, pain-first, asset-first). All three converged on this product.
Scores: 25, 25, 27 /30.

---

## Why this, why now (the evidence)

**The pain just peaked and went mainstream:**
- Axios (Apr 4, 2026): agentic coding tools "operate like slot machines" — a Rootly CTO
  needed prescribed sleep medication after switching to agentic coding.
- Anthropic redesigned the Claude Code desktop app (Apr 14, 2026) specifically around
  managing N parallel sessions — official acknowledgment that **multi-session babysitting
  is the bottleneck**.
- fast.ai "dark flow" essay (Jan 2026); LeadDev 2026: 45% of engineers working MORE hours
  ("AI vampire"); METR: devs felt 20% faster, were 19% slower — partly the wait-and-check
  loop.
- "Babysitting" is THE recurring word across HN/Reddit/Substack in 2026. simonw:
  "It's now 11:47am and I am mentally exhausted" (3 parallel agents).

**Demand shape is proven, category unowned:**
- PeonPing (Feb 2026): Warcraft peon voices for Claude Code — 1,006 HN points,
  4,876 GitHub stars in <5 months, 40 community sound packs, an open pack spec (CESP),
  and a copycat wave within 48 hours. It remains a hook script that only does "done".
- anthropics/claude-code #1288 and #10689 (sound notifications) still open. Cursor
  already capitulated and shipped a completion chime after repeated demand.
- A fragmented pile of free micro-tools (echook, claude-sounds, claude-notify,
  SuperIsland/MioIsland notch monitors) — none dominant, none semantic.

**The whitespace nobody ships (our product = exactly this list):**
1. **Semantic vocabulary** — *done* vs *needs-input* vs *error* vs *subagent-done*.
   Every DIY script misses this; "needs-input" is the expensive state (agent sits
   blocked 20 min while you don't know).
2. **Per-session voice identity** — which of my 5 parallel agents pinged? (hash of
   project dir → timbre). Proven demand, zero productized options.
3. **Focus-aware playback** — silent when you're already looking at that terminal;
   the pattern devs keep hand-rolling.
4. **Escalation** — needs-input repeats, rising, until acknowledged (global hotkey).
5. **Cross-agent unification** — Claude Code + Codex in one coherent sound system.
6. **A signed native app, not a gist** — polish is the moat in a category of hacks.

## The viral mechanisms (all validated by recent precedent)

1. **The product performs itself.** Audible in every stream, Loom, screen-share, office —
   "what was that sound?" is the acquisition event (Klack, Bongo Cat, PeonPing all
   spread this way). Launch asset = a 25s clip of 4 parallel agents where the viewer can
   tell BY EAR who finished and who is blocked.
2. **The install is the tweet.** Onboarding = paste one prompt into Claude Code; the
   agent wires its own hooks. "Claude installed its own voice and now announces its own
   failures" is a ready-made clip (echook proved the pattern).
3. **CESP pack compatibility.** Play PeonPing's open pack format → all 40 existing
   community packs work day one; their ecosystem becomes our content library, not our
   competitor.
4. **"Agent Wrapped"** (v1.1) — weekly share card: hours agents worked, minutes they sat
   blocked before you noticed (the number the product drives to zero). ccusage (16.1k
   stars) proved the usage-curiosity share loop.

## MVP (2–3 weeks, max asset reuse)

- **Week 1:** `soundfx agents init` — writes Claude Code hooks (Stop / SubagentStop /
  Notification) + Codex notify dispatcher (preserving the user's existing notify
  program); 4 semantic events mapped to distinct defaults; `soundfx doctor` validates.
  ⚠ known gotchas already documented: Claude hooks are arrays (append, don't clobber);
  Codex notify is single-program (dispatcher must forward); playSound() kills prior
  playback (parallel completions need overlap).
- **Week 2:** per-session voice (project-dir hash); menu-bar app (reuse the shipped
  Swift shell + signing pipeline): Working / Needs You / Done roster, frontmost-app
  suppression, global mute/acknowledge hotkey (reuse CGEventTap listener).
- **Week 3:** CESP pack loader; self-install prompt; launch video; README + Show HN.
- **Cut from v1:** Cursor (no clean hooks), Windows/Linux menu bar (CLI fallback only),
  pack registry/editor, Agent Wrapped, escalation tuning beyond simple repeat.

**Asset reuse:** soundfx playback engine + `event` primitive (verbatim), hook
install/uninstall machinery, 109-sound library + TUI, Swift menu-bar shell +
notarization pipeline, CGEventTap hotkey listener, npm + Vercel distribution.

## Honest risks

- **Anthropic ships a native ding** (#10689 open). Defense: everything a vendor won't
  ship — cross-agent, per-session identity, focus-awareness, packs, escalation.
- **"PeonPing clone" is the guaranteed first HN comment.** Answer in the README: CESP-
  compatible, and we ship the semantic layer PeonPing doesn't have. Second-mover in a
  hot meme category also inherits its distribution.
- **Copyright:** the viral packs are Blizzard/Valve audio — legally radioactive
  (the top critical PeonPing subthread). Defaults must be original/licensed; audit the
  109-sound library's provenance (myinstants URLs) before launch. Community packs are
  user-side-loaded.
- **False-positive "needs-input" kills the product** — a sound that cries wolf gets
  muted forever. Codex only exposes turn-complete; be honest that rich semantics are
  Claude Code-only at launch.
- **Weak direct monetization:** the niche norm is $0 OSS. Realistic: free CLI +
  $6–10 one-time signed menu-bar app (Klack-shaped). This product's primary value is
  **distribution and reputation**.

## The two-act structure (where LeakGuard fits)

Research on the secrets side is ALSO strong — 28.65M new secrets on public GitHub in
2025 (+34% YoY), AI-assisted commits leak ~2x baseline (3.2%, GitGuardian measured
Claude Code specifically), Moltbook + Lovable incidents, and "the pixels path is wide
open" (no one does real-time on-screen secret blurring).

But it's a longer build (virtual camera + notarization) with a different buyer.

**Act 1 — Shepherd (this brief):** ships in weeks, rides the peak discourse window,
builds the audience and the always-on menu-bar beachhead. Free/cheap, loud, viral.

**Act 2 — LeakGuard as the paid module in the same app:** the menu-bar guardian that
already watches your agents gains eyes — "secrets visible on screen while you're
sharing → blurred + a confirmation sound." Detection core is already built and tested
(26/26 checks). Same brand: *the ambient guardian of your screen and attention.*
Auto-arm on OBS/Zoom/Meet capture start. That's the business; Shepherd is the wedge.
