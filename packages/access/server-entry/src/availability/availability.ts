import { createHash } from 'node:crypto'
import type {
  AccessContribution,
  FrameSource,
  OperationHandler,
  ProtocolKey,
} from '@omne-harness/access-cordis-contract'
import type { Scope } from '@omne-harness/dynamis'
import { readJsonText, type JsonLimits, type JsonValue } from '@omne-harness/json-text'
import { tenantActedFor } from '../acting.ts'
import {
  accessProtocol,
  type AccessProtocol,
  type AvailabilityFrame,
} from '@omne-harness/public-contract'
import { contractDigest } from '@omne-harness/public-contract/snapshot'
import { PACED } from '../observation-hub/hub.ts'
import type {
  AvailabilityChange,
  AvailabilitySubscription,
  PointFact,
  RegistryForPipeline,
  ServedProtocol,
} from '../registry/registry.ts'

type Availability = AccessProtocol['observations']['availability']

const keyText = (key: ProtocolKey): string => `${key.name}/v${key.major}`
const keyValue = (key: ProtocolKey): ProtocolKey => ({ name: key.name, major: key.major })

type Served = Extract<AvailabilityFrame, { kind: 'snapshot' }>['protocols'][number]

const sha256 = (bytes: Uint8Array): Uint8Array => createHash('sha256').update(bytes).digest()
const digests = new WeakMap<object, string | undefined>()

/** The key with what the contract is at. The digest is worked out once for a contract. */
function servedValue(protocol: ServedProtocol): Served {
  const { name, major, revision, contract } = protocol
  if (!digests.has(contract)) digests.set(contract, contractDigest(contract, revision, sha256))
  const digest = digests.get(contract)
  return { name, major, revision, ...(digest !== undefined && { digest }) }
}

type Mounting = Extract<AvailabilityChange, { protocol: ServedProtocol }>

const hashed = (text: string): string => `sha256:${createHash('sha256').update(text).digest('hex')}`

const pointValue = ({ rules, ...fact }: PointFact) => ({ ...fact, digest: hashed(rules) })

function changeFrame(change: Mounting, scoped: { scoped?: number }): AvailabilityFrame {
  const { revision } = change
  const conflicts = change.conflicts.map(keyValue)
  return change.change === 'mounted'
    ? {
        kind: 'change',
        revision,
        added: [servedValue(change.protocol)],
        removed: [],
        conflicts,
        ...scoped,
      }
    : {
        kind: 'change',
        revision,
        added: [],
        removed: [keyValue(change.protocol)],
        conflicts,
        ...scoped,
      }
}

/** The revision of `access/v1` that added the points to the snapshot. */
const POINTS_SINCE = 2
const SCOPED_SINCE = 3

type Owed = {
  readonly known: Map<string, ServedProtocol>
  readonly queue: Mounting[]
  conflicts: readonly ProtocolKey[]
  declared: readonly PointFact[]
  scoped: number
  snapshotDue: boolean
  revision: number
}

function owedAt(subscription: AvailabilitySubscription): Owed {
  const { revision, conflicts, points: declared, scoped } = subscription
  const known = new Map(subscription.protocols.map(key => [keyText(key), key]))
  return { known, queue: [], conflicts, declared, scoped, snapshotDue: true, revision }
}

function fold(owed: Owed, change: AvailabilityChange): void {
  owed.revision = change.revision
  if (change.change === 'points') {
    owed.declared = change.points
    return
  }
  if (change.change === 'scoped') {
    owed.scoped = change.scoped
    return
  }
  if (change.change === 'mounted') owed.known.set(keyText(change.protocol), change.protocol)
  else owed.known.delete(keyText(change.protocol))
  owed.conflicts = change.conflicts
}

type Reads = Readonly<{ points: boolean; scoped: boolean }>

function take(owed: Owed, change: AvailabilityChange, backlog: number, reads: Reads) {
  // A subscriber a field is not written to is sent nothing for it, and keeps its queue.
  if (change.change === 'points' && !reads.points) return false
  if (change.change === 'scoped' && !reads.scoped) return false
  fold(owed, change)
  if (owed.snapshotDue) return false
  const resent = change.change === 'points' || change.change === 'scoped'
  if (change.change === 'mounted' || change.change === 'unmounted') owed.queue.push(change)
  // The points and the count go in a snapshot only: when they change, what is queued is dropped for one.
  if (resent || owed.queue.length > backlog) {
    owed.queue.length = 0
    owed.snapshotDue = true
  }
  return true
}

