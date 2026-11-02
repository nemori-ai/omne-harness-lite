import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type { ManagedResource, RecoveryListing } from '@omne-harness/execution-environment-contract'

/** The supervisor of the scopes: `systemctl` by absolute path, and the kill option it knows. */
export type Supervisor = Readonly<{
  systemctl: string
  killWhom: '--kill-whom' | '--kill-who'
}>

/** The tools the probe resolved: the supervisor, and `systemd-run` by absolute path. */
export type ScopeTools = Supervisor & Readonly<{ systemdRun: string }>

/** The durable coordinate of one execution domain: its scope unit and the boot it ran in. */
export type ScopeCoordinate = Readonly<{ unit: string; bootId: string }>

/** What `systemctl --user show` reported for a unit. */
export type ScopeShow = Readonly<{ loadState: string; activeState: string }>

export type StopStatus = 'confirmed' | 'unconfirmed'

/** The answer of one stop sequence, with the last supervisor reading when there was one. */
export type StopReading = Readonly<{ status: StopStatus; show?: ScopeShow }>

const uuidText = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const unitPattern = new RegExp(`^omne-host-(${uuidText})\\.scope$`, 'u')
const descriptionPrefix = 'omne-host'
/** Pause between two supervisor readings while a stopped unit is still winding down. */
const showPollMs = 50

/** Milliseconds on the monotonic clock, for the bound of one stop sequence. */
const monotonicMs = () =>
  /* wall-clock: operation-timing -- Bound a stop sequence and its supervisor polling. */ performance.now()

/** A new resource key and the scope unit named after it. */
export function newScopeUnit(): Readonly<{ key: string; unit: string }> {
  const key = randomUUID()
  return { key, unit: `omne-host-${key}.scope` }
}

/** The unit description that records the requester scope and the resource key, for the listing. */
export function scopeDescription(scope: ScopeRef, key: string): string {
  return `${descriptionPrefix} ${scopeDigest(scope)} ${key}`
}

function scopeDigest(scope: ScopeRef): string {
  return createHash('sha256').update(scope.ref).digest('hex').slice(0, 32)
}

export function scopeReference(coordinate: ScopeCoordinate): ManagedResource['reference'] {
  return {
    kind: 'object',
    entries: [
      { key: 'unit', value: { kind: 'string', value: coordinate.unit } },
      { key: 'bootId', value: { kind: 'string', value: coordinate.bootId } },
    ],
  }
}

/**
 * Reads a reference this provider wrote. Any other shape, and any unit name that is not an
 * `omne-host-<uuid>.scope` of this provider, is not a reference to a scope it may stop.
 */
export function readScopeReference(
  reference: ManagedResource['reference'],
): ScopeCoordinate | undefined {
  if (reference.kind !== 'object' || reference.entries.length !== 2) return undefined
  const [unit, bootId] = reference.entries
  if (unit?.key !== 'unit' || unit.value.kind !== 'string') return undefined
  if (bootId?.key !== 'bootId' || bootId.value.kind !== 'string') return undefined
  if (!unitPattern.test(unit.value.value) || bootId.value.value === '') return undefined
  return { unit: unit.value.value, bootId: bootId.value.value }
}

/** The boot identity of this host, or undefined where the kernel does not give one. */
export async function readBootId(): Promise<string | undefined> {
  try {
    const text = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim()
    return text === '' ? undefined : text
  } catch {
    return undefined
  }
}

export type ToolRun =
  | Readonly<{ kind: 'exited'; code: number; stdout: string }>
  | Readonly<{ kind: 'failed' }>

