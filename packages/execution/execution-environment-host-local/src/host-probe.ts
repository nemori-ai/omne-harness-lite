import { randomUUID } from 'node:crypto'
import { access, constants, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  forceStopScope,
  launchScope,
  readBootId,
  runTool,
  type ScopeTools,
  type Supervisor,
} from './host-scope.ts'

/** Milliseconds on the monotonic clock, for the age of a probe answer. */
const monotonicMs = () =>
  /* wall-clock: operation-timing -- Age an unsatisfied probe answer for its retry. */ performance.now()

/**
 * The platform prerequisites of the host `command` facility: P1 Linux, P3 `systemd-run` and
 * `systemctl` on PATH, P4 a running user manager, P5 cgroup v2, P6 a probe scope that starts and
 * whose forced stop the supervisor confirms.
 */
export type HostCommandPrerequisite =
  | 'linux'
  | 'systemd-tools'
  | 'user-manager'
  | 'cgroup-v2'
  | 'scope-round-trip'

export type PrerequisiteReading =
  | Readonly<{ kind: 'satisfied'; tools: ScopeTools }>
  | Readonly<{ kind: 'unsatisfied'; missing: readonly HostCommandPrerequisite[] }>
  /** The probe itself failed: nothing is known about the prerequisites. */
  | Readonly<{ kind: 'unknown' }>

/** Resolves an executable on the current PATH of this process to an absolute path. */
async function resolveTool(name: string): Promise<string | undefined> {
  for (const directory of (process.env['PATH'] ?? '').split(':')) {
    if (!directory.startsWith('/')) continue
    const candidate = join(directory, name)
    try {
      await access(candidate, constants.X_OK)
      if ((await stat(candidate)).isFile()) return candidate
    } catch {
      /* Not here: try the next directory. */
    }
  }
  return undefined
}

/** The kill option this systemctl understands: `--kill-whom` since systemd 252, `--kill-who` before. */
async function killOption(
  systemctl: string,
  boundMs: number,
): Promise<Supervisor['killWhom'] | undefined> {
  const help = await runTool(systemctl, ['--help'], boundMs)
  if (help.kind !== 'exited') return undefined
  return help.stdout.includes('--kill-whom') ? '--kill-whom' : '--kill-who'
}

/**
 * The supervisor resolved now from PATH, for recovery when the probe is not satisfied: a scope of
 * another process may still be there.
 */
export async function resolveSupervisor(boundMs: number): Promise<Supervisor | undefined> {
  const systemctl = await resolveTool('systemctl')
  const killWhom = systemctl === undefined ? undefined : await killOption(systemctl, boundMs)
  return systemctl === undefined || killWhom === undefined ? undefined : { systemctl, killWhom }
}

async function userManagerRuns(systemctl: string, boundMs: number): Promise<boolean> {
  const run = await runTool(systemctl, ['--user', 'is-system-running'], boundMs)
  if (run.kind !== 'exited') return false
  const state = run.stdout.trim()
  return state === 'running' || state === 'degraded'
}

async function cgroupV2(): Promise<boolean> {
  try {
    await access('/sys/fs/cgroup/cgroup.controllers', constants.R_OK)
    return true
  } catch {
    return false
  }
}

/** P6: a probe scope runs an empty Node program, exits 0, and its forced stop is confirmed. */
async function scopeRoundTrip(tools: ScopeTools, boundMs: number): Promise<boolean> {
  const bootId = await readBootId()
  if (bootId === undefined) return false
  const unit = `omne-host-probe-${randomUUID()}.scope`
  const launcher = launchScope({
    tools,
    unit,
    description: 'omne-host probe',
    command: process.execPath,
    args: ['-e', ''],
  })
  launcher.stdout?.resume()
  launcher.stderr?.resume()
  const exited = new Promise<number | null>(resolve => {
    launcher.once('error', () => resolve(null))
    launcher.once('exit', code => resolve(code))
  })
  const code = await Promise.race([
    exited,
    new Promise<'late'>(resolve => setTimeout(resolve, boundMs, 'late')),
  ])
  const stop = await forceStopScope({
    tools,
    coordinate: { unit, bootId },
    boundMs,
    launcherExited: exited.then(() => undefined),
  })
  return code === 0 && stop.status === 'confirmed'
}

/** P3 and P4: the tools by absolute path and a running user manager, or the item that is missing. */
async function resolveScopeTools(
  boundMs: number,
): Promise<ScopeTools | 'systemd-tools' | 'user-manager'> {
  const systemdRun = await resolveTool('systemd-run')
  const systemctl = await resolveTool('systemctl')
  const killWhom = systemctl === undefined ? undefined : await killOption(systemctl, boundMs)
  if (systemdRun === undefined || systemctl === undefined || killWhom === undefined)
    return 'systemd-tools'
  if (!(await userManagerRuns(systemctl, boundMs))) return 'user-manager'
  return { systemdRun, systemctl, killWhom }
}

/** Probes P1 and P3 to P6 once against the real host, in order; a later item needs the earlier ones. */
export async function probeCommandPrerequisites(boundMs: number): Promise<PrerequisiteReading> {
  if (process.platform !== 'linux') return { kind: 'unsatisfied', missing: ['linux'] }
  const tools = await resolveScopeTools(boundMs)
  const missing: HostCommandPrerequisite[] = typeof tools === 'string' ? [tools] : []
  if (!(await cgroupV2())) missing.push('cgroup-v2')
  if (typeof tools === 'string' || missing.length > 0) return { kind: 'unsatisfied', missing }
  if (!(await scopeRoundTrip(tools, boundMs)))
    return { kind: 'unsatisfied', missing: ['scope-round-trip'] }
  return { kind: 'satisfied', tools }
}

/** The probe of one provider generation: started at creation, a satisfied answer kept for the generation. */
export type PrerequisiteProbe = Readonly<{
  /** `unknown` while the probe runs or when it failed. */
  facts(): 'satisfied' | 'unsatisfied' | 'unknown'
  /** Waits for the running probe; probes again when the last answer is not satisfied and older than the retry interval. */
  ready(): Promise<PrerequisiteReading>
}>

export function createPrerequisiteProbe(input: {
  retryMs: number
  boundMs: number
}): PrerequisiteProbe {
  let reading: PrerequisiteReading | undefined
  let probedAt = 0
  const probe = (): Promise<PrerequisiteReading> => {
    probedAt = monotonicMs()
    return probeCommandPrerequisites(input.boundMs)
      .catch((): PrerequisiteReading => ({ kind: 'unknown' }))
      .then(answer => {
        reading = answer
        return answer
      })
  }
  let running = probe()
  return Object.freeze({
    facts: () => (reading === undefined || reading.kind === 'unknown' ? 'unknown' : reading.kind),
    ready() {
      if (
        reading !== undefined &&
        reading.kind !== 'satisfied' &&
        monotonicMs() - probedAt >= input.retryMs
      ) {
        reading = undefined
        running = probe()
      }
      return running
    },
  })
}
