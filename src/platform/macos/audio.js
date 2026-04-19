import { spawnSync } from 'child_process';

export function playMacSoundFile(filePath) {
  try {
    const result = spawnSync('afplay', [filePath], {
      stdio: 'pipe',
      encoding: 'utf8'
    });

    return {
      ok: result.status === 0,
      code: result.status ?? null,
      stderr: (result.stderr || '').trim()
    };
  } catch (error) {
    return {
      ok: false,
      code: null,
      stderr: error instanceof Error ? error.message : String(error)
    };
  }
}
