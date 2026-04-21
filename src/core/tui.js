import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, render, useApp, useInput, useWindowSize } from 'ink';
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

const MIN_EVENT_WINDOW_SIZE = 4;
const MIN_SOUND_WINDOW_SIZE = 5;
const MAX_EVENT_WINDOW_SIZE = 6;
const MAX_SOUND_WINDOW_SIZE = 10;
const MAX_RECENT_SOUNDS = 8;

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

function getEventMeaning(eventId) {
  if (eventId === 'unknown_command') return 'Unknown command';
  if (eventId === 'command_error') return 'Command failed';
  if (eventId === 'command_interrupted') return 'Stopped with Ctrl+C';
  if (eventId === 'sudo_used') return 'Started with sudo';
  if (eventId === 'command_success') return 'Command succeeded';
  if (eventId === 'git_commit') return 'Git commit';
  if (eventId === 'npm_install') return 'Install command';
  return '';
}

function getEventShortLabel(eventId) {
  if (eventId === 'unknown_command') return 'UNKNOWN';
  if (eventId === 'command_success') return 'SUCCESS';
  if (eventId === 'command_error') return 'ERROR';
  if (eventId === 'command_interrupted') return 'CTRL+C';
  if (eventId === 'sudo_used') return 'SUDO';
  if (eventId === 'git_commit') return 'GIT';
  if (eventId === 'npm_install') return 'INSTALL';
  return eventId;
}

