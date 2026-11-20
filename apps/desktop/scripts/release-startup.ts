// The verdict of check 4: the release app starts on a fresh profile, gets its window ready, quits
// cleanly with everything it started, and writes only where it was told to.
import {
  COOKIE_KEY_CHECKED_MESSAGE,
  COOKIE_KEY_MISMATCH_MESSAGE,
  COOKIE_KEY_STORED_MESSAGE,
  COOKIE_KEY_WRITER_FAILED_FILE,
  COOKIE_KEY_WRITER_WARNINGS,
} from '../src/startup-signals.ts'
import {
  describeProcesses,
  missingKinds,
  type ProcessInfo,
  processKind,
} from './release-processes.ts'
import { describeExit, type LaunchOutcome, type Verdict } from './release-verdicts.ts'
import type { ScreenLock } from './session-state.ts'

export type CookieKeyObservation = Readonly<{
  stored: number
  writerMs?: number
  checked: number
  mismatch: number
  warnings: readonly string[]
  failureRecord: boolean
}>

export type LaunchDiagnostics = Readonly<{
  mainLines: readonly Readonly<{ ms: number; record: Record<string, unknown> }>[]
  stderr: string
  running?: string
}>

export type StartupObservation = Readonly<{
  platform: NodeJS.Platform
  rootPid: number
  profile?: string | undefined
  readyMs?: number | undefined
  readyTimeoutMs: number
  notReady?: Readonly<{ endedByItself: boolean; outcome: LaunchOutcome }>
  quit?: Readonly<{
    method: string
    requestError?: string | undefined
    outcome: LaunchOutcome
    ms: number
    timeoutMs: number
  }>
  launched: readonly ProcessInfo[]
  leftovers: readonly ProcessInfo[]
  userData: Readonly<{ written: readonly string[]; missing: readonly string[] }>
  realUserData: Readonly<{ path: string; before: string; after: string }>
  diagnostics?: LaunchDiagnostics
  screenAtFailure?: ScreenLock
  cookieKey: CookieKeyObservation
}>

export function observeCookieKey(
  records: readonly Record<string, unknown>[],
  failureRecord: boolean,
): CookieKeyObservation {
  let [stored, checked, mismatch] = [0, 0, 0]
  let writerMs: number | undefined
  const warnings: string[] = []
  const known: readonly unknown[] = COOKIE_KEY_WRITER_WARNINGS
  for (const { msg, ms } of records)
    if (msg === COOKIE_KEY_STORED_MESSAGE) {
      stored += 1
      if (writerMs === undefined && typeof ms === 'number') writerMs = ms
    } else if (msg === COOKIE_KEY_CHECKED_MESSAGE) checked += 1
    else if (msg === COOKIE_KEY_MISMATCH_MESSAGE) mismatch += 1
    else if (known.includes(msg)) warnings.push(String(msg))
  return {
    stored,
    checked,
    mismatch,
    warnings,
    failureRecord,
    ...(writerMs === undefined ? {} : { writerMs }),
  }
}

/** Windows: a fresh profile's key is stored and checked once each; elsewhere no writer runs at all. */
export function judgeCookieKey(
  platform: NodeJS.Platform,
  observed: CookieKeyObservation,
): Readonly<{ problems: string[]; summary: string }> {
  const problems = [
    ...(observed.mismatch > 0 ? [`the main process logged "${COOKIE_KEY_MISMATCH_MESSAGE}"`] : []),
    ...observed.warnings.map(warning => `the main process logged "${warning}"`),
    ...(observed.failureRecord
      ? [`${COOKIE_KEY_WRITER_FAILED_FILE} was left in the fresh --user-data-dir`]
      : []),
  ]
  const counts = `${observed.stored} "stored", ${observed.checked} "checked"`
  if (platform !== 'win32') {
    if (observed.stored > 0 || observed.checked > 0)
      problems.push(`the cookie key writer ran, which only Windows builds do: ${counts} lines`)
    return { problems, summary: 'no cookie key writer lines (Windows only)' }
  }
  if (observed.stored !== 1 || observed.checked !== 1)
    problems.push(
      `on a fresh profile the key must be stored and checked once each: ${counts} lines`,
    )
  const took = observed.writerMs === undefined ? '' : ` in ${observed.writerMs} ms`
  return { problems, summary: `cookie key stored by its writer${took} and checked` }
}

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text
const ROUTINE = new Set(['level', 'time', 'process', 'msg'])

