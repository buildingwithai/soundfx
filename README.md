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
soundfx events
soundfx sounds
soundfx assign <eventId> <soundId>
soundfx test-event <eventId>
soundfx test-sound <soundId>
soundfx install-hook <shell>
soundfx uninstall-hook <shell>
soundfx hook-status <shell>
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
