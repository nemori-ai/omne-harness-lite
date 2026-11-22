import { createHash } from 'node:crypto'
import type {
  AccessContribution,
  FrameSource,
  ProtocolKey,
} from '@omne-harness/access-cordis-contract'
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

function changeFrame(change: Mounting): AvailabilityFrame {
  const { revision } = change
  const conflicts = change.conflicts.map(keyValue)
  return change.change === 'mounted'
    ? { kind: 'change', revision, added: [servedValue(change.protocol)], removed: [], conflicts }
    : { kind: 'change', revision, added: [], removed: [keyValue(change.protocol)], conflicts }
}

/** The revision of `access/v1` that added the points to the snapshot. */
const POINTS_SINCE = 2

type Owed = {
  readonly known: Map<string, ServedProtocol>
  readonly queue: Mounting[]
  conflicts: readonly ProtocolKey[]
  declared: readonly PointFact[]
  snapshotDue: boolean
  revision: number
}

function owedAt(subscription: AvailabilitySubscription): Owed {
  const { revision, conflicts, points: declared } = subscription
  const known = new Map(subscription.protocols.map(key => [keyText(key), key]))
  return { known, queue: [], conflicts, declared, snapshotDue: true, revision }
}

function fold(owed: Owed, change: AvailabilityChange): void {
  owed.revision = change.revision
  if (change.change === 'points') {
    owed.declared = change.points
    return
  }
  if (change.change === 'mounted') owed.known.set(keyText(change.protocol), change.protocol)
  else owed.known.delete(keyText(change.protocol))
  owed.conflicts = change.conflicts
}

function take(owed: Owed, change: AvailabilityChange, backlog: number, readsPoints: boolean) {
  // A subscriber the points are not written to is sent nothing for them, and keeps its queue.
  if (change.change === 'points' && !readsPoints) return false
  fold(owed, change)
  if (owed.snapshotDue) return false
  if (change.change !== 'points') owed.queue.push(change)
  // The points go in a snapshot only: when they change, what is queued is dropped for one.
  if (change.change === 'points' || owed.queue.length > backlog) {
    owed.queue.length = 0
    owed.snapshotDue = true
  }
  return true
}

function nextFrame(owed: Owed): AvailabilityFrame | undefined {
  if (!owed.snapshotDue) {
    const next = owed.queue.shift()
    return next === undefined ? undefined : changeFrame(next)
  }
  owed.snapshotDue = false
  return {
    kind: 'snapshot',
    revision: owed.revision,
    protocols: [...owed.known.values()].map(servedValue),
    conflicts: owed.conflicts.map(keyValue),
    points: owed.declared.map(pointValue),
  }
}

export function availabilitySource(
  registry: RegistryForPipeline,
  backlog: number,
): FrameSource<Availability> {
  return async ({ signal, revision: writtenAt }) => {
    const readsPoints = writtenAt >= POINTS_SINCE
    let wake: (() => void) | undefined
    let owed: Owed | undefined
    const subscription = registry.subscribe(change => {
      if (owed !== undefined && take(owed, change, backlog, readsPoints)) wake?.()
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
          const frame = nextFrame(mine)
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

export function accessContribution(
  registry: RegistryForPipeline,
  backlog: number,
): AccessContribution<AccessProtocol> {
  return {
    protocol: accessProtocol,
    operations: {},
    observations: { availability: availabilitySource(registry, backlog) },
  }
}
