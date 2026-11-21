// The decisions of `pnpm run verify:release`, apart from launching anything, so they are unit-tested.
import {
  REMOTE_DEBUGGING_EXIT_CODE,
  REMOTE_DEBUGGING_REFUSED_MESSAGE,
} from '../src/startup-signals.ts'
import type { AsarEntry } from './asar.ts'
import { BUNDLES } from './build-profile.ts'
import type { ProcessInfo } from './release-processes.ts'

export type CheckStatus = 'pass' | 'fail' | 'skipped'
export type CheckResult = Readonly<{
  id: number
  name: string
  status: CheckStatus
  reason: string
}>
export type Verdict = Readonly<{ status: CheckStatus; reason: string }>

export const VERIFIED_EXIT = 0
export const FAILED_EXIT = 1
export const INCOMPLETE_EXIT = 2
export const REQUIRED_CHECKS: readonly number[] = [1, 2, 3, 4]
export const DISTRIBUTION_FLAG = '--distribution'
export const ALLOW_NO_SANDBOX_FLAG = '--allow-no-sandbox'

/** A skipped check never counts as passed: one of 1 to 4 skipped (or 5 when signing is required) is incomplete. */
export function summarize(
  results: readonly CheckResult[],
  { signingRequired = false } = {},
): { lines: string[]; exitCode: number } {
  const width = Math.max(...results.map(result => `${result.id} ${result.name}`.length))
  const lines = results.map(
    result =>
      `${result.status.padEnd(8)} ${`${result.id} ${result.name}`.padEnd(width)}  ${result.reason.trim() || '(no reason given)'}`,
  )
  const explained = (result: CheckResult) => result.reason.trim() !== ''
  const passed = results.filter(result => result.status === 'pass' && explained(result)).length
  const skippedResults = results.filter(result => result.status === 'skipped' && explained(result))
  const failed = results.length - passed - skippedResults.length
  const incomplete = [
    ...skippedResults
      .filter(result => REQUIRED_CHECKS.includes(result.id) || signingRequired)
      .map(result => result.id),
    ...REQUIRED_CHECKS.filter(id => !results.some(result => result.id === id)),
  ].toSorted((a, b) => a - b)
  const counts = `${passed} passed, ${failed} failed, ${skippedResults.length} skipped`
  if (failed > 0)
    return { lines: [...lines, `${counts}: FAILED (exit ${FAILED_EXIT})`], exitCode: FAILED_EXIT }
  if (incomplete.length > 0)
    return {
      lines: [
        ...lines,
        `${counts}: INCOMPLETE, not verified (exit ${INCOMPLETE_EXIT}): checks ${incomplete.join(', ')} did not run`,
      ],
      exitCode: INCOMPLETE_EXIT,
    }
  return {
    lines: [...lines, `${counts}: verified (exit ${VERIFIED_EXIT})`],
    exitCode: VERIFIED_EXIT,
  }
}

export type LaunchGate = Readonly<{ run: boolean; switches: string[]; note?: string }>

/** The test control runs in the same Chromium sandbox mode as its release launch, or not at all. */
export function controlSandboxArgs(args: readonly string[], gate: LaunchGate): string[] {
  if (args.includes('--no-sandbox') && !gate.switches.includes('--no-sandbox'))
    throw new Error(
      'the test package requires --no-sandbox but the release package runs with its sandbox',
    )
  return gate.switches.includes('--no-sandbox') && !args.includes('--no-sandbox')
    ? [...args, '--no-sandbox']
    : [...args]
}

/** Whether checks 3 and 4 may launch the release app here, and with which sandbox switch. */
export function launchGate(
  platform: NodeJS.Platform,
  blocker: string | undefined,
  allowNoSandbox: boolean,
  helperReset = false,
): LaunchGate {
  if (platform !== 'linux' || blocker === undefined) return { run: true, switches: [] }
  if (allowNoSandbox)
    return {
      run: true,
      switches: ['--no-sandbox'],
      note: `Chromium's sandbox was DISABLED (--no-sandbox, by ${ALLOW_NO_SANDBOX_FLAG}): ${blocker}`,
    }
  const helper =
    "make the package's chrome-sandbox owned by root with mode 4755 and run again with --no-build, " +
    'since packaging replaces it'
  const options = blocker.includes('euid 0')
    ? ['run this as a user other than root']
    : blocker.includes('apparmor_restrict_unprivileged_userns=1')
      ? [helper, 'or set kernel.apparmor_restrict_unprivileged_userns=0']
      : [
          helper,
          'or allow unprivileged user namespaces (in Docker, a seccomp profile allowing clone and unshare)',
        ]
  const reset = helperReset
    ? " This run's packaging replaced a chrome-sandbox with which the sandbox could start before."
    : ''
  return {
    run: false,
    switches: [],
    note: `Chromium's sandbox cannot start on this host: ${blocker}.${reset} To run this check here, ${options.join('; ')}; or pass ${ALLOW_NO_SANDBOX_FLAG}`,
  }
}

export type Manifest = Readonly<{ name: string; productName: string; version: string }>
export type Findings = Readonly<{ problems: string[]; findings: string[] }>

const directoriesOf = (files: Iterable<string>): Set<string> =>
  new Set(
    [...files].flatMap(file => {
      const parts = file.split('/')
      return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'))
    }),
  )

