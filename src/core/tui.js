import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, render, useApp, useInput } from 'ink';
import {
  TERMINAL_EVENTS,
  SOUND_LIBRARY,
  getDefaultConfig,
  loadConfig,
  playSound,
  saveConfig
} from './index.js';

function SoundfxTui({ args, interactive }) {
  const { exit } = useApp();
  const [config, setConfig] = useState(() => loadConfig());
  const [selectedEventIndex, setSelectedEventIndex] = useState(0);
  const [selectedSoundIndex, setSelectedSoundIndex] = useState(0);
  const [focusPane, setFocusPane] = useState('events');
  const [status, setStatus] = useState('Ready. Use Left/Right to switch panes, Up/Down to move, Enter to save, P to preview, and Q to quit.');
  const [authReady, setAuthReady] = useState(false);

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

  const selectedMapping = useMemo(() => config[selectedEvent.id], [config, selectedEvent]);

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
    await playSound(selectedSound.id);
    setStatus(`Previewed ${selectedSound.name}`);
  };

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
    React.createElement(Box, { marginTop: 1, gap: 3 },
      React.createElement(
        Box,
        { flexDirection: 'column', width: 44, borderStyle: 'round', borderColor: focusPane === 'events' ? 'cyan' : 'gray', paddingX: 1 },
        React.createElement(Text, { color: 'cyan', bold: true }, focusPane === 'events' ? 'Terminal Events [ACTIVE]' : 'Terminal Events'),
        ...TERMINAL_EVENTS.map((event, index) => {
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
        })
      ),
      React.createElement(
        Box,
        { flexDirection: 'column', width: 38, borderStyle: 'round', borderColor: focusPane === 'sounds' ? 'green' : 'gray', paddingX: 1 },
        React.createElement(Text, { color: 'green', bold: true }, focusPane === 'sounds' ? 'Sound Library [ACTIVE]' : 'Sound Library'),
        ...SOUND_LIBRARY.map((sound, index) => {
          const active = index === selectedSoundIndex;
          const assigned = selectedMapping === sound.id;
          const prefix = active ? '>' : assigned ? '*' : ' ';
          const color = active ? 'black' : assigned ? 'green' : 'white';
          const bgColor = active ? 'green' : undefined;
          return React.createElement(
            Text,
            { key: sound.id, color, backgroundColor: bgColor },
            `${prefix} ${sound.name}`
          );
        })
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
      React.createElement(
        Text,
        null,
        interactive
          ? 'Left/Right or E/S = switch panes, Up/Down = move, Enter = save, P or Space = preview, R = reset, Q = quit'
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

export async function runTui(args = []) {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const instance = render(React.createElement(SoundfxTui, { args, interactive }));
  if (!interactive) {
    setTimeout(() => instance.unmount(), 800);
  }
}
