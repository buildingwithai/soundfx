import { spawnSync } from 'child_process';

export function playWindowsSoundFile(filePath) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName presentationCore",
    `$player = New-Object System.Windows.Media.MediaPlayer`,
    `$player.Open([Uri]'file:///${filePath.replace(/\\/g, '/')}')`,
    "$deadline = [DateTime]::UtcNow.AddSeconds(5)",
    "while (-not $player.NaturalDuration.HasTimeSpan -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 100 }",
    "$player.Volume = 1.0",
    "$player.Play()",
    "if ($player.NaturalDuration.HasTimeSpan) {",
    "  $durationMs = [Math]::Ceiling($player.NaturalDuration.TimeSpan.TotalMilliseconds) + 250",
    "  Start-Sleep -Milliseconds ([Math]::Min($durationMs, 15000))",
    "} else {",
    "  Start-Sleep -Seconds 4",
    "}",
    "$player.Stop()",
    "$player.Close()"
  ].join('; ');

  try {
    const result = spawnSync('powershell', [
      '-NoProfile',
      '-STA',
      '-WindowStyle',
      'Hidden',
      '-Command',
      script
    ], {
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

export function playWindowsWavFile(filePath) {
  try {
    const result = spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      `(New-Object Media.SoundPlayer '${filePath.replace(/'/g, "''")}').PlaySync()`
    ], {
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