/** What a failed launch leaves to go on: its last main-process lines, what ran, the end of stderr. */
export function describeDiagnostics(diagnostics: LaunchDiagnostics | undefined): string {
  if (diagnostics === undefined) return ''
  const parts: string[] = []
  if (diagnostics.running !== undefined)
    parts.push(`running then: ${diagnostics.running || 'nothing'}`)
  const lines = diagnostics.mainLines.slice(-12).map(({ ms, record }) => {
    const extra = Object.fromEntries(
      Object.entries(record).filter(([field]) => !ROUTINE.has(field)),
    )
    const fields = Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : ''
    return clip(
      `[+${ms} ms] ${String(record['level'] ?? '?')} ${String(record['msg'])}${fields}`,
      200,
    )
  })
  parts.push(
    lines.length === 0 ? 'no main-process line' : `main-process lines: ${lines.join(' | ')}`,
  )
  const stderr = diagnostics.stderr.trim()
  const tail = stderr.length > 1_000 ? `…${stderr.slice(-1_000)}` : stderr
  parts.push(
    stderr === ''
      ? 'nothing on stderr'
      : `stderr ends: ${JSON.stringify(tail.replace(/\s*\r?\n\s*/g, ' ⏎ '))}`,
  )
  return `; ${parts.join('; ')}`
}

function waitingHint(screen: ScreenLock | undefined): string {
  if (screen !== undefined && 'locked' in screen && screen.locked)
    return '; the macOS screen was locked, and macOS reports no window as shown then: unlock it and run again'
  const unknown =
    screen !== undefined && 'unknown' in screen ? `; screen lock unknown (${screen.unknown})` : ''
  return `${unknown}; a system dialog or a first-launch policy check may be waiting (not retried)`
}

function notReadyReason(observed: StartupObservation): string {
  const reported = observed.profile !== undefined
  if (observed.notReady?.endedByItself)
    return `the app ${describeExit(observed.notReady.outcome)} ${reported ? 'before its main window was ready' : 'without reporting its build profile'}`
  const waiting = observed.platform === 'darwin' ? waitingHint(observed.screenAtFailure) : ''
  const what = reported
    ? 'its main window was not ready'
    : 'the app did not report its build profile'
  return `${what} within ${observed.readyTimeoutMs / 1000} s; killed with all its processes${waiting}`
}

function quitProblems(
  observed: StartupObservation,
  quit: NonNullable<StartupObservation['quit']>,
): string[] {
  const problems: string[] = []
  if (quit.requestError !== undefined)
    problems.push(`asking it to quit (${quit.method}) failed: ${quit.requestError}`)
  if (quit.outcome.timedOut)
    problems.push(`asked to quit, it did not exit within ${quit.timeoutMs / 1000} s`)
  else if (quit.outcome.code !== 0 || quit.outcome.signal !== null)
    problems.push(`asked to quit, it ${describeExit(quit.outcome)}, not 0`)
  const missing = missingKinds(observed.launched, observed.rootPid)
  if (missing.length > 0)
    problems.push(
      `the listing saw no ${missing.join(', ')} process (saw: ${describeProcesses(observed.launched, observed.rootPid)})`,
    )
  if (observed.leftovers.length > 0)
    problems.push(
      `${observed.leftovers.length} of its processes outlived it (killed): ` +
        observed.leftovers
          .map(process => `${process.pid} ${processKind(process, observed.rootPid)}`)
          .join(', '),
    )
  if (observed.userData.missing.length > 0)
    problems.push(
      `it did not write ${observed.userData.missing.join(', ')} into its --user-data-dir (found: ${observed.userData.written.join(', ') || 'nothing'})`,
    )
  const real = observed.realUserData
  if (real.after !== real.before)
    problems.push(
      `the installed app's userData ${real.path} was ${real.before === 'absent' ? 'created' : 'changed'}`,
    )
  return problems
}

export function judgeStartup(observed: StartupObservation): Verdict {
  const fail = (reason: string): Verdict => ({
    status: 'fail',
    reason: reason + describeDiagnostics(observed.diagnostics),
  })
  if (observed.profile !== undefined && observed.profile !== 'release')
    return fail(
      `the main process reports build profile ${JSON.stringify(observed.profile)}, not "release"`,
    )
  if (observed.readyMs !== undefined && observed.profile === undefined)
    return fail('the main window was ready before the main process reported its build profile')
  const { quit } = observed
  if (observed.readyMs === undefined || observed.notReady !== undefined || quit === undefined)
    return fail(notReadyReason(observed))
  const cookieKey = judgeCookieKey(observed.platform, observed.cookieKey)
  const problems = [...quitProblems(observed, quit), ...cookieKey.problems]
  if (problems.length > 0) return fail(problems.join('; '))
  const real = observed.realUserData
  return {
    status: 'pass',
    reason:
      `build profile release, main window ready in ${observed.readyMs} ms; ${quit.method} → exit 0 in ${quit.ms} ms; ` +
      `all ${observed.launched.length} processes gone (${describeProcesses(observed.launched, observed.rootPid)}); ` +
      `wrote ${observed.userData.written.toSorted().join(', ')} into the fresh --user-data-dir; ${cookieKey.summary}; ` +
      `${real.path} ${real.before === 'absent' ? 'absent before and after' : 'unchanged'}`,
  }
}
