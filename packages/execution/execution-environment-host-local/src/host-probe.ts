import { randomUUID } from 'node:crypto'
import { access, constants, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  forceStopScope,
  launchScope,
  readBootId,
  runTool,
  type ScopeTools,
  type StopStatus,
  type Supervisor,
} from './host-scope.ts'
import { noUnifiedHierarchyExit } from './scope-cgroup.ts'

const monotonicMs = () =>
  /* wall-clock: operation-timing -- Age an unsatisfied probe answer for its retry. */ performance.now()

export type HostCommandPrerequisite =
  | 'linux'
  | 'systemd-tools'
  | 'user-manager'
  | 'cgroup-v2'
  | 'scope-round-trip'

export type PrerequisiteReading =
  | Readonly<{ kind: 'satisfied'; tools: ScopeTools }>
  | Readonly<{ kind: 'unsatisfied'; missing: readonly HostCommandPrerequisite[] }>
  | Readonly<{ kind: 'unknown' }>

async function resolveTool(name: string): Promise<string | undefined> {
  for (const directory of (process.env['PATH'] ?? '').split(':')) {
    if (!directory.startsWith('/')) continue
    const candidate = join(directory, name)
    try {
      await access(candidate, constants.X_OK)
      if ((await stat(candidate)).isFile()) return candidate
    } catch {}
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

const scopeProbeScript = fileURLToPath(
  new URL(
    import.meta.url.endsWith('.ts') ? './scope-probe.ts' : './scope-probe.js',
    import.meta.url,
  ),
)

type ScopeProbeItem = 'cgroup-v2' | 'scope-round-trip'

export function scopeProbeMissing(
  code: number | null | 'late',
  stop: StopStatus,
): readonly ScopeProbeItem[] {
  const missing: ScopeProbeItem[] = []
  if (code === noUnifiedHierarchyExit) missing.push('cgroup-v2')
  if ((code !== 0 && code !== noUnifiedHierarchyExit) || stop !== 'confirmed')
    missing.push('scope-round-trip')
  return missing
}

async function probeScope(tools: ScopeTools, boundMs: number): Promise<readonly ScopeProbeItem[]> {
  const bootId = await readBootId()
  if (bootId === undefined) return ['scope-round-trip']
  const unit = `omne-host-probe-${randomUUID()}.scope`
  const launcher = launchScope({
    tools,
    unit,
    description: 'omne-host probe',
    command: process.execPath,
    args: [scopeProbeScript, unit],
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
  return scopeProbeMissing(code, stop.status)
}

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

export async function probeCommandPrerequisites(boundMs: number): Promise<PrerequisiteReading> {
  if (process.platform !== 'linux') return { kind: 'unsatisfied', missing: ['linux'] }
  const tools = await resolveScopeTools(boundMs)
  if (typeof tools === 'string') return { kind: 'unsatisfied', missing: [tools] }
  const missing = await probeScope(tools, boundMs)
  return missing.length === 0 ? { kind: 'satisfied', tools } : { kind: 'unsatisfied', missing }
}

type ProbeAnswer = Readonly<{ kind: 'satisfied' | 'unsatisfied' | 'unknown' }>

export type PrerequisiteProbe<R extends ProbeAnswer = PrerequisiteReading> = Readonly<{
  facts(): 'satisfied' | 'unsatisfied' | 'unknown'
  ready(): Promise<R>
}>

export function createPrerequisiteProbe(input: {
  retryMs: number
  boundMs: number
}): PrerequisiteProbe
export function createPrerequisiteProbe<R extends ProbeAnswer>(input: {
  retryMs: number
  boundMs: number
  probe: (boundMs: number) => Promise<R>
}): PrerequisiteProbe<R>
export function createPrerequisiteProbe(input: {
  retryMs: number
  boundMs: number
  probe?: (boundMs: number) => Promise<ProbeAnswer>
}): PrerequisiteProbe<ProbeAnswer> {
  const platformProbe = input.probe ?? probeCommandPrerequisites
  let reading: ProbeAnswer | undefined
  let probedAt = 0
  const probe = (): Promise<ProbeAnswer> => {
    probedAt = monotonicMs()
    return platformProbe(input.boundMs)
      .catch((): ProbeAnswer => ({ kind: 'unknown' }))
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

export type HostTerminalPrerequisite = 'linux' | 'bash' | 'mkfifo' | 'node-pty'

export async function probeTerminalPrerequisites(): Promise<readonly HostTerminalPrerequisite[]> {
  if (process.platform !== 'linux') return ['linux']
  const missing: HostTerminalPrerequisite[] = []
  for (const [path, name] of [
    ['/bin/bash', 'bash'],
    ['/usr/bin/mkfifo', 'mkfifo'],
  ] as const) {
    try {
      await access(path, constants.X_OK)
    } catch {
      missing.push(name)
    }
  }
  try {
    const require = createRequire(import.meta.url)
    const pty: unknown = require('node-pty')
    const native: unknown =
      typeof pty === 'object' && pty !== null ? Reflect.get(pty, 'native') : undefined
    if (
      typeof native !== 'object' ||
      native === null ||
      typeof Reflect.get(native, 'fork') !== 'function'
    )
      missing.push('node-pty')
  } catch {
    missing.push('node-pty')
  }
  return missing
}