/** The archive holds exactly the release build's files, each byte for byte what was built. */
export function checkAsarContents(
  entries: readonly AsarEntry[],
  built: ReadonlyMap<string, string>,
  digest: (path: string) => string,
): Findings {
  const problems: string[] = []
  const directories = directoriesOf(built.keys())
  for (const entry of entries) {
    const known = entry.kind === 'directory' ? directories.has(entry.path) : built.has(entry.path)
    if (!known) problems.push(`app.asar contains ${entry.path}, which the release build does not`)
    else if (entry.kind === 'link') problems.push(`app.asar holds ${entry.path} as a link`)
    if (entry.unpacked) problems.push(`app.asar keeps ${entry.path} unpacked, outside the archive`)
  }
  for (const [path, hash] of built) {
    const entry = entries.find(candidate => candidate.path === path)
    if (entry?.kind !== 'file') {
      problems.push(`app.asar does not contain ${path}`)
      continue
    }
    if (entry.unpacked) continue
    const shipped = digest(path)
    if (entry.integrity !== shipped)
      problems.push(`${path} does not match the integrity app.asar records`)
    else if (shipped !== hash) problems.push(`${path} in app.asar is not the file in dist/release`)
  }
  const findings =
    problems.length === 0
      ? [`exactly the ${built.size} files of dist/release, byte for byte, with matching integrity`]
      : []
  return { problems, findings }
}

export function checkManifest(manifest: unknown, expected: Manifest): Findings {
  if (typeof manifest !== 'object' || manifest === null)
    return { problems: ["app.asar's package.json is not an object"], findings: [] }
  const field = (name: string): unknown => Reflect.get(manifest, name)
  const problems: string[] = []
  if (field('main') !== BUNDLES[0])
    problems.push(
      `app.asar's package.json enters at ${JSON.stringify(field('main'))}, not ${BUNDLES[0]}`,
    )
  for (const name of ['name', 'productName', 'version'] as const)
    if (field(name) !== expected[name])
      problems.push(
        `app.asar's package.json has ${name} ${JSON.stringify(field(name))}, not ${JSON.stringify(expected[name])}`,
      )
  return {
    problems,
    findings: problems.length === 0 ? [`package.json enters at ${BUNDLES[0]}`] : [],
  }
}

export type LaunchOutcome = Readonly<{
  code: number | null
  signal: string | null
  timedOut: boolean
  stdout: string
}>

/** The main process's JSON log lines on `stdout`. */
export function mainLogLines(stdout: string): Record<string, unknown>[] {
  return stdout.split(/\r?\n/).flatMap(raw => {
    const line = raw.trim()
    if (!line.startsWith('{')) return []
    try {
      const record: unknown = JSON.parse(line)
      if (typeof record !== 'object' || record === null) return []
      const { msg, process } = record as Record<string, unknown>
      return msg !== undefined && process === 'main' ? [{ ...record }] : []
    } catch {
      return []
    }
  })
}

const WINDOWS_ABORT_CODES = [0x80000003, -0x7ffffffd]

export function describeExit({
  code,
  signal,
  timedOut,
}: Pick<LaunchOutcome, 'code' | 'signal' | 'timedOut'>): string {
  if (timedOut) return 'did not exit by itself and was killed at the deadline'
  if (signal === 'SIGTRAP' || signal === 'SIGABRT')
    return `was ended by ${signal} (a Chromium abort)`
  if (signal !== null) return `was ended by ${signal}`
  if (code !== null && WINDOWS_ABORT_CODES.includes(code))
    return 'exited with code 0x80000003 (a Chromium abort)'
  return `exited with code ${code}`
}

/** A refused launch: the refusal's code and one line, nothing listening or answering, nothing left. */
export function judgeRefusal(
  outcome: LaunchOutcome,
  expectedSwitch: string,
  endpoint: Readonly<{ listened: boolean; answered?: boolean }>,
  stragglers: readonly ProcessInfo[] = [],
): Readonly<{ ok: boolean; reason: string }> {
  const lines = mainLogLines(outcome.stdout)
  const refusals = lines.filter(line => line['msg'] === REMOTE_DEBUGGING_REFUSED_MESSAGE)
  const fail = (reason: string) => ({ ok: false, reason })
  if (endpoint.listened) return fail('the remote debugging port answered /json/version')
  if (endpoint.answered === true) return fail('the remote debugging pipe answered a command')
  if (outcome.timedOut || outcome.signal !== null || outcome.code !== REMOTE_DEBUGGING_EXIT_CODE)
    return fail(
      `it ${describeExit(outcome)}, not with the refusal's code ${REMOTE_DEBUGGING_EXIT_CODE}` +
        (refusals.length > 0 ? ' (although it printed the refusal)' : ''),
    )
  if (refusals.length !== 1)
    return fail(`its main process printed the refusal ${refusals.length} times`)
  if (refusals[0]!['switch'] !== expectedSwitch)
    return fail(
      `the refusal names ${JSON.stringify(refusals[0]!['switch'])}, not ${expectedSwitch}`,
    )
  const others = lines.filter(line => line !== refusals[0])
  if (others.length > 0)
    return fail(
      `its main process logged ${others.map(line => JSON.stringify(line['msg'])).join(', ')} before refusing`,
    )
  if (stragglers.length > 0)
    return fail(`it left ${stragglers.length} process(es) running (killed)`)
  return {
    ok: true,
    reason: `exited ${REMOTE_DEBUGGING_EXIT_CODE} with "${REMOTE_DEBUGGING_REFUSED_MESSAGE}" (${expectedSwitch}) and nothing else`,
  }
}

/** The result of command `id` among the NUL-separated messages of a remote debugging pipe. */
export function pipeReply(data: string, id: number): Record<string, unknown> | undefined {
  for (const message of data.split('\0'))
    try {
      const parsed: unknown = JSON.parse(message)
      if (typeof parsed !== 'object' || parsed === null) continue
      const { id: replied, result } = parsed as Record<string, unknown>
      if (replied === id && typeof result === 'object' && result !== null) return { ...result }
    } catch {}
  return undefined
}
