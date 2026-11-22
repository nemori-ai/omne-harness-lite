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

function changeFrame(change: AvailabilityChange): AvailabilityFrame {
  const { revision } = change
  const conflicts = change.conflicts.map(keyValue)
  return change.change === 'mounted'
    ? { kind: 'change', revision, added: [servedValue(change.protocol)], removed: [], conflicts }
    : { kind: 'change', revision, added: [], removed: [keyValue(change.protocol)], conflicts }
}

export function availabilitySource(
  registry: RegistryForPipeline,
  backlog: number,
): FrameSource<Availability> {
  return async ({ signal }) => {
    const known = new Map<string, ServedProtocol>()
    let conflicts: readonly ProtocolKey[] = []
    const queue: AvailabilityChange[] = []
    let snapshotDue = true
    let revision = 0
    let wake: (() => void) | undefined
    const subscription = registry.subscribe(change => {
      if (change.change === 'mounted') known.set(keyText(change.protocol), change.protocol)
      else known.delete(keyText(change.protocol))
      revision = change.revision
      conflicts = change.conflicts
      if (snapshotDue) return
      queue.push(change)
      if (queue.length > backlog) {
        queue.length = 0
        snapshotDue = true
      }
      wake?.()
    })
    revision = subscription.revision
    conflicts = subscription.conflicts
    for (const key of subscription.protocols) known.set(keyText(key), key)
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

    const snapshot = (): AvailabilityFrame => ({
      kind: 'snapshot',
      revision,
      protocols: [...known.values()].map(servedValue),
      conflicts: conflicts.map(keyValue),
    })

    async function* frames(): AsyncGenerator<AvailabilityFrame, 'unavailable'> {
      try {
        for (;;) {
          if (signal.aborted) return 'unavailable'
          if (snapshotDue) {
            snapshotDue = false
            yield snapshot()
            continue
          }
          const next = queue.shift()
          if (next !== undefined) {
            yield changeFrame(next)
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
