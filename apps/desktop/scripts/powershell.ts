// PowerShell for the Windows process listing and for pinning one process before checking or killing it.
import { execFileSync } from 'node:child_process'
import { parseWindowsListing, type ProcessInfo } from './release-processes.ts'

/** Without the caller's PSModulePath, in any spelling: a PowerShell 7 parent sets it for itself. */
function powershellEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra }
  for (const name of Object.keys(env)) if (name.toLowerCase() === 'psmodulepath') delete env[name]
  return env
}

/** Runs a PowerShell command with UTF-8 output, whatever the console's code page. */
export function powershellOutput(
  command: string,
  extra: Record<string, string> = {},
  timeout = 30_000,
): string {
  return execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}`,
    ],
    { encoding: 'utf8', maxBuffer: 64 << 20, env: powershellEnv(extra), timeout },
  )
}

export const windowsProcesses = (): ProcessInfo[] =>
  parseWindowsListing(
    powershellOutput(
      "Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine,@{n='Created';e={if ($_.CreationDate) { [DateTimeOffset]::new($_.CreationDate).ToUnixTimeMilliseconds() } else { $null }}} | ConvertTo-Json -Compress",
    ),
  )

/** Pins the process object, then checks its creation time: a recycled Windows PID is never killed. */
export function windowsProcess(
  target: Pick<ProcessInfo, 'pid' | 'startedAt'>,
  action: 'kill' | 'check',
  timeout = 30_000,
): boolean {
  if (target.startedAt === undefined) return false
  const result = powershellOutput(
    [
      "$ErrorActionPreference = 'Stop'",
      'try { $p = [Diagnostics.Process]::GetProcessById([int]$env:OMNE_REAP_PID) } catch [ArgumentException] { exit 0 }',
      'try {',
      '  $null = $p.Handle',
      '  if ($p.HasExited -or [DateTimeOffset]::new($p.StartTime).ToUnixTimeMilliseconds() -ne [long]$env:OMNE_REAP_CREATED) { exit 0 }',
      ...(action === 'kill' ? ['  $p.Kill()'] : []),
      "  'matched'",
      '} catch { if (!$p.HasExited) { throw } } finally { $p.Dispose() }',
      'exit 0',
    ].join('\n'),
    { OMNE_REAP_PID: String(target.pid), OMNE_REAP_CREATED: String(target.startedAt) },
    timeout,
  )
  return result.trim() === 'matched'
}
