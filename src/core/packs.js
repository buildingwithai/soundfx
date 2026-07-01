import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

// CESP (Coding Event Sound Pack, openpeon.json) support — the open spec from
// PeonPing/openpeon. Installing a pack gives agent events that pack's sounds;
// every existing community pack works here unchanged.

export const PACKS_DIR = path.join(os.homedir(), '.soundfx', 'packs');

// CESP category -> soundfx agent event. Categories we don't fire are ignored;
// subagent_done has no CESP category, so it draws from task.complete variants.
export const CESP_EVENT_MAP = {
  agent_done: 'task.complete',
  subagent_done: 'task.complete',
  agent_needs_input: 'input.required',
  agent_error: 'task.error'
};

/** Parse + minimally validate an openpeon.json manifest object.
 *  Returns { ok, manifest?, reason? } — never throws. */
export function validateManifest(raw) {
  let manifest;
  try {
    manifest = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { ok: false, reason: 'openpeon.json is not valid JSON' };
  }
  if (!manifest || typeof manifest !== 'object') return { ok: false, reason: 'manifest is not an object' };
  if (!manifest.cesp_version) return { ok: false, reason: 'missing cesp_version' };
  if (!manifest.name) return { ok: false, reason: 'missing name' };
  if (!manifest.categories || typeof manifest.categories !== 'object') {
    return { ok: false, reason: 'missing categories' };
  }
  for (const [category, entry] of Object.entries(manifest.categories)) {
    if (!Array.isArray(entry?.sounds) || entry.sounds.some((s) => !s?.file)) {
      return { ok: false, reason: `category ${category} has no valid sounds array` };
    }
  }
  return { ok: true, manifest };
}

/** Pick the sound file for an agent event from a pack. Random among the
 *  category's variants (the CESP-player convention — variety is the charm).
 *  Returns an absolute path, or null when the pack doesn't cover the event. */
export function resolvePackSound(eventId, packDir, manifest, rng = Math.random) {
  const category = CESP_EVENT_MAP[eventId];
  if (!category) return null;
  const sounds = manifest.categories?.[category]?.sounds;
  if (!sounds?.length) return null;
  const pick = sounds[Math.floor(rng() * sounds.length)];
  const resolved = path.resolve(packDir, pick.file);
  // A manifest must not escape its pack directory ("../../etc/...").
  if (!resolved.startsWith(path.resolve(packDir) + path.sep)) return null;
  return resolved;
}

export function listInstalledPacks() {
  if (!fs.existsSync(PACKS_DIR)) return [];
  return fs.readdirSync(PACKS_DIR)
    .map((name) => {
      const dir = path.join(PACKS_DIR, name);
      const manifestPath = path.join(dir, 'openpeon.json');
      if (!fs.existsSync(manifestPath)) return null;
      const result = validateManifest(fs.readFileSync(manifestPath, 'utf-8'));
      return result.ok ? { name, dir, manifest: result.manifest } : null;
    })
    .filter(Boolean);
}

export function getPack(name) {
  return listInstalledPacks().find((pack) => pack.name === name) || null;
}

/** Install from a local directory or a git URL. Returns { ok, name?, message }. */
export function installPack(source) {
  fs.mkdirSync(PACKS_DIR, { recursive: true });

  let sourceDir = source;
  if (/^(https?:\/\/|git@)/.test(source)) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soundfx-pack-'));
    const clone = spawnSync('git', ['clone', '--depth', '1', source, tmp], { stdio: 'pipe', encoding: 'utf8' });
    if (clone.status !== 0) {
      return { ok: false, message: `git clone failed: ${clone.stderr?.split('\n')[0] || 'unknown error'}` };
    }
    sourceDir = tmp;
  }

  // The manifest may live at the root or one level down (repo wrapping a pack).
  let packRoot = sourceDir;
  if (!fs.existsSync(path.join(packRoot, 'openpeon.json'))) {
    const nested = fs.readdirSync(sourceDir)
      .map((entry) => path.join(sourceDir, entry))
      .find((dir) => fs.existsSync(path.join(dir, 'openpeon.json')));
    if (!nested) return { ok: false, message: `No openpeon.json found in ${source}` };
    packRoot = nested;
  }

  const result = validateManifest(fs.readFileSync(path.join(packRoot, 'openpeon.json'), 'utf-8'));
  if (!result.ok) return { ok: false, message: `Invalid pack: ${result.reason}` };

  const dest = path.join(PACKS_DIR, result.manifest.name);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(packRoot, dest, { recursive: true });
  return {
    ok: true,
    name: result.manifest.name,
    message: `Installed pack "${result.manifest.display_name || result.manifest.name}" -> ${dest}`
  };
}

export function uninstallPack(name) {
  const dest = path.join(PACKS_DIR, name);
  if (!fs.existsSync(dest)) return { ok: false, message: `Pack not installed: ${name}` };
  fs.rmSync(dest, { recursive: true, force: true });
  return { ok: true, message: `Removed pack ${name}` };
}
