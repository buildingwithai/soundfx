# soundfx

This package contains only the terminal product:

- shell hooks for `powershell`, `pwsh`, `bash`, and `zsh`
- terminal-event to sound-effect mapping
- a text UI for choosing event sounds
- cross-platform audio playback adapters for Windows, macOS, and Linux

This package does **not** include:

- the Electron desktop app
- OBS desktop UI features
- desktop packaging assets

## Commands

```bash
soundfx tui
soundfx doctor
soundfx uninstall <shell>
soundfx events
soundfx sounds
soundfx assign <eventId> <soundId>
soundfx test-event <eventId>
soundfx test-sound <soundId>
soundfx install-hook <shell>
soundfx uninstall-hook <shell>
soundfx hook-status <shell>
soundfx listen
soundfx hotkey [install|uninstall|status|sound <soundId>|test]
```

## Quick start

```bash
npm install -g @buildingwithai/soundfx
soundfx
```

On first launch, `soundfx` opens the terminal UI and, if needed, automatically connects itself to your shell profile so command-triggered sounds can work later.

After that first launch, restart your terminal once. That is the one step the app cannot fully do for you, because your current shell session is already running.

Then, if you want, you can quickly confirm audio with:

```bash
soundfx test-sound default-1
```

Behind the scenes, soundfx still needs one small shell hook so it knows when commands succeed, fail, or are unknown. On first launch, the app installs that hook for you automatically.

Inside the TUI:

- type to filter sounds with smart search
- press `Ctrl+F` to add or remove a favorite
- recently previewed or assigned sounds float toward the top
- press `Esc` to clear the current filter
- press `Space` to play or stop the selected preview

## AI agent sounds

Hear your AI coding agents instead of watching them. One command wires **Claude Code**
and **Codex** into soundfx:

```bash
soundfx agents init      # installs Claude Code hooks + the Codex notify dispatcher
soundfx agents status    # check what's wired
soundfx agents uninstall # removes only soundfx's hooks, restores your Codex notify
```

| Event | When it fires | Default sound |
|---|---|---|
| `agent_done` | Claude Code finishes a turn / Codex turn completes | Another One DJ Khaled |
| `agent_needs_input` | the agent is waiting on your permission or input | Huh? Ceeday |
| `subagent_done` | a parallel subagent/worker finishes | Boing |
| `agent_error` | a tool call fails (off by default — enable in the TUI) | none |

Running several agents in parallel? Each session gets its own **voice** (a distinct
sound set, collision-free while you have up to 6 concurrent sessions), so you know
*which* agent finished or needs you without looking. The macOS menu-bar app
(`macos-app/`) shows the roster — **Needs You / Working / Done** — and a
one-click *Mute Agent Sounds for 1 Hour*.

```bash
soundfx agents mute [minutes|off]   # silence agent sounds (default 60)
soundfx agents focus on|off         # focus-aware: stay quiet while a terminal/IDE is frontmost (default on)
soundfx agents voices on|off        # per-session voices (default on)
```

Notes:

- Installation is additive: existing hooks in `~/.claude/settings.json` are preserved,
  and if Codex's `notify` already points at another program, the generated dispatcher
  keeps forwarding to it.
- Agent sounds **overlap** — three parallel subagents finishing together are all heard,
  unlike shell events which cut off the previous sound.
- Focus-aware playback is an app-level heuristic (it can't see tmux panes); turn it
  off if you run agents in a terminal you keep frontmost.
- Change any mapping with `soundfx tui` or `soundfx assign agent_done <soundId>`
  (with voices on, the voice set wins for done/needs-input/subagent sounds).
- Already-running agent sessions pick the hooks up on their next restart.

## Computer-wide hotkey

Beyond the terminal, soundfx can play a sound when you press a key sequence **anywhere** on your computer. By default, pressing `6` then `7` quickly (within 400ms) plays the "6 7 (Six Seven)" meme sound.

```bash
soundfx hotkey status            # show the current sequence, sound, and agent state
soundfx hotkey sound default-9   # pick a different sound (e.g. VINE BOOM)
soundfx hotkey test              # play the sound now, without pressing the keys
soundfx listen                   # run the listener in the foreground (Ctrl+C to stop)
soundfx hotkey install           # auto-start the listener at login (macOS)
soundfx hotkey uninstall         # remove the auto-start agent
```

First run on macOS asks for **Input Monitoring** permission (System Settings → Privacy & Security → Input Monitoring). That is required for any app to watch the keyboard globally, and you only grant it once. The tip: run `soundfx listen` once in a terminal to trigger the prompt, then `soundfx hotkey install` to keep it running in the background.

Privacy: the listener only checks whether your keystrokes match the trigger sequence. It never logs, stores, or transmits what you type.

Notes:

- The sequence keys are plain digits, so typing `67` inside normal text (a year, a phone number) can also trigger it. To make it deliberate, you can edit `sequence` / `windowMs` under `__hotkey` in `~/.soundfx-cli.json`.
- The global listener currently supports macOS and Windows. On Windows, run `soundfx listen` at startup yourself; the `hotkey install` auto-start agent is macOS-only for now.

## Uninstall

If you want to stop soundfx from hooking into your terminal:

```bash
soundfx uninstall zsh
```

Then, if you also want to remove the package itself:

```bash
npm uninstall -g @buildingwithai/soundfx
```

## Event meanings

- `unknown_command`: you typed something your shell does not recognize
- `command_success`: a command finished normally
- `command_error`: a real command ran, but it finished with a failure
- `command_interrupted`: you stopped a running command with `Ctrl+C`
- `sudo_used`: the command started with `sudo`
- `git_commit`: you ran `git commit`
- `npm_install`: you ran an install command like `npm install`

`unknown_command` and `command_error` are not the same thing.

- `unknown_command` means the shell could not even find a command to run
- `command_error` means the command did exist and started, but it ended badly

Example:

- `h` -> `unknown_command`
- `cat missing-file.txt` -> `command_error`

## Local development

If you cloned this repo and want to run the CLI locally on your machine:

```bash
npm install
npm link
soundfx
```

If you use `bash`, replace `zsh` with `bash`.

## macOS notes

- macOS playback uses the built-in `afplay` command.
- In normal cases, macOS does not need a special privacy or security permission for this app to play sounds through your speakers.
- On first launch, `soundfx` can update your shell profile automatically. After that, open a new terminal or run `exec zsh` once so the hook is actually loaded.
- If `test-sound` works but command sounds do not, run `soundfx hook-status zsh` to confirm the hook is installed in the shell you are really using.
- If your Mac is using the wrong audio output device, or the volume is muted, soundfx cannot override that. It will send audio to the same output your Mac is already using.
- If you still do not hear audio, test your Mac audio path directly with:

```bash
afplay /System/Library/Sounds/Glass.aiff
```

## Shells

- Windows PowerShell: `powershell`
- PowerShell 7+: `pwsh`
- macOS / Linux: `bash`, `zsh`

## Platform layout

- `src/core/`
- `src/platform/windows/`
- `src/platform/macos/`
- `src/platform/linux/`
