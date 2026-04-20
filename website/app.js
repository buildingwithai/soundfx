const copyButton = document.getElementById('copy-button');
const installCommand = document.getElementById('install-command');
const secondaryCopyButtons = Array.from(document.querySelectorAll('[data-copy]'));
const demoSoundToggle = document.getElementById('demo-sound-toggle');
const demoSoundIcon = document.getElementById('demo-sound-icon');
const terminalShell = document.getElementById('terminal-shell');
const terminalTranscript = document.getElementById('terminal-transcript');
const shellPrefix = 'PS D:\\AI Apps\\soundfx>';

if (copyButton && installCommand) {
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(installCommand.textContent.trim());
      const original = copyButton.textContent;
      copyButton.textContent = 'Copied';
      setTimeout(() => {
        copyButton.textContent = original;
      }, 1600);
    } catch {
      copyButton.textContent = 'Copy failed';
      setTimeout(() => {
        copyButton.textContent = 'Copy';
      }, 1600);
    }
  });
}

for (const button of secondaryCopyButtons) {
  button.addEventListener('click', async () => {
    const textToCopy = button.getAttribute('data-copy');
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      const original = button.textContent;
      button.textContent = 'Copied';
      setTimeout(() => {
        button.textContent = original;
      }, 1600);
    } catch {
      const original = button.textContent;
      button.textContent = 'Copy failed';
      setTimeout(() => {
        button.textContent = original;
      }, 1600);
    }
  });
}

const soundLibrary = {
  drake_embarrassing: 'https://www.myinstants.com/media/sounds/drake-embarrassing_Ts9wkE9.mp3',
  ws_in_the_chat: 'https://www.myinstants.com/media/sounds/ws-in-de-chat.mp3',
  access_denied: 'https://www.myinstants.com/media/sounds/access-denied_Is238Ly.mp3',
  mission_failed: 'https://www.myinstants.com/media/sounds/dank-meme-compilation-volume-17_cutted.mp3',
  noice: 'https://www.myinstants.com/media/sounds/-click-nice_3.mp3'
};

const eventMappings = {
  unknown_command: 'drake_embarrassing',
  command_error: 'access_denied',
  command_success: 'ws_in_the_chat',
  run_all_actions: 'mission_failed'
};

const knownCommands = {
  soundfx: () => Promise.resolve(),
  'sound effects': () => Promise.resolve(),
  'soundfx list': () => appendOutputLines([
    `unknown_command -> ${eventMappings.unknown_command}`,
    `command_error -> ${eventMappings.command_error}`,
    `command_success -> ${eventMappings.command_success}`,
    `run_all_actions -> ${eventMappings.run_all_actions}`
  ]),
  'soundfx sounds': () => appendOutputLines(Object.keys(soundLibrary)),
  'soundfx help': () => appendOutputLines([
    'soundfx',
    'soundfx list',
    'soundfx sounds',
    'soundfx assign <event> <sound>',
    'soundfx test <event>',
    'soundfx run all'
  ]),
  'soundfx run all': () => {
    playMappedSound('run_all_actions');
    return appendSuccess('Triggered all actions.');
  },
  dir: () => appendOutputLines([
    '',
    '    Directory: D:\\AI Apps\\soundfx',
    '',
    'Mode                 LastWriteTime         Length Name',
    '----                 -------------         ------ ----',
    'd----          04/19/2026   08:10 PM                website',
    '-a---          04/19/2026   07:46 PM           1132 package.json',
    '-a---          04/19/2026   07:32 PM           1185 README.md'
  ]),
  pwd: () => appendOutputLines(['Path', '----', 'D:\\AI Apps\\soundfx'])
};

let audioEnabled = false;
let currentAudio = null;
let interactiveReady = false;
let currentPromptLine = null;
let currentPromptInput = '';
let currentPromptValueEl = null;
let cueResetTimer = null;

const startupSequence = [
  { kind: 'command', text: 'npm install -g @buildingwithai/soundfx', speed: 28, delay: 500 },
  { kind: 'success', text: 'added soundfx globally in 2.4s', delay: 700 },
  { kind: 'command', text: 'soundfx', speed: 42, delay: 650 },
  { kind: 'command', text: 'k', speed: 220, delay: 200 },
  {
    kind: 'error-block',
    lines: [
      "k : The term 'k' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the spelling of the name, or if a path was included, verify that the path is correct and try again.",
      'At line:1 char:1',
      '+ k',
      '+ ~',
      '    + CategoryInfo          : ObjectNotFound: (k:String) [], CommandNotFoundException',
      '    + FullyQualifiedErrorId : CommandNotFoundException'
    ],
    delay: 300,
    soundEvent: 'unknown_command'
  }
];

