# Sound library provenance audit (2026-07-01)

Pre-launch legal posture for the 110-sound default library. Summary: **the npm
package redistributes no audio**, which is a materially safer posture than
bundling clips — but the default library cannot be marketed as "our sounds",
and the out-of-box defaults should move to original audio before a public launch.

## Inventory by source

| Source | Count | License reality |
|---|---|---|
| `www.myinstants.com` | 106 | User-uploaded meme clips (music, TV, games, movies). Mostly unlicensed third-party audio. myinstants itself does not grant redistribution rights. |
| `actions.google.com` | 4 | Google's sound library — royalty-free for use in projects per Google's published terms. Safe. |

## What we actually do (and don't)

- **We do not bundle or redistribute audio.** The npm package ships URLs only.
  Files are downloaded to the user's own cache (`~/.soundfx-cache`) at play time,
  by the user's machine, for personal playback.
- This is the same posture as a browser bookmark list — meaningfully different
  from PeonPing's early mistake (bundling Blizzard WAVs in an MIT repo, which was
  the top criticism in their HN thread).
- Remaining exposure: hotlinks can rot; the underlying clips are still
  unlicensed for *our* commercial marketing (we can't put "includes the Vine
  Boom" in paid promotion); a myinstants takedown breaks defaults silently.

## Pre-launch actions

1. **Ship an original default pack.** The CESP pack system makes this the easy
   path: commission/generate ~12 original earcons (done / needs-input / error /
   subagent variants x a few voices), package as `soundfx-classic` (CESP
   `openpeon.json`), bundle THAT in the npm package as the out-of-box default.
   Original audio -> we own it -> marketing-safe.
2. **Relabel the meme library as "community links"** in the TUI/README: clearly
   user-selected, streamed from third-party hosts, not ours, may break.
3. **CESP packs are user-side-loaded** — licensing is the pack author's
   responsibility (registry posture, same as PeonPing/openpeon).
4. **Never** use third-party clip names/sounds in ads, the launch video, or the
   website hero. The launch clip must use original-pack sounds only.

## Verdict

- Current state: acceptable for a free OSS tool among developers (hotlink,
  no redistribution), with known link-rot risk.
- Blocker for LAUNCH marketing: the demo/launch video and default experience
  must run on an original pack (action 1). Everything else is labeling.
