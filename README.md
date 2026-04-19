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
soundfx doctor
soundfx install-hook powershell
soundfx tui
```

If you are on macOS or Linux, replace `powershell` with `zsh` or `bash`.

## Shells

- Windows PowerShell: `powershell`
- PowerShell 7+: `pwsh`
- macOS / Linux: `bash`, `zsh`

## Platform layout

- `src/core/`
- `src/platform/windows/`
- `src/platform/macos/`
- `src/platform/linux/`