function appendLine(kind, prefix, text, options = {}) {
  if (!terminalTranscript) return Promise.resolve();

  const line = document.createElement('div');
  line.className = `terminal-line ${kind}`;

  const prefixEl = document.createElement('span');
  prefixEl.className = 'terminal-prefix';
  prefixEl.textContent = prefix || '';

  const contentEl = document.createElement('span');
  contentEl.className = 'terminal-content';

  line.appendChild(prefixEl);
  line.appendChild(contentEl);
  terminalTranscript.appendChild(line);
  scrollTranscriptToBottom();

  if (!options.typed) {
    contentEl.textContent = text;
    scrollTranscriptToBottom();
    return Promise.resolve();
  }

  return typeInto(contentEl, text, options.speed || 32);
}

function appendErrorBlock(lines) {
  return lines.reduce(
    (chain, line) => chain.then(() => appendLine('error', '', line)).then(() => wait(36)),
    Promise.resolve()
  );
}

function removePromptLine() {
  if (currentPromptLine) {
    currentPromptLine.remove();
    currentPromptLine = null;
  }
}

function renderIdlePrompt() {
  if (!terminalTranscript || !interactiveReady) return;

  removePromptLine();
  currentPromptInput = '';
  currentPromptValueEl = null;

  const line = document.createElement('div');
  line.className = 'terminal-line command terminal-line-prompt';

  const prefixEl = document.createElement('span');
  prefixEl.className = 'terminal-prefix';
  prefixEl.textContent = shellPrefix;

  const contentEl = document.createElement('span');
  contentEl.className = 'terminal-content';

  const valueEl = document.createElement('span');
  valueEl.className = 'terminal-live-value';

  const ghostCursor = document.createElement('span');
  ghostCursor.className = 'terminal-cursor';

  contentEl.appendChild(valueEl);
  contentEl.appendChild(ghostCursor);
  line.appendChild(prefixEl);
  line.appendChild(contentEl);

  terminalTranscript.appendChild(line);
  currentPromptLine = line;
  currentPromptValueEl = valueEl;
  scrollTranscriptToBottom();
}

function typeInto(element, text, speed) {
  return new Promise((resolve) => {
    let index = 0;
    const cursor = document.createElement('span');
    cursor.className = 'terminal-cursor';
    element.appendChild(cursor);

    function tick() {
      if (index >= text.length) {
        cursor.remove();
        resolve();
        return;
      }

      cursor.insertAdjacentText('beforebegin', text[index]);
      index += 1;
      scrollTranscriptToBottom();
      setTimeout(tick, speed);
    }

    tick();
  });
}

function scrollTranscriptToBottom() {
  if (!terminalTranscript) return;
  terminalTranscript.scrollTop = terminalTranscript.scrollHeight;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendOutputLines(lines) {
  return lines.reduce(
    (chain, line) => chain.then(() => appendLine('output', '', line)).then(() => wait(120)),
    Promise.resolve()
  );
}

function appendSuccess(text) {
  return appendLine('success', '', text);
}

function appendError(text) {
  return appendLine('error', '', text);
}

function normalizeInput(value) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function mapSoundAlias(alias) {
  const normalized = alias.trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
  if (soundLibrary[normalized]) return normalized;
  return null;
}

function flashTerminalCue(kind) {
  if (!terminalShell) return;
  terminalShell.classList.remove('is-success-cue', 'is-error-cue');
  if (cueResetTimer) {
    clearTimeout(cueResetTimer);
  }
  const className = kind === 'error' ? 'is-error-cue' : 'is-success-cue';
  terminalShell.classList.add(className);
  cueResetTimer = setTimeout(() => {
    terminalShell.classList.remove(className);
  }, 520);
}

function playMappedSound(eventId) {
  const soundKey = eventMappings[eventId];
  const soundUrl = soundLibrary[soundKey];
  if (!audioEnabled || !soundUrl) return;

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }

  currentAudio = new Audio(soundUrl);
  currentAudio.volume = 0.45;
  currentAudio.preload = 'auto';
  currentAudio.play().catch(() => {
    audioEnabled = false;
    updateSoundToggle();
  });
}

async function runStartupSequence() {
  if (!terminalTranscript) return;

  terminalTranscript.innerHTML = '';
  removePromptLine();

  for (const step of startupSequence) {
    if (step.kind === 'command') {
      await appendLine('command', shellPrefix, step.text, { typed: true, speed: step.speed });
    } else if (step.kind === 'error-block') {
      await appendErrorBlock(step.lines);
    } else {
      await appendLine(step.kind, '', step.text);
    }

    if (step.soundEvent) {
      playMappedSound(step.soundEvent);
    }

    await wait(step.delay || 500);
  }

  interactiveReady = true;
  renderIdlePrompt();
  focusTerminalInput();
}

