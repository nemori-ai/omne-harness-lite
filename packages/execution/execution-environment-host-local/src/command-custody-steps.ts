import type {
  ManagedResource,
  ProviderAcquireInput,
  ResidueReport,
  RetainedProcessRef,
} from '@omne-harness/execution-environment-contract'
import { decideDisposition, resolveUnknownHandover, type Disposition } from './command-custody.ts'
import {
  custodyBindingOf,
  loadedCustodyBinding,
  retentionScopeClosed,
  type RetentionBinding,
} from './command-retention.ts'
import type { ResiduePolicy } from './host-command.ts'
import type { RetainedReservation } from './host-retained-processes.ts'

const monotonicMs = () =>
  /* wall-clock: operation-timing -- Bound a disposition by its deadline. */ performance.now()

type StopStatus = 'confirmed' | 'unconfirmed'

export type Custody =
  | Readonly<{ kind: 'acquisition' }>
  | Readonly<{ kind: 'reserved' }>
  | Readonly<{ kind: 'handedOver' }>
  | Readonly<{ kind: 'retained'; process: RetainedProcessRef }>
  | Readonly<{ kind: 'unknown'; reservation: RetainedReservation }>

export const ownedByAcquisition = (custody: Custody) =>
  custody.kind === 'acquisition' || custody.kind === 'reserved'

export type CustodyEntry = {
  readonly resource: ManagedResource
  custody: Custody
  members: number | null
  /** A stop of this handle was asked for; set before the stop's first wait. */
  stopRequested: boolean
  /** The acquisition released the domain; set before the release's first wait. */
  released: boolean
  stopping: Promise<StopStatus> | undefined
  /** The disposition in flight after the exit; a stop waits for it to learn the owner. */
  disposition: Promise<unknown> | undefined
  resolving: Promise<void> | undefined
}

export type CustodyPlatform<E extends CustodyEntry, C> = Readonly<{
  policy: ResiduePolicy
  retention: ProviderAcquireInput['retention'] | undefined
  binding: RetentionBinding | undefined
  startBoundMs: number
  live: Set<E>
  forceStop(entry: E, context: C): Promise<StopStatus>
  enterIndex(
    entry: E,
    binding: RetentionBinding,
    reservation: RetainedReservation,
  ): Promise<RetainedProcessRef>
  enterIndexStopping(entry: E, binding: RetentionBinding, reservation: RetainedReservation): void
}>

export function createCustodySteps<E extends CustodyEntry, C>(platform: CustodyPlatform<E, C>) {
  const { binding, live } = platform

  const bindingOf = (entry: E) =>
    custodyBindingOf({
      policy: platform.policy,
      retention: platform.retention,
      binding,
      resource: entry.resource,
    })

  /** The custody changes in the same synchronous step as the reading of `interrupted` and of the
   *  scope's closure; effects follow, so a release back from a wait finds a handed-over domain gone. */
  const apply = async (
    entry: E,
    context: C,
    decision: Disposition,
    interrupted: () => boolean,
  ): Promise<ResidueReport> => {
    switch (decision.kind) {
      case 'stop':
        if (entry.custody.kind !== 'acquisition') entry.custody = { kind: 'acquisition' }
        void platform.forceStop(entry, context)
        return decision.residue
      case 'unknown':
        entry.custody = { kind: 'unknown', reservation: decision.reservation }
        return { kind: 'unknown' }
      case 'retained':
      case 'retainedInterrupted': {
        if (binding === undefined) throw new Error('a handover without a retention binding')
        entry.custody = { kind: 'handedOver' }
        live.delete(entry)
        if (
          decision.kind === 'retainedInterrupted' ||
          interrupted() ||
          retentionScopeClosed(binding)
        ) {
          platform.enterIndexStopping(entry, binding, decision.reservation)
          return { kind: 'stopping', reason: 'closed' }
        }
        const process = await platform.enterIndex(entry, binding, decision.reservation)
        entry.custody = { kind: 'retained', process }
        return { kind: 'retained', process, processes: entry.members ?? 'unknown' }
      }
      default: {
        const exhaustive: never = decision
        return exhaustive
      }
    }
  }

  const dispose = async (entry: E, context: C): Promise<ResidueReport> => {
    const deadline = monotonicMs() + platform.startBoundMs
    const custody = await loadedCustodyBinding(bindingOf(entry), binding, entry.members, deadline)
    entry.custody = { kind: 'reserved' }
    const interrupted = () => entry.stopRequested || entry.released
    const decision = await decideDisposition({
      members: entry.members,
      binding: custody,
      deadline,
      interrupted,
    })
    return apply(entry, context, decision, interrupted)
  }

  const resolveUnknown = (entry: E, context: C): Promise<void> => {
    entry.resolving ??= (async () => {
      const custody = entry.custody
      if (custody.kind !== 'unknown') return
      const custodyBinding = bindingOf(entry)
      if (typeof custodyBinding === 'string') return
      const interrupted = () => entry.stopRequested
      const decision = await resolveUnknownHandover({
        binding: custodyBinding,
        reservation: custody.reservation,
        deadline: monotonicMs() + platform.startBoundMs,
        interrupted,
      })
      if (decision.kind === 'unknown' || entry.custody.kind !== 'unknown') return
      const running = apply(entry, context, decision, interrupted)
      entry.disposition = running
      const stopping = entry.stopping
      await running
      await stopping
    })()
      .catch(() => undefined)
      .finally(() => {
        entry.resolving = undefined
      })
    return entry.resolving
  }

  const ownsForStop = async (entry: E, context: C): Promise<boolean> => {
    if (entry.custody.kind === 'unknown') await resolveUnknown(entry, context)
    return ownedByAcquisition(entry.custody)
  }

  const release = async (entry: E, context: C): Promise<void> => {
    switch (entry.custody.kind) {
      case 'acquisition':
      case 'reserved':
        await platform.forceStop(entry, context)
        return
      case 'unknown':
        await resolveUnknown(entry, context)
        return
      case 'handedOver':
      case 'retained':
        return
      default: {
        const exhaustive: never = entry.custody
        return exhaustive
      }
    }
  }

  return { dispose, ownsForStop, release }
}
