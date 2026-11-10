// What the shared retained-process index reads on Windows: the boot identity, the members of a
// retained Job by its name, and the forced stop of that Job. Every reading comes from a one-shot
// bridge, outside the Job.
import type { ManagedResource } from '@omne-harness/execution-environment-contract'
import type { RetainedSupervision } from '../host-retained-processes.ts'
import type { MembersReading, ScopeShow, StopReading, StopStatus } from '../host-scope.ts'
import { askBridge } from './bridge.ts'

/** The Job names this provider creates. Names under `Local\` exist per login session. */
export const commandJobName = (key: string) => `Local\\omne-command-${key}`
export const terminalJobName = (key: string) => `Local\\omne-terminal-${key}`

/** The Job name in a Windows resource reference; undefined for any other reference. */
export function readWindowsJobReference(
  reference: ManagedResource['reference'],
): string | undefined {
  if (reference.kind !== 'object') return undefined
  const name = reference.entries.find(entry => entry.key === 'windowsJob')?.value
  return name?.kind === 'string' &&
    /^Local\\omne-(?:command|terminal)-[a-f0-9-]{36}$/u.test(name.value)
    ? name.value
    : undefined
}

/** The resource with the boot and login session of the process that creates its Job. */
export function withWindowsIdentity(
  resource: ManagedResource,
  identity: WindowsIdentity,
): ManagedResource {
  if (resource.reference.kind !== 'object') return resource
  const reference: ManagedResource['reference'] = {
    kind: 'object',
    entries: [
      ...resource.reference.entries,
      { key: 'boot', value: { kind: 'string', value: identity.boot } },
      { key: 'session', value: { kind: 'string', value: String(identity.session) } },
    ],
  }
  return Object.freeze({ ...resource, reference })
}

/** The boot and login session a Job reference carries; undefined when it carries none. */
function readReferenceIdentity(
  reference: ManagedResource['reference'],
): WindowsIdentity | undefined {
  if (reference.kind !== 'object') return undefined
  const text = (key: string) => {
    const found = reference.entries.find(entry => entry.key === key)?.value
    return found?.kind === 'string' ? found.value : undefined
  }
  const boot = text('boot')
  const session = Number(text('session'))
  return boot === undefined || !Number.isSafeInteger(session) ? undefined : { boot, session }
}

/**
 * The forced stop of the Job a resource names, by its name. Another boot ended the Job. Another
 * login session cannot address it. A missing name confirms the stop only in the boot and session
 * the reference carries; without them it proves nothing.
 */
export async function stopWindowsResource(
  resource: ManagedResource,
  boundMs: number,
): Promise<StopStatus> {
  const name = readWindowsJobReference(resource.reference)
  if (
    process.platform !== 'win32' ||
    name === undefined ||
    (name !== commandJobName(resource.key) && name !== terminalJobName(resource.key))
  )
    return 'unconfirmed'
  const created = readReferenceIdentity(resource.reference)
  if (created !== undefined) {
    const self = await windowsIdentity(boundMs)
    if (self === undefined || created.session !== self.session) return 'unconfirmed'
    if (created.boot !== self.boot) return 'confirmed'
  }
  const status = await stopWindowsJob(name, boundMs)
  return status === 'confirmed' || (status === 'absent' && created !== undefined)
    ? 'confirmed'
    : 'unconfirmed'
}

export type WindowsIdentity = Readonly<{ boot: string; session: number }>

let identity: Promise<WindowsIdentity | undefined> | undefined

/** The boot time and the login session of this process. A failed reading is not kept. */
export function windowsIdentity(boundMs: number): Promise<WindowsIdentity | undefined> {
  const reading = (identity ??= askBridge(
    { mode: 'identity' },
    frame => (frame.t === 'identity' ? { boot: frame.boot, session: frame.session } : undefined),
    boundMs,
  ))
  void reading.then(value => {
    if (value === undefined && identity === reading) identity = undefined
  })
  return reading
}

/** The forced stop of a named Job; `absent` when no Job has that name in this login session. */
export async function stopWindowsJob(
  name: string,
  boundMs: number,
): Promise<StopStatus | 'absent'> {
  const answer = await askBridge(
    // The bridge reads whole milliseconds.
    { mode: 'recover', name, stopBoundMs: Math.ceil(boundMs) },
    frame => (frame.t === 'stopped' ? (frame.absent ? 'absent' : frame.status) : undefined),
    boundMs,
  )
  return answer ?? 'unconfirmed'
}

/**
 * A retained Job's unit in the index: the login session it was created in and its name. Names
 * under `Local\` exist per login session, so the session is part of the coordinate.
 */
export const retainedJobUnit = (session: number, name: string): string => `${session}:${name}`

function parseUnit(unit: string): Readonly<{ session: number; name: string }> | undefined {
  const parts = /^(\d+):(Local\\omne-command-[0-9a-f-]{36})$/u.exec(unit)
  const session = Number(parts?.[1])
  return parts?.[2] === undefined || !Number.isSafeInteger(session)
    ? undefined
    : { session, name: parts[2] }
}

/** The unit and boot of a retained Job's reference, as the index lists it. */
export function readRetainedJobReference(
  reference: ManagedResource['reference'],
): Readonly<{ session: number; name: string; boot: string }> | undefined {
  if (reference.kind !== 'object' || reference.entries.length !== 2) return undefined
  const [unit, boot] = reference.entries
  if (unit?.key !== 'unit' || unit.value.kind !== 'string') return undefined
  if (boot?.key !== 'bootId' || boot.value.kind !== 'string') return undefined
  const job = parseUnit(unit.value.value)
  return job === undefined ? undefined : { ...job, boot: boot.value.value }
}

/** The answer for a Job this process cannot address: its members are unknown, not none. */
const unaddressable: ScopeShow = { loadState: 'other-session', activeState: 'unknown' }
const gone: ScopeShow = { loadState: 'not-found', activeState: 'inactive' }

export function windowsRetainedSupervision(boundMs: number): RetainedSupervision {
  /** The Job of `unit` when this process's login session can address it. */
  const addressable = async (unit: string) => {
    const job = parseUnit(unit)
    const self = await windowsIdentity(boundMs)
    return job !== undefined && self !== undefined && job.session === self.session
      ? job.name
      : undefined
  }
  return Object.freeze({
    bootId: async () => (await windowsIdentity(boundMs))?.boot,
    async members({ unit }: { unit: string }): Promise<MembersReading> {
      const name = await addressable(unit)
      if (name === undefined) return { kind: 'unreadable', show: unaddressable }
      const reading = await askBridge(
        { mode: 'members', name },
        frame => (frame.t === 'members' ? frame.reading : undefined),
        boundMs,
      )
      if (reading === undefined) return { kind: 'unreadable' }
      if (reading === 'gone') return { kind: 'gone', show: gone }
      return { kind: 'members', pids: reading, directory: '' }
    },
    async stop({ unit }: { unit: string }): Promise<StopReading> {
      const name = await addressable(unit)
      if (name === undefined) return { status: 'unconfirmed', show: unaddressable }
      const status = await stopWindowsJob(name, boundMs)
      // In the Job's own boot and session a missing name means its last handle closed, and
      // `KILL_ON_JOB_CLOSE` stopped every member.
      return status === 'absent' ? { status: 'confirmed', show: gone } : { status }
    },
  })
}