function focusTerminalInput() {
  if (!interactiveReady || !terminalShell) return;
  terminalShell.focus();
}

function syncPromptInput() {
  if (!currentPromptValueEl) return;
  currentPromptValueEl.textContent = currentPromptInput;
  scrollTranscriptToBottom();
}

function handleTerminalKeydown(event) {
  if (!interactiveReady) return;

  const isPlainKey =
    event.key.length === 1 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey;

  if (isPlainKey) {
    event.preventDefault();
    currentPromptInput += event.key;
    syncPromptInput();
    return;
  }

  if (event.key === 'Backspace') {
    event.preventDefault();
    currentPromptInput = currentPromptInput.slice(0, -1);
    syncPromptInput();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    const submitted = currentPromptInput;
    currentPromptInput = '';
    syncPromptInput();
    handleCommand(submitted).then(() => {
      focusTerminalInput();
    });
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    currentPromptInput = '';
    syncPromptInput();
  }
}

async function handleCommand(rawCommand) {
  const command = normalizeInput(rawCommand);
  removePromptLine();

  await appendLine('command', shellPrefix, rawCommand);

  if (!command) {
    renderIdlePrompt();
    return;
  }

  const assignMatch = command.match(/^soundfx assign ([a-z_]+) ([a-z0-9_\-\s]+)$/);
  if (assignMatch) {
    const eventId = assignMatch[1];
    const soundAlias = mapSoundAlias(assignMatch[2]);

    if (!eventMappings[eventId]) {
      await appendError(`Unknown event: ${eventId}`);
      playMappedSound('command_error');
      renderIdlePrompt();
      return;
    }

    if (!soundAlias) {
      await appendError(`Unknown sound: ${assignMatch[2].trim()}`);
      playMappedSound('command_error');
      renderIdlePrompt();
      return;
    }

    eventMappings[eventId] = soundAlias;
    flashTerminalCue('success');
    playMappedSound('command_success');
    await appendSuccess(`Assigned ${soundAlias} to ${eventId}.`);
    renderIdlePrompt();
    return;
  }

  const testMatch = command.match(/^soundfx test ([a-z_]+)$/);
  if (testMatch) {
    const eventId = testMatch[1];

    if (!eventMappings[eventId]) {
      await appendError(`Unknown event: ${eventId}`);
      playMappedSound('command_error');
      renderIdlePrompt();
      return;
    }

    flashTerminalCue('success');
    playMappedSound(eventId);
    playMappedSound('command_success');
    await appendSuccess(`Tested ${eventId}.`);
    renderIdlePrompt();
    return;
  }

  const commandHandler = knownCommands[command];
  if (commandHandler) {
    await commandHandler();
    flashTerminalCue('success');
    playMappedSound('command_success');
    renderIdlePrompt();
    return;
  }

  await appendError(
    `${rawCommand} : The term '${rawCommand}' is not recognized as the name of a cmdlet, function, script file, or operable program.`
  );
  await appendErrorBlock([
    'At line:1 char:1',
    `+ ${rawCommand}`,
    `+ ${'~'.repeat(Math.max(rawCommand.length, 1))}`,
    `    + CategoryInfo          : ObjectNotFound: (${rawCommand}:String) [], CommandNotFoundException`,
    '    + FullyQualifiedErrorId : CommandNotFoundException'
  ]);
  flashTerminalCue('error');
  playMappedSound('unknown_command');
  renderIdlePrompt();
}

function updateSoundToggle() {
  if (!demoSoundToggle) return;
  if (demoSoundIcon) {
    demoSoundIcon.textContent = audioEnabled ? 'Sound on' : 'Play sound';
  }
  demoSoundToggle.classList.toggle('is-enabled', audioEnabled);
  demoSoundToggle.classList.toggle('is-awaiting-click', !audioEnabled);
  demoSoundToggle.setAttribute('aria-pressed', String(audioEnabled));
  demoSoundToggle.setAttribute('aria-label', audioEnabled ? 'Turn demo sound off' : 'Turn demo sound on');
}

if (demoSoundToggle) {
  demoSoundToggle.addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    if (!audioEnabled && currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
    updateSoundToggle();
  });
}

if (terminalShell) {
  terminalShell.addEventListener('click', () => {
    focusTerminalInput();
  });
  terminalShell.addEventListener('keydown', handleTerminalKeydown);
  terminalShell.setAttribute('tabindex', '0');
}

updateSoundToggle();
runStartupSequence();
