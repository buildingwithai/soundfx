import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, render, useApp, useInput } from 'ink';
import {
  TERMINAL_EVENTS,
  SOUND_LIBRARY,
  getCurrentPreviewSoundId,
  getDefaultConfig,
  loadConfig,
  saveConfig,
  stopPreviewSound,
  togglePreviewSound
} from './index.js';

const EVENT_WINDOW_SIZE = 6;
const SOUND_WINDOW_SIZE = 10;

function getWindowedItems(items, selectedIndex, windowSize) {
  const total = items.length;
  if (total <= windowSize) {
    return {
      start: 0,
      end: total,
      items: items.map((item, index) => ({ item, index }))
    };
  }

  const half = Math.floor(windowSize / 2);
  let start = Math.max(0, selectedIndex - half);
  let end = start + windowSize;

  if (end > total) {
    end = total;
    start = end - windowSize;
  }

  return {
    start,
    end,
    items: items.slice(start, end).map((item, offset) => ({ item, index: start + offset }))
  };
}

function SoundfxTui({ args, interactive, launchContext }) {
  const { exit } = useApp();
  const [config, setConfig] = useState(() => loadConfig());
  const [selectedEventIndex, setSelectedEventIndex] = useState(0);
  const [selectedSoundIndex, setSelectedSoundIndex] = useState(0);
  const [focusPane, setFocusPane] = useState('events');
  const [status, setStatus] = useState('Ready. Use Left/Right to switch panes, Up/Down to move, Enter to save, P to preview, and Q to quit.');
  const [authReady, setAuthReady] = useState(false);
  const [previewSoundId, setPreviewSoundId] = useState(null);

  const selectedEvent = TERMINAL_EVENTS[selectedEventIndex];
  const selectedSound = SOUND_LIBRARY[selectedSoundIndex];

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!cancelled) {
        setAuthReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [args]);

  useEffect(() => {
    if (!launchContext) return;
    if (launchContext.hookChanged) {
      setStatus(`First-time setup is done. Restart your ${launchContext.shell} terminal once after you finish here so command sounds can start working.`);
      return;
    }
    if (!launchContext.audioBackend?.available) {
      setStatus(`The ${launchContext.audioBackend.backendName} audio backend is missing, so previews may stay silent until that is fixed.`);
    }
  }, [launchContext]);

  const selectedMapping = useMemo(() => config[selectedEvent.id], [config, selectedEvent]);
  const eventWindow = useMemo(
    () => getWindowedItems(TERMINAL_EVENTS, selectedEventIndex, EVENT_WINDOW_SIZE),
    [selectedEventIndex]
  );
  const soundWindow = useMemo(
    () => getWindowedItems(SOUND_LIBRARY, selectedSoundIndex, SOUND_WINDOW_SIZE),
    [selectedSoundIndex]
  );

  useEffect(() => {
    const mappedSoundIndex = SOUND_LIBRARY.findIndex((sound) => sound.id === selectedMapping);
    if (mappedSoundIndex >= 0) {
      setSelectedSoundIndex(mappedSoundIndex);
    }
  }, [selectedEventIndex, selectedMapping]);

  const saveAssignment = async (eventIndex, soundIndex) => {
    const event = TERMINAL_EVENTS[eventIndex];
    const sound = SOUND_LIBRARY[soundIndex];
    const next = { ...config, [event.id]: sound.id };
    setConfig(next);
    await saveConfig(next);
    setStatus(`Saved ${event.id} -> ${sound.name}`);
  };

  const resetDefaults = async () => {
    const defaults = getDefaultConfig();
    setConfig(defaults);
    await saveConfig(defaults);
    setStatus('Reset all terminal event sounds to the default set.');
  };

  const previewCurrent = async () => {
    const result = await togglePreviewSound(selectedSound.id);
    setPreviewSoundId(getCurrentPreviewSoundId());
    if (!result.ok) {
      setStatus(result.reason || `Could not preview ${selectedSound.name}.`);
      return;
    }
    if (result.action === 'started') {
      setStatus(`Playing ${selectedSound.name}. Press Space again to stop it.`);
      return;
    }
    if (result.action === 'stopped') {
      setStatus(`${selectedSound.name} stopped.`);
      return;
    }
    setStatus('Preview is idle.');
  };

  useEffect(() => () => {
    stopPreviewSound();
  }, []);

  useInput((input, key) => {
    if (!authReady) return;
    const lowerInput = input.toLowerCase();

    if (lowerInput === 'q') {
      exit();
      return;
    }

    if (key.leftArrow || lowerInput === 'h' || lowerInput === 'e') {
      setFocusPane('events');
      setStatus('Focus moved to Terminal Events. Use Up/Down to choose an event.');
      return;
    }

    if (key.rightArrow || lowerInput === 'l' || lowerInput === 's' || key.tab) {
      setFocusPane('sounds');
      setStatus('Focus moved to Sound Library. Use Up/Down to choose a sound, then Enter to save it.');
      return;
    }

    if (key.upArrow || lowerInput === 'k') {
      if (focusPane === 'events') {
        setSelectedEventIndex((current) => Math.max(0, current - 1));
        setStatus('Browsing terminal events.');
      } else {
        setSelectedSoundIndex((current) => Math.max(0, current - 1));
        setStatus('Browsing sound library.');
      }
      return;
    }

    if (key.downArrow || lowerInput === 'j') {
      if (focusPane === 'events') {
        setSelectedEventIndex((current) => Math.min(TERMINAL_EVENTS.length - 1, current + 1));
        setStatus('Browsing terminal events.');
      } else {
        setSelectedSoundIndex((current) => Math.min(SOUND_LIBRARY.length - 1, current + 1));
        setStatus('Browsing sound library.');
      }
      return;
    }

    if (key.return) {
      void saveAssignment(selectedEventIndex, selectedSoundIndex);
      return;
    }

    if (lowerInput === 'p') {
      void previewCurrent();
      return;
    }

    if (lowerInput === 'r') {
      void resetDefaults();
      return;
    }

    if (lowerInput === ' ') {
      void previewCurrent();
    }
  }, { isActive: interactive });

  if (!authReady) {
    return (
      React.createElement(Box, { flexDirection: 'column', padding: 1 },
        React.createElement(Text, { color: 'cyan', bold: true }, 'soundfx CLI'),
        React.createElement(Text, null, 'Preparing the terminal interface...')
      )
    );
  }

  return React.createElement(
    Box,
    { flexDirection: 'column', padding: 1 },
    React.createElement(Text, { color: 'cyan', bold: true }, 'soundfx CLI'),
    React.createElement(Text, { color: 'gray' }, 'Map terminal events to sound effects. Use Left/Right or E/S to switch panes.'),
    launchContext
      ? React.createElement(
          Box,
          { marginTop: 1, flexDirection: 'column', borderStyle: 'round', borderColor: launchContext.hookChanged ? 'green' : 'blue', paddingX: 1 },
          React.createElement(Text, { color: launchContext.hookChanged ? 'green' : 'blue', bold: true }, launchContext.hookChanged ? 'First-Time Setup Complete' : 'Setup Status'),
          React.createElement(Text, null, launchContext.hookChanged
            ? `soundfx just connected itself to your ${launchContext.shell} shell profile at ${launchContext.profilePath}.`
            : `soundfx is using your ${launchContext.shell} shell profile at ${launchContext.profilePath}.`),
          React.createElement(Text, null, launchContext.hookChanged
            ? `After you finish here, open a new terminal window or run exec ${launchContext.shell} once.`
            : `If command sounds are not triggering yet, open a new terminal window or run exec ${launchContext.shell}.`),
          React.createElement(Text, null, launchContext.audioBackend?.available
            ? `Audio playback backend: ${launchContext.audioBackend.backendName} is ready.`
            : `Audio playback backend: ${launchContext.audioBackend?.backendName || 'unknown'} is not ready.`),
          React.createElement(Text, null, launchContext.audioBackend?.permissionsNote || '')
        )
      : null,
    React.createElement(Box, { marginTop: 1, gap: 3 },
      React.createElement(
        Box,
        { flexDirection: 'column', width: 44, borderStyle: 'round', borderColor: focusPane === 'events' ? 'cyan' : 'gray', paddingX: 1 },
        React.createElement(Text, { color: 'cyan', bold: true }, focusPane === 'events' ? 'Terminal Events [ACTIVE]' : 'Terminal Events'),
        eventWindow.start > 0
          ? React.createElement(Text, { key: 'events-up', color: 'gray' }, `... ${eventWindow.start} more above`)
          : null,
        ...eventWindow.items.map(({ item: event, index }) => {
          const active = index === selectedEventIndex;
          const soundId = config[event.id];
          const sound = SOUND_LIBRARY.find((item) => item.id === soundId);
          const prefix = active ? '>' : ' ';
          const color = active ? 'black' : 'white';
          const bgColor = active ? 'cyan' : undefined;
          return React.createElement(
            Text,
            { key: event.id, color, backgroundColor: bgColor },
            `${prefix} ${event.label} -> ${sound?.name || 'none'}`
          );
        }),
        eventWindow.end < TERMINAL_EVENTS.length
          ? React.createElement(Text, { key: 'events-down', color: 'gray' }, `... ${TERMINAL_EVENTS.length - eventWindow.end} more below`)
          : null
      ),
      React.createElement(
        Box,
        { flexDirection: 'column', width: 38, borderStyle: 'round', borderColor: focusPane === 'sounds' ? 'green' : 'gray', paddingX: 1 },
        React.createElement(Text, { color: 'green', bold: true }, focusPane === 'sounds' ? 'Sound Library [ACTIVE]' : 'Sound Library'),
        soundWindow.start > 0
          ? React.createElement(Text, { key: 'sounds-up', color: 'gray' }, `... ${soundWindow.start} more above`)
          : null,
        ...soundWindow.items.map(({ item: sound, index }) => {
          const active = index === selectedSoundIndex;
          const assigned = selectedMapping === sound.id;
          const previewing = previewSoundId === sound.id;
          const prefix = active ? '>' : previewing ? '|' : assigned ? '*' : ' ';
          const color = active ? 'black' : previewing ? 'cyan' : assigned ? 'green' : 'white';
          const bgColor = active ? 'green' : undefined;
          return React.createElement(
            Text,
            { key: sound.id, color, backgroundColor: bgColor },
            `${prefix} ${sound.name}${previewing ? ' [playing]' : ''}`
          );
        }),
        soundWindow.end < SOUND_LIBRARY.length
          ? React.createElement(Text, { key: 'sounds-down', color: 'gray' }, `... ${SOUND_LIBRARY.length - soundWindow.end} more below`)
          : null
      )
    ),
    React.createElement(
      Box,
      { marginTop: 1, flexDirection: 'column', borderStyle: 'round', borderColor: 'yellow', paddingX: 1 },
      React.createElement(Text, { color: 'yellow', bold: true }, 'Current Selection'),
      React.createElement(Text, null, `Pane: ${focusPane === 'events' ? 'Terminal Events' : 'Sound Library'}`),
      React.createElement(Text, null, `Event: ${selectedEvent.id}`),
      React.createElement(Text, null, `Sound: ${selectedSound.name}`),
      React.createElement(Text, null, `Saved mapping for this event: ${SOUND_LIBRARY.find((sound) => sound.id === selectedMapping)?.name || 'none'}`),
      React.createElement(Text, null, `Preview playing: ${previewSoundId ? SOUND_LIBRARY.find((sound) => sound.id === previewSoundId)?.name || previewSoundId : 'none'}`),
      React.createElement(Text, null,
        selectedEvent.id === 'unknown_command'
          ? 'Meaning: you typed something your shell does not recognize, like a command that does not exist.'
          : selectedEvent.id === 'command_error'
            ? 'Meaning: a real command did run, but it finished with a failure.'
            : selectedEvent.id === 'command_interrupted'
              ? 'Meaning: you stopped a running command with Ctrl+C.'
              : selectedEvent.id === 'sudo_used'
                ? 'Meaning: a command started with sudo. This can happen even if the command later succeeds or fails.'
                : null
      ),
      React.createElement(
        Text,
        null,
        interactive
          ? 'Left/Right or E/S = switch panes, Up/Down = move, Enter = save, Space = play or stop preview, R = reset, Q = quit'
          : 'Interactive keyboard input is not available in this shell. Run `soundfx tui` in a normal terminal window to use the live controls.'
      )
    ),
    React.createElement(
      Box,
      { marginTop: 1, borderStyle: 'round', borderColor: 'magenta', paddingX: 1 },
      React.createElement(Text, { color: 'magenta' }, status)
    )
  );
}

export async function runTui(args = [], launchContext = null) {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const instance = render(React.createElement(SoundfxTui, { args, interactive, launchContext }));
  if (!interactive) {
    setTimeout(() => instance.unmount(), 800);
  }
}
