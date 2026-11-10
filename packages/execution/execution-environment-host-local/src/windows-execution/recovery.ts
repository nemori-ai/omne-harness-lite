// The cold index of Windows command Jobs and their recovery. A marker is written before the Job
// exists, so no command runs without one; it is removed once the Job's stop is confirmed and
// recorded, or once the retained-process index holds the Job.
import { join } from 'node:path'
import {
  managedResourceSchema,
  type ManagedResource,
} from '@omne-harness/execution-environment-contract'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import { createColdIndex, type ColdIndex } from '../cold-index.ts'
import { askBridge } from './bridge.ts'
import {
  commandJobName,
  readRetainedJobReference,
  readWindowsJobReference,
  stopWindowsJob,
  stopWindowsResource,
  windowsIdentity,
  type WindowsIdentity,
} from './supervision.ts'

/** What a restarted provider needs to judge a command Job: where it lived and in which boot. */
export type JobMarker = Readonly<{
  resource: ManagedResource
  scope: string
  identity: WindowsIdentity
}>

export type WindowsJobIndex = ColdIndex<JobMarker>

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
  if (typeof scope !== 'string' || typeof identity !== 'object' || identity === null)
    return undefined
  const boot: unknown = Reflect.get(identity, 'boot')
  const session: unknown = Reflect.get(identity, 'session')
  if (typeof boot !== 'string' || !/^\d+$/u.test(boot)) return undefined
  if (typeof session !== 'number' || !Number.isSafeInteger(session) || session < 0) return undefined
  // The contract's decoder answers at once; a marker it does not accept is not read.
  const checked = managedResourceSchema['~standard'].validate(resource)
  if (checked instanceof Promise || checked.issues !== undefined) return undefined
  const typed = checked.value
  if (typed.key !== key || readWindowsJobReference(typed.reference) !== commandJobName(key))
    return undefined
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
      { mode: 'members', name: commandJobName(resource.key) },
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
  const status = await stopWindowsJob(commandJobName(resource.key), boundMs)
  return status === 'unconfirmed' ? 'pending' : forget()
}

/**
 * A Windows resource of this provider: a command Job through the cold index when there is one,
 * any other Job by its name. A resource that names no Job of this provider is `unsupported`.
 */
export async function recoverWindowsResource(
  index: WindowsJobIndex | undefined,
  resource: ManagedResource,
  provider: string,
  boundMs: number,
): Promise<WindowsRecoverStatus | 'unsupported'> {
  if (resource.provider !== provider) return 'unsupported'
  const retained = readRetainedJobReference(resource.reference)
  if (retained !== undefined && retained.name === commandJobName(resource.key))
    return recoverReleasedJob(retained, boundMs)
  const job = readWindowsJobReference(resource.reference)
  if (job === undefined) return 'unsupported'
  if (index !== undefined && job === commandJobName(resource.key))
    return recoverWindowsJob(index, resource, boundMs)
  return (await stopWindowsResource(resource, boundMs)) === 'confirmed'
    ? 'confirmedStopped'
    : 'pending'
}

/**
 * A retained Job the index no longer holds. Another boot ended it. Another login session cannot
 * address it. In its own boot and session a missing name means `KILL_ON_JOB_CLOSE` stopped it.
 */
async function recoverReleasedJob(
  job: Readonly<{ session: number; name: string; boot: string }>,
  boundMs: number,
): Promise<WindowsRecoverStatus> {
  const self = await windowsIdentity(boundMs)
  if (self === undefined) return 'pending'
  if (job.boot !== self.boot) return 'confirmedStopped'
  if (job.session !== self.session) return 'pending'
  return (await stopWindowsJob(job.name, boundMs)) === 'unconfirmed'
    ? 'pending'
    : 'confirmedStopped'
}
