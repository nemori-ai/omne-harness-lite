// The cold index of Windows command Jobs and their recovery. A marker is written before the Job
// exists, so no command runs without one; it is removed once the Job's stop is confirmed and
// recorded, or once the retained-process index holds the Job.
import { join } from 'node:path'
import type { ManagedResource } from '@omne-harness/execution-environment-contract'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import { createColdIndex, type ColdIndex } from '../cold-index.ts'
import { askBridge } from './bridge.ts'
import { stopWindowsJob, windowsIdentity, type WindowsIdentity } from './supervision.ts'

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

/** What a restarted provider needs to judge a command Job: where it lived and in which boot. */
export type JobMarker = Readonly<{
  resource: ManagedResource
  scope: string
  identity: WindowsIdentity
}>

export type WindowsJobIndex = ColdIndex<JobMarker>

const commandJob = (key: string) => `Local\\omne-command-${key}`

function parseMarker(content: string, key: string): JobMarker | undefined {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  const resource: unknown = Reflect.get(value, 'resource')
  const scope: unknown = Reflect.get(value, 'scope')
  const identity: unknown = Reflect.get(value, 'identity')
  if (typeof resource !== 'object' || resource === null || typeof scope !== 'string')
    return undefined
  if (typeof identity !== 'object' || identity === null) return undefined
  const boot: unknown = Reflect.get(identity, 'boot')
  const session: unknown = Reflect.get(identity, 'session')
  if (typeof boot !== 'string' || !/^\d+$/u.test(boot)) return undefined
  if (typeof session !== 'number' || !Number.isSafeInteger(session) || session < 0) return undefined
  if (Reflect.get(resource, 'key') !== key || typeof Reflect.get(resource, 'provider') !== 'string')
    return undefined
  const reference: unknown = Reflect.get(resource, 'reference')
  if (typeof reference !== 'object' || reference === null) return undefined
  const typed = resource as ManagedResource
  if (readWindowsJobReference(typed.reference) !== commandJob(key)) return undefined
  return { resource: typed, scope, identity: { boot, session } }
}

export function createWindowsJobIndex(stateDirectory: string): WindowsJobIndex {
  return createColdIndex({ directory: join(stateDirectory, 'windows-jobs'), parse: parseMarker })
}

/** The command Jobs of a scope; `unavailable` without an index or with an unread marker. */
export async function listWindowsJobs(
  index: WindowsJobIndex | undefined,
  scope: ScopeRef,
): Promise<readonly ManagedResource[] | 'unavailable'> {
  if (index === undefined) return 'unavailable'
  const markers = await index.all()
  if (markers === 'unavailable') return 'unavailable'
  return markers.filter(marker => marker.scope === scope.ref).map(marker => marker.resource)
}

export type WindowsRecoverStatus = 'confirmedStopped' | 'pending'

/**
 * The SPEC's decision for a command Job of this provider with an index. Another boot ended it.
 * Another login session cannot address it, so nothing is known. In its own boot and session a
 * missing name means its last handle closed and `KILL_ON_JOB_CLOSE` stopped every member.
 */
export async function recoverWindowsJob(
  index: WindowsJobIndex,
  resource: ManagedResource,
  boundMs: number,
): Promise<WindowsRecoverStatus> {
  const marker = await index.read(resource.key)
  // Without a marker the Job never existed, its stop was confirmed, or the retained-process index
  // holds it. A name that still exists here is a live Job, so the answer is not a stop.
  if (marker === 'absent') {
    const reading = await askBridge(
      { mode: 'members', name: commandJob(resource.key) },
      frame => (frame.t === 'members' ? frame.reading : undefined),
      boundMs,
    )
    return reading === 'gone' ? 'confirmedStopped' : 'pending'
  }
  if (marker === 'unreadable') return 'pending'
  const self = await windowsIdentity(boundMs)
  if (self === undefined) return 'pending'
  const forget = async () =>
    (await index.forget(resource.key)) ? ('confirmedStopped' as const) : ('pending' as const)
  if (marker.identity.boot !== self.boot) return forget()
  if (marker.identity.session !== self.session) return 'pending'
  const status = await stopWindowsJob(commandJob(resource.key), boundMs)
  return status === 'unconfirmed' ? 'pending' : forget()
}
