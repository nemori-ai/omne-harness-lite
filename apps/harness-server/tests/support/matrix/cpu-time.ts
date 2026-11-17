import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

/**
 * The CPU time one process has used, in seconds. Linux keeps it in clock ticks under `/proc`; a host
 * without `/proc` (macOS) gives it through `ps` as `[[dd-]hh:]mm:ss[.cc]`.
 */
export function cpuSecondsOf(pid: number): number {
  if (existsSync('/proc/self/stat')) {
    const fields =
      readFileSync(`/proc/${String(pid)}/stat`, 'utf8')
        .split(') ')[1]
        ?.split(' ') ?? []
    const hertz = Number(
      spawnSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).stdout.trim() || '100',
    )
    return (Number(fields[11]) + Number(fields[12])) / hertz
  }
  const shown = spawnSync('ps', ['-o', 'cputime=', '-p', String(pid)], { encoding: 'utf8' })
  return cpuTimeSeconds(shown.stdout)
}

/** `[[dd-]hh:]mm:ss[.cc]` as seconds; NaN for anything else, so a check on it fails rather than passes. */
export function cpuTimeSeconds(text: string): number {
  const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(text.trim())
  if (match === null) return Number.NaN
  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match
  return ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds)
}
