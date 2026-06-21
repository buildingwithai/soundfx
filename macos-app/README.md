# SoundFX 6·7 — native macOS menu-bar app

A tiny, fully self-contained Mac app that lives in the menu bar and plays a sound
whenever you press `6` then `7` quickly, **anywhere** on your computer. No Node,
no terminal, no background script to babysit — one `.app`.

It does the global key-watching (`CGEventTap`, listen-only) and the playback
(`NSSound`) itself, and can launch itself at login (`SMAppService`).

## Build

```bash
./build.sh
```

Requires the Swift toolchain (`swiftc`, ships with Xcode / Command Line Tools).
Produces `SoundFX 67.app`, ad-hoc code-signed so the Input Monitoring grant
sticks across relaunches.

## Install & turn on

1. Drag **SoundFX 67.app** into `/Applications`.
2. Open it. A **6·7** item appears in the menu bar (top-right).
3. Click it → **Grant Input Monitoring…** → enable the app in
   System Settings → Privacy & Security → Input Monitoring.
4. Click **Listening: On**.
5. Click **Launch at login** so it comes back every time you start your Mac.

Now pressing `6` then `7` within 400ms plays the sound from any app.

- **Test sound** plays the sound without needing the keyboard or any permission —
  use it to confirm audio works.
- **Listening: Off** pauses the hotkey without quitting.

## Privacy

The key tap is listen-only and only checks whether a keystroke is part of the
`6 → 7` trigger. Nothing is logged, stored, or sent anywhere.

## Notes

- Bare digits mean typing `67` in normal text (a year, a phone number) can also
  trigger it. The sequence/window live in `main.swift` (`SequenceDetector`).
- This replaces the `soundfx listen` / `soundfx hotkey install` Node path. If you
  used that, disable it with `soundfx hotkey uninstall` so the sound doesn't play
  twice.
- macOS only. (Global key monitoring isn't possible on iOS — apps there are
  sandboxed and can't watch the keyboard system-wide.)