function nextFrame(owed: Owed, reads: Reads): AvailabilityFrame | undefined {
  const scoped = reads.scoped ? { scoped: owed.scoped } : {}
  if (!owed.snapshotDue) {
    const next = owed.queue.shift()
    return next === undefined ? undefined : changeFrame(next, scoped)
  }
  owed.snapshotDue = false
  return {
    kind: 'snapshot',
    revision: owed.revision,
    protocols: [...owed.known.values()].map(servedValue),
    conflicts: owed.conflicts.map(keyValue),
    points: owed.declared.map(pointValue),
    ...scoped,
  }
}

export function availabilitySource(
  registry: RegistryForPipeline,
  backlog: number,
): FrameSource<Availability> {
  return async ({ signal, revision: writtenAt }) => {
    const reads = { points: writtenAt >= POINTS_SINCE, scoped: writtenAt >= SCOPED_SINCE }
    let wake: (() => void) | undefined
    let owed: Owed | undefined
    const subscription = registry.subscribe(change => {
      if (owed !== undefined && take(owed, change, backlog, reads)) wake?.()
    })
    const mine = (owed = owedAt(subscription))
    // The subscription began here, before any frame is taken, so it ends on the abort itself: the
    // hub may abort an opening it never reads, and a generator that never ran has no `finally`.
    let listening = true
    const leave = (): void => {
      if (!listening) return
      listening = false
      subscription.unsubscribe()
    }
    const awake = (): void => {
      leave()
      wake?.()
    }
    signal.addEventListener('abort', awake)
    if (signal.aborted) leave()

    async function* frames(): AsyncGenerator<AvailabilityFrame, 'unavailable'> {
      try {
        for (;;) {
          if (signal.aborted) return 'unavailable'
          const frame = nextFrame(mine, reads)
          if (frame !== undefined) {
            yield frame
            continue
          }
          await new Promise<void>(resolve => {
            wake = resolve
          })
          wake = undefined
        }
      } finally {
        leave()
        signal.removeEventListener('abort', awake)
      }
    }

    return { outcome: 'succeeded', frames: Object.assign(frames(), { [PACED]: true }) }
  }
}

type Scoped = AccessProtocol['operations']['scoped']

const TREE: JsonLimits = {
  maxBytes: Number.MAX_SAFE_INTEGER,
  maxDepth: Number.MAX_SAFE_INTEGER,
  maxItems: Number.MAX_SAFE_INTEGER,
  maxMembers: Number.MAX_SAFE_INTEGER,
  maxStringLength: Number.MAX_SAFE_INTEGER,
  maxNumberLength: Number.MAX_SAFE_INTEGER,
}

function treeOf(contract: unknown): JsonValue | undefined {
  const read = readJsonText(JSON.stringify(contract), TREE)
  return read.kind === 'ok' ? read.value : undefined
}

function scopedOperation(
  registry: RegistryForPipeline,
  tenantScope: ((tenant: string) => Scope) | undefined,
): OperationHandler<Scoped> {
  return async call => {
    const tenant = tenantActedFor(call.principal)
    if (tenant === undefined || tenantScope === undefined) return { outcome: 'basis-unavailable' }
    const protocols = registry.scoped(tenantScope(tenant))
    if (protocols === undefined) return { outcome: 'basis-unavailable' }
    const told = protocols.map(({ name, major, contract }) => ({
      name,
      major,
      contract: treeOf(contract),
    }))
    if (told.some(each => each.contract === undefined)) return { outcome: 'basis-unavailable' }
    return { outcome: 'succeeded', body: { protocols: told as never } }
  }
}

export function accessContribution(
  registry: RegistryForPipeline,
  backlog: number,
  tenantScope?: (tenant: string) => Scope,
): AccessContribution<AccessProtocol> {
  return {
    protocol: accessProtocol,
    operations: { scoped: scopedOperation(registry, tenantScope) },
    observations: { availability: availabilitySource(registry, backlog) },
  }
}