/** Runs a supervisor tool with the current environment of this process, within `timeoutMs`. */
export function runTool(
  file: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<ToolRun> {
  // A deadline on the monotonic clock leaves a fraction; `execFile` takes whole milliseconds only.
  const timeout = Math.max(1, Math.ceil(timeoutMs))
  return new Promise(resolve => {
    try {
      execFile(
        file,
        args,
        { timeout, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
        (error, stdout) => {
          if (error === null) return resolve({ kind: 'exited', code: 0, stdout })
          const code: unknown = Reflect.get(error, 'code')
          resolve(typeof code === 'number' ? { kind: 'exited', code, stdout } : { kind: 'failed' })
        },
      )
    } catch {
      // A tool that cannot even be started is a failed run, never a thrown stop sequence.
      resolve({ kind: 'failed' })
    }
  })
}

export function parseShow(text: string): ScopeShow | undefined {
  const values = new Map<string, string>()
  for (const line of text.split('\n')) {
    const at = line.indexOf('=')
    if (at > 0) values.set(line.slice(0, at), line.slice(at + 1).trim())
  }
  const loadState = values.get('LoadState')
  const activeState = values.get('ActiveState')
  return loadState === undefined || activeState === undefined
    ? undefined
    : { loadState, activeState }
}

/**
 * A stop is confirmed only by the supervisor: the unit is inactive, or systemd no longer knows it.
 * `failed`, `deactivating` and every other state, or no reading, leave it unconfirmed.
 */
export function confirmationOf(show: ScopeShow | undefined): StopStatus {
  if (show === undefined) return 'unconfirmed'
  return show.activeState === 'inactive' || show.loadState === 'not-found'
    ? 'confirmed'
    : 'unconfirmed'
}

/** Starts `command` in a new transient user scope named `unit`; the child is the command itself. */
export function launchScope(input: {
  tools: ScopeTools
  unit: string
  description: string
  command: string
  args: readonly string[]
}): ChildProcess {
  return spawn(
    input.tools.systemdRun,
    [
      '--user',
      '--scope',
      '--quiet',
      '--collect',
      `--unit=${input.unit}`,
      `--description=${input.description}`,
      '-p',
      'KillMode=control-group',
      '--',
      input.command,
      ...input.args,
    ],
    { stdio: ['ignore', 'pipe', 'pipe', 'pipe'] },
  )
}

async function readShow(tools: Supervisor, unit: string, timeoutMs: number) {
  const run = await runTool(
    tools.systemctl,
    ['--user', 'show', '-p', 'LoadState', '-p', 'ActiveState', unit],
    timeoutMs,
  )
  return run.kind === 'exited' && run.code === 0 ? parseShow(run.stdout) : undefined
}

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * The forced stop of one execution domain: kill every process of the scope, stop the unit (exit
 * code 5, unit not loaded, counts as already gone), wait for the launcher when there is one, then
 * read the unit from the supervisor until it is inactive or unknown. Past `boundMs`, or when a
 * command fails, the stop stays unconfirmed. The caller decides a changed boot identity first: in
 * this process the boot of a running process's coordinate is always the current one.
 */
export async function forceStopScope(input: {
  tools: Supervisor
  coordinate: ScopeCoordinate
  boundMs: number
  /** Resolves when the launcher of this scope has exited; it may still create the unit before. */
  launcherExited?: Promise<void>
}): Promise<StopReading> {
  const { tools, coordinate } = input
  const deadline = monotonicMs() + input.boundMs
  const left = () => deadline - monotonicMs()
  await runTool(
    tools.systemctl,
    ['--user', 'kill', `${tools.killWhom}=all`, '--signal=SIGKILL', coordinate.unit],
    left(),
  )
  const stopped = await runTool(tools.systemctl, ['--user', 'stop', coordinate.unit], left())
  if (stopped.kind !== 'exited' || (stopped.code !== 0 && stopped.code !== 5))
    return { status: 'unconfirmed' }
  if (input.launcherExited !== undefined) {
    const exited = await Promise.race([
      input.launcherExited.then(() => true),
      delay(Math.max(0, left())).then(() => false),
    ])
    if (!exited) return { status: 'unconfirmed' }
  }
  let show: ScopeShow | undefined
  for (;;) {
    show = await readShow(tools, coordinate.unit, Math.max(1, left()))
    if (show !== undefined && confirmationOf(show) === 'confirmed')
      return { status: 'confirmed', show }
    if (left() <= showPollMs) break
    await delay(showPollMs)
  }
  return show === undefined ? { status: 'unconfirmed' } : { status: 'unconfirmed', show }
}

function isListedUnit(value: unknown): value is { unit: string; description: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'unit') === 'string' &&
    typeof Reflect.get(value, 'description') === 'string'
  )
}

/**
 * Lists the scopes of `scope` that this provider started and systemd still knows, from the unit
 * descriptions. A failed listing is `unavailable`, never an empty list. A unit of an earlier boot
 * is gone with that boot, so it is not listed.
 */
export async function listScopes(input: {
  systemctl: string
  scope: ScopeRef
  provider: string
  boundMs: number
}): Promise<RecoveryListing> {
  const bootId = await readBootId()
  if (bootId === undefined) return { kind: 'unavailable' }
  const run = await runTool(
    input.systemctl,
    [
      '--user',
      'list-units',
      '--all',
      '--type=scope',
      '--plain',
      '--no-legend',
      '--output=json',
      'omne-host-*.scope',
    ],
    input.boundMs,
  )
  if (run.kind !== 'exited' || run.code !== 0) return { kind: 'unavailable' }
  let parsed: unknown
  try {
    parsed = JSON.parse(run.stdout)
  } catch {
    return { kind: 'unavailable' }
  }
  if (!Array.isArray(parsed)) return { kind: 'unavailable' }
  const digest = scopeDigest(input.scope)
  const resources: ManagedResource[] = []
  for (const entry of parsed) {
    if (!isListedUnit(entry)) continue
    const key = unitPattern.exec(entry.unit)?.[1]
    if (key === undefined || entry.description !== `${descriptionPrefix} ${digest} ${key}`) continue
    resources.push({
      key,
      provider: input.provider,
      reference: scopeReference({ unit: entry.unit, bootId }),
    })
  }
  return { kind: 'listed', resources }
}