function normalizeSearchText(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function matchesSmartSearch(sound, query) {
  if (!query) return true;
  const haystack = normalizeSearchText(`${sound.id} ${sound.name}`);
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  return terms.every((term) => haystack.includes(term));
}

export function isPrintableSearchInput(input, key, focusPane) {
  return focusPane === 'sounds'
    && !key.ctrl
    && !key.meta
    && input
    && /^[ -~]$/.test(input)
    && input !== ' ';
}

function reorderSounds(soundLibrary, favoriteIds, recentIds, query) {
  const favoriteSet = new Set(favoriteIds);
  const recentSet = new Set(recentIds);
  const filtered = soundLibrary.filter((sound) => matchesSmartSearch(sound, query));
  const favorites = [];
  const recents = [];
  const rest = [];

  for (const sound of filtered) {
    if (sound.id === 'none') continue;
    if (favoriteSet.has(sound.id)) {
      favorites.push(sound);
    } else if (recentSet.has(sound.id)) {
      recents.push(sound);
    } else {
      rest.push(sound);
    }
  }

  const orderedFavorites = favoriteIds.map((id) => favorites.find((sound) => sound.id === id)).filter(Boolean);
  const orderedRecents = recentIds
    .filter((id) => !favoriteSet.has(id))
    .map((id) => recents.find((sound) => sound.id === id))
    .filter(Boolean);
  const orderedRest = rest.sort((a, b) => a.name.localeCompare(b.name));
  const noneSound = filtered.find((sound) => sound.id === 'none');

  return [
    ...(noneSound ? [noneSound] : []),
    ...orderedFavorites,
    ...orderedRecents,
    ...orderedRest
  ];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function SoundfxTui({ args, interactive, launchContext }) {
  const { exit } = useApp();
  const { rows, columns } = useWindowSize();
  const [config, setConfig] = useState(() => loadConfig());
  const [selectedEventIndex, setSelectedEventIndex] = useState(0);
  const [selectedSoundId, setSelectedSoundId] = useState('none');
  const [focusPane, setFocusPane] = useState('events');
  const [status, setStatus] = useState('Ready. Use Left/Right to switch panes, Up/Down to move, Enter to save, Space to preview, and Ctrl+Q to quit.');
  const [authReady, setAuthReady] = useState(false);
  const [previewSoundId, setPreviewSoundId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedEvent = TERMINAL_EVENTS[selectedEventIndex];
  const compactMode = rows > 0 && rows <= 24;
  const ultraCompactMode = rows > 0 && rows <= 18;
  const narrowMode = columns > 0 && columns <= 110;
  const pickerAtBottomMode = rows > 0 && rows <= 28;
  const eventWindowSize = clamp(
    ultraCompactMode ? 3 : compactMode ? 4 : 6,
    ultraCompactMode ? 3 : MIN_EVENT_WINDOW_SIZE,
    MAX_EVENT_WINDOW_SIZE
  );
  const soundWindowSize = clamp(
    ultraCompactMode ? 4 : compactMode ? 5 : 10,
    ultraCompactMode ? 4 : MIN_SOUND_WINDOW_SIZE,
    MAX_SOUND_WINDOW_SIZE
  );
  const showFullSetupBox = Boolean(launchContext && !compactMode);
  const showCompactSetupLine = Boolean(launchContext && compactMode);
  const showSummaryBox = !ultraCompactMode;
  const showControlsBox = !ultraCompactMode;
  const rootPadding = ultraCompactMode ? 0 : 1;
  const sectionMarginTop = ultraCompactMode ? 0 : 1;

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
  const favorites = useMemo(() => config.__meta?.favoriteSoundIds || [], [config]);
  const recents = useMemo(() => config.__meta?.recentSoundIds || [], [config]);
  const selectedMappedSound = useMemo(
    () => SOUND_LIBRARY.find((sound) => sound.id === selectedMapping)?.name || 'No sound',
    [selectedMapping]
  );
  const previewSoundName = useMemo(
    () => previewSoundId
      ? SOUND_LIBRARY.find((sound) => sound.id === previewSoundId)?.name || previewSoundId
      : 'none',
    [previewSoundId]
  );
  const displayedSounds = useMemo(
    () => reorderSounds(SOUND_LIBRARY, favorites, recents, searchQuery),
    [favorites, recents, searchQuery]
  );
  const selectedSoundIndex = useMemo(() => {
    const index = displayedSounds.findIndex((sound) => sound.id === selectedSoundId);
    return index >= 0 ? index : 0;
  }, [displayedSounds, selectedSoundId]);
  const selectedSound = displayedSounds[selectedSoundIndex] || displayedSounds[0] || SOUND_LIBRARY[0];
  const eventWindow = useMemo(
    () => getWindowedItems(TERMINAL_EVENTS, selectedEventIndex, eventWindowSize),
    [selectedEventIndex, eventWindowSize]
  );
  const soundWindow = useMemo(
    () => getWindowedItems(displayedSounds, selectedSoundIndex, soundWindowSize),
    [displayedSounds, selectedSoundIndex, soundWindowSize]
  );

  useEffect(() => {
    if (selectedMapping) {
      setSelectedSoundId(selectedMapping);
    }
  }, [selectedEventIndex, selectedMapping]);

  useEffect(() => {
    if (displayedSounds.length === 0) {
      return;
    }
    const exists = displayedSounds.some((sound) => sound.id === selectedSoundId);
    if (!exists) {
      setSelectedSoundId(displayedSounds[0].id);
    }
  }, [displayedSounds, selectedSoundId]);

  const updateMeta = (updater) => {
    setConfig((current) => {
      const nextMeta = updater({
        favoriteSoundIds: [...(current.__meta?.favoriteSoundIds || [])],
        recentSoundIds: [...(current.__meta?.recentSoundIds || [])]
      });
      const next = {
        ...current,
        __meta: {
          favoriteSoundIds: nextMeta.favoriteSoundIds,
          recentSoundIds: nextMeta.recentSoundIds
        }
      };
      void saveConfig(next);
      return next;
    });
  };

  const pushRecentSound = (soundId) => {
    if (!soundId || soundId === 'none') return;
    updateMeta((meta) => ({
      ...meta,
      recentSoundIds: [
        soundId,
        ...meta.recentSoundIds.filter((id) => id !== soundId)
      ].slice(0, MAX_RECENT_SOUNDS)
    }));
  };

  const toggleFavorite = () => {
    if (!selectedSound || selectedSound.id === 'none') {
      setStatus('No sound cannot be added to favorites.');
      return;
    }
    const isFavorite = favorites.includes(selectedSound.id);
    updateMeta((meta) => ({
      ...meta,
      favoriteSoundIds: isFavorite
        ? meta.favoriteSoundIds.filter((id) => id !== selectedSound.id)
        : [selectedSound.id, ...meta.favoriteSoundIds.filter((id) => id !== selectedSound.id)]
    }));
    setStatus(isFavorite
      ? `Removed ${selectedSound.name} from favorites.`
      : `Added ${selectedSound.name} to favorites.`);
  };

  const saveAssignment = async (eventIndex, soundIndex) => {
    if (!displayedSounds.length) {
      setStatus('No sounds match the current search.');
      return;
    }
    const event = TERMINAL_EVENTS[eventIndex];
    const sound = displayedSounds[soundIndex];
    const next = { ...config, [event.id]: sound.id };
    setConfig(next);
    await saveConfig(next);
    pushRecentSound(sound.id);
    setFocusPane('events');
    setStatus(`Saved ${event.id} -> ${sound.name}. Focus returned to Terminal Events.`);
  };

  const resetDefaults = async () => {
    const defaults = { ...getDefaultConfig(), __meta: config.__meta || getDefaultConfig().__meta };
    setConfig(defaults);
    await saveConfig(defaults);
    setStatus('Reset all terminal event sounds to the default set.');
  };

  const previewCurrent = async () => {
    if (!displayedSounds.length) {
      setStatus('No sounds match the current search.');
      return;
    }
    const result = await togglePreviewSound(selectedSound.id);
    setPreviewSoundId(getCurrentPreviewSoundId());
    if (!result.ok) {
      setStatus(result.reason || `Could not preview ${selectedSound.name}.`);
      return;
    }
    if (result.action === 'started') {
      pushRecentSound(selectedSound.id);
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
    const printableSearchInput = isPrintableSearchInput(input, key, focusPane);

    if (printableSearchInput) {
      const nextQuery = `${searchQuery}${input}`;
      setSearchQuery(nextQuery);
      setStatus(`Search: ${nextQuery}`);
      return;
    }

    if ((key.ctrl && lowerInput === 'q') || (focusPane !== 'sounds' && lowerInput === 'q')) {
      exit();
      return;
    }

    if (key.leftArrow) {
      setFocusPane('events');
      setStatus('Focus moved to Terminal Events. Use Up/Down to choose an event.');
      return;
    }

    if (key.rightArrow || key.tab) {
      setFocusPane('sounds');
      setStatus('Focus moved to Sound Library. Use Up/Down to choose a sound, then Enter to save it.');
      return;
    }

    if (key.escape) {
      if (searchQuery) {
        setSearchQuery('');
        setStatus('Search cleared.');
        return;
      }
    }

    if (key.backspace || key.delete) {
      if (focusPane === 'sounds' && searchQuery) {
        setSearchQuery((current) => current.slice(0, -1));
        setStatus(searchQuery.length === 1 ? 'Search cleared.' : `Search: ${searchQuery.slice(0, -1)}`);
        return;
      }
    }

    if (key.upArrow || lowerInput === 'k') {
      if (focusPane === 'events') {
        setSelectedEventIndex((current) => Math.max(0, current - 1));
        setStatus('Browsing terminal events.');
      } else {
        setSelectedSoundId(displayedSounds[Math.max(0, selectedSoundIndex - 1)]?.id || selectedSoundId);
        setStatus('Browsing sound library.');
      }
      return;
    }

    if (key.downArrow || lowerInput === 'j') {
      if (focusPane === 'events') {
        setSelectedEventIndex((current) => Math.min(TERMINAL_EVENTS.length - 1, current + 1));
        setStatus('Browsing terminal events.');
      } else {
        setSelectedSoundId(displayedSounds[Math.min(displayedSounds.length - 1, selectedSoundIndex + 1)]?.id || selectedSoundId);
        setStatus('Browsing sound library.');
      }
      return;
    }

    if (key.return) {
      void saveAssignment(selectedEventIndex, selectedSoundIndex);
      return;
    }

    if (key.ctrl && lowerInput === 'f') {
      toggleFavorite();
      return;
    }

    if (key.ctrl && lowerInput === 'r') {
      void resetDefaults();
      return;
    }

    if (lowerInput === ' ') {
      void previewCurrent();
      return;
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

  const pickerSection = React.createElement(Box, { marginTop: sectionMarginTop, gap: ultraCompactMode ? 1 : 2, flexDirection: 'row' },
      React.createElement(
        Box,
        { flexDirection: 'column', width: narrowMode ? 24 : 26, borderStyle: 'round', borderColor: focusPane === 'events' ? 'cyan' : 'gray', paddingX: 1 },
        React.createElement(Text, { color: 'cyan', bold: true }, focusPane === 'events' ? 'Terminal Events [ACTIVE]' : 'Terminal Events'),
        eventWindow.start > 0
          ? React.createElement(Text, { key: 'events-up', color: 'gray' }, `... ${eventWindow.start} more above`)
          : null,
        ...eventWindow.items.map(({ item: event, index }) => {
          const active = index === selectedEventIndex;
          const prefix = active ? '>' : ' ';
          const color = active ? 'black' : 'white';
          const bgColor = active ? 'cyan' : undefined;
          return React.createElement(
            Text,
            { key: event.id, color, backgroundColor: bgColor },
            `${prefix} ${getEventShortLabel(event.id)}`
          );
        }),
        eventWindow.end < TERMINAL_EVENTS.length
          ? React.createElement(Text, { key: 'events-down', color: 'gray' }, `... ${TERMINAL_EVENTS.length - eventWindow.end} more below`)
          : null
      ),
      React.createElement(
        Box,
        { flexDirection: 'column', flexGrow: 1, width: narrowMode ? 52 : 72, borderStyle: 'round', borderColor: focusPane === 'sounds' ? 'green' : 'gray', paddingX: 1 },
        React.createElement(Text, { color: 'green', bold: true }, focusPane === 'sounds' ? 'Sound Library [ACTIVE]' : 'Sound Library'),
        React.createElement(Text, { color: 'gray' }, searchQuery ? `Filter: ${searchQuery}` : `Favorites ${favorites.length} | Recents ${recents.length}`),
        soundWindow.start > 0
          ? React.createElement(Text, { key: 'sounds-up', color: 'gray' }, `... ${soundWindow.start} more above`)
          : null,
        ...soundWindow.items.map(({ item: sound, index }) => {
          const active = index === selectedSoundIndex;
          const assigned = selectedMapping === sound.id;
          const previewing = previewSoundId === sound.id;
          const favorite = favorites.includes(sound.id);
          const recent = recents.includes(sound.id);
          const prefix = active ? '>' : previewing ? '|' : assigned ? '*' : ' ';
          const color = active ? 'black' : previewing ? 'cyan' : assigned ? 'green' : 'white';
          const bgColor = active ? 'green' : undefined;
          return React.createElement(
            Text,
            { key: sound.id, color, backgroundColor: bgColor },
            `${prefix} ${favorite ? '★ ' : recent ? '• ' : ''}${sound.name}${previewing ? ' [playing]' : ''}`
          );
        }),
        displayedSounds.length === 0
          ? React.createElement(Text, { key: 'sounds-empty', color: 'gray' }, 'No sounds match this filter.')
          : null,
        soundWindow.end < displayedSounds.length
          ? React.createElement(Text, { key: 'sounds-down', color: 'gray' }, `... ${displayedSounds.length - soundWindow.end} more below`)
          : null
      )
    );

  return React.createElement(
    Box,
    { flexDirection: 'column', padding: rootPadding },
    React.createElement(Text, { color: 'cyan', bold: true }, 'soundfx CLI'),
    React.createElement(Text, { color: 'gray' }, `Editing ${getEventShortLabel(selectedEvent.id)} -> ${selectedMappedSound}`),
    showFullSetupBox
      ? React.createElement(
          Box,
          { marginTop: sectionMarginTop, flexDirection: 'column', borderStyle: 'round', borderColor: launchContext.hookChanged ? 'green' : 'blue', paddingX: 1 },
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
    showCompactSetupLine
      ? React.createElement(
          Box,
          { marginTop: sectionMarginTop, borderStyle: ultraCompactMode ? undefined : 'round', borderColor: launchContext.hookChanged ? 'green' : 'blue', paddingX: ultraCompactMode ? 0 : 1 },
          React.createElement(
            Text,
            { color: launchContext.hookChanged ? 'green' : 'blue' },
            launchContext.hookChanged
              ? `Setup complete. Restart ${launchContext.shell} once after you finish here.`
              : `${launchContext.audioBackend?.backendName || 'Audio'} ready.`
          )
        )
      : null,
    showSummaryBox
      ? React.createElement(
          Box,
          { marginTop: sectionMarginTop, borderStyle: 'round', borderColor: 'yellow', paddingX: 1, flexDirection: compactMode ? 'column' : 'row' },
          React.createElement(Text, { color: 'yellow' }, `Selected ${selectedSound.name}  |  Saved ${selectedMappedSound}`),
          React.createElement(
            Text,
            { color: 'yellow' },
            compactMode
              ? `${getEventMeaning(selectedEvent.id)}  |  Preview ${previewSoundName}`
              : `  |  ${getEventMeaning(selectedEvent.id)}  |  Preview ${previewSoundName}`
          )
        )
      : React.createElement(
          Box,
          { marginTop: sectionMarginTop },
          React.createElement(
            Text,
            { color: 'yellow' },
            `${getEventMeaning(selectedEvent.id)} | Selected ${selectedSound.name} | Saved ${selectedMappedSound} | Preview ${previewSoundName}`
          )
        ),
    showControlsBox
      ? React.createElement(
          Box,
          { marginTop: sectionMarginTop, borderStyle: 'round', borderColor: 'gray', paddingX: 1 },
          React.createElement(
            Text,
            { color: 'gray' },
            interactive
              ? (compactMode
                  ? 'Arrows move. Type to filter. Ctrl+F favorite. Enter save. Space play. Esc clear. Ctrl+Q quit.'
                  : 'Left/Right or Tab = switch panes, Up/Down = move, type to filter, Ctrl+F = favorite, Enter = save, Space = play or stop preview, Esc = clear search, Ctrl+R = reset, Ctrl+Q = quit')
              : 'Interactive keyboard input is not available in this shell. Run `soundfx tui` in a normal terminal window to use the live controls.'
          )
        )
      : null,
    pickerAtBottomMode ? pickerSection : null,
    React.createElement(
      Box,
      { marginTop: sectionMarginTop, borderStyle: ultraCompactMode ? undefined : 'round', borderColor: 'magenta', paddingX: ultraCompactMode ? 0 : 1 },
      React.createElement(
        Text,
        { color: 'magenta' },
        ultraCompactMode && interactive
          ? `${status} | Arrows move | Type filters | Enter saves | Space previews`
          : status
      )
    ),
    pickerAtBottomMode ? null : pickerSection
  );
}

export async function runTui(args = [], launchContext = null) {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const instance = render(React.createElement(SoundfxTui, { args, interactive, launchContext }));
  if (!interactive) {
    setTimeout(() => instance.unmount(), 800);
  }
}
