// What the shared retained-process index reads on Windows: the boot identity, the members of a
// retained Job by its name, and the forced stop of that Job. Every reading comes from a one-shot
// bridge, outside the Job.
import type { RetainedSupervision } from '../host-retained-processes.ts'
import type { MembersReading, ScopeShow, StopReading, StopStatus } from '../host-scope.ts'
import { askBridge } from './bridge.ts'

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
