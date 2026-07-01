import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

// CESP (Coding Event Sound Pack, openpeon.json) support — the open spec from
// PeonPing/openpeon. Installing a pack gives agent events that pack's sounds;
// every existing community pack works here unchanged.

export const PACKS_DIR = path.join(os.homedir(), '.soundfx', 'packs');
// Packs shipped inside the npm package (the original, fully-owned defaults).
export const BUNDLED_PACKS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'packs');

// CESP category -> soundfx agent event. Categories we don't fire are ignored.
// subagent_done maps to task.progress (semantically: progress on the main
// task); packs without that category fall back to task.complete variants.
export const CESP_EVENT_MAP = {
  agent_done: 'task.complete',
  subagent_done: 'task.progress',
  agent_needs_input: 'input.required',
  agent_error: 'task.error'
};
const CESP_FALLBACK = { 'task.progress': 'task.complete' };

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

/** Pick the sound file for an agent event from a pack.
 *  With `variantIndex` (the session's voice), the pick is deterministic —
 *  variant N is per-session voice N, so parallel agents stay distinguishable
 *  by ear even with a pack active. Without it, random among variants (the
 *  CESP-player convention — variety is the charm).
 *  Returns an absolute path, or null when the pack doesn't cover the event. */
export function resolvePackSound(eventId, packDir, manifest, { rng = Math.random, variantIndex = null } = {}) {
  let category = CESP_EVENT_MAP[eventId];
  if (!category) return null;
  let sounds = manifest.categories?.[category]?.sounds;
  if (!sounds?.length && CESP_FALLBACK[category]) {
    sounds = manifest.categories?.[CESP_FALLBACK[category]]?.sounds;
  }
  if (!sounds?.length) return null;
  const index = variantIndex !== null
    ? variantIndex % sounds.length
    : Math.floor(rng() * sounds.length);
  const pick = sounds[index];
  const resolved = path.resolve(packDir, pick.file);
  // A manifest must not escape its pack directory ("../../etc/...").
  if (!resolved.startsWith(path.resolve(packDir) + path.sep)) return null;
  return resolved;
}

function readPacksFrom(baseDir, bundled) {
  if (!fs.existsSync(baseDir)) return [];
  return fs.readdirSync(baseDir)
    .map((name) => {
      const dir = path.join(baseDir, name);
      const manifestPath = path.join(dir, 'openpeon.json');
      if (!fs.existsSync(manifestPath)) return null;
      const result = validateManifest(fs.readFileSync(manifestPath, 'utf-8'));
      return result.ok ? { name, dir, manifest: result.manifest, bundled } : null;
    })
    .filter(Boolean);
}

/** User-installed packs plus the packs shipped inside the npm package.
 *  A user-installed pack shadows a bundled pack with the same name. */
export function listInstalledPacks() {
  const installed = readPacksFrom(PACKS_DIR, false);
  const names = new Set(installed.map((pack) => pack.name));
  const bundledPacks = readPacksFrom(BUNDLED_PACKS_DIR, true).filter((pack) => !names.has(pack.name));
  return [...installed, ...bundledPacks];
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
