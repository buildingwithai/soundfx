import { spawnSync } from 'child_process';

const LINUX_PLAYERS = ['paplay', 'aplay', 'ffplay'];

export function playLinuxSoundFile(filePath) {
  for (const player of LINUX_PLAYERS) {
    try {
      const args = player === 'ffplay'
        ? ['-nodisp', '-autoexit', '-loglevel', 'quiet', filePath]
        : [filePath];
      const result = spawnSync(player, args, {
        stdio: 'pipe',
        encoding: 'utf8'
      });

      if (result.status === 0) {
        return { ok: true, player, code: 0, stderr: '' };
      }
    } catch {}
  }

  return {
    ok: false,
    player: null,
    code: null,
    stderr: 'No supported Linux audio player was found (tried paplay, aplay, ffplay).'
  };
}
