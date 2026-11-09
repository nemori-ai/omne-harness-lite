// The custody steps of an exited command: who carries the stop duty, and how a disposition moves
// it. Every platform that hands domains over shares these steps; the platform supplies the stop and
// the two ways into the retained-process index.
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

/**
 * Who carries the stop duty for the domain. `acquisition` from the start; `reserved` while a
 * handover is being decided and committed (still this acquisition's); `unknown` while the commit's
 * result is unread (the reservation is kept, nothing is stopped); `handedOver` once the commit took
 * effect and the index is taking the domain, running or stopping; `retained` once the index holds
 * it running. Only `acquisition` and `reserved` are this acquisition's: a release, a handle stop or
 * the domain's end act on nothing else. Every transition is synchronous, in the same step as the
 * rechecks that justify it, so a wait that returns reads the custody again before it acts.
 */
export type Custody =
  | Readonly<{ kind: 'acquisition' }>
  | Readonly<{ kind: 'reserved' }>
  | Readonly<{ kind: 'handedOver' }>
  | Readonly<{ kind: 'retained'; process: RetainedProcessRef }>
  | Readonly<{ kind: 'unknown'; reservation: RetainedReservation }>

export const ownedByAcquisition = (custody: Custody) =>
  custody.kind === 'acquisition' || custody.kind === 'reserved'

/** What the custody steps read and write on a platform's entry. */
export type CustodyEntry = {
  readonly resource: ManagedResource
  custody: Custody
  /** The reading of the domain's other members at exit; null when it could not be read. */
  members: number | null
  /** A stop of this handle was asked for; set before the stop's first wait. */
  stopRequested: boolean
  /** The acquisition released the domain; set before the release's first wait. */
  released: boolean
  /** The stop sequence of this acquisition in flight. */
  stopping: Promise<StopStatus> | undefined
  /** The disposition in flight after the exit; a stop waits for it to learn the owner. */
  disposition: Promise<unknown> | undefined
  /** The one resolution in flight of an unread handover; concurrent askers join it. */
  resolving: Promise<void> | undefined
}

/** What a platform gives the custody steps. `C` is what its stop needs besides the entry. */
export type CustodyPlatform<E extends CustodyEntry, C> = Readonly<{
  policy: ResiduePolicy
  retention: ProviderAcquireInput['retention'] | undefined
  binding: RetentionBinding | undefined
  startBoundMs: number
  /** The domains this acquisition still owns; a commit that took effect takes the entry out. */
  live: Set<E>
  /** The forced stop of a domain this acquisition owns, recorded on its ledger; joins one in flight. */
  forceStop(entry: E, context: C): Promise<StopStatus>
  /** The commit took effect and the domain is whole: the index takes it as running. */
  enterIndex(
    entry: E,
    binding: RetentionBinding,
    reservation: RetainedReservation,
  ): Promise<RetainedProcessRef>
  /** The commit took effect, but the domain was stopped, released or its scope closed meanwhile. */
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

  /**
   * Carries out a disposition. The custody changes synchronously, in the same step as the reading
   * of `interrupted` and of the scope's closure that justifies it; the effects follow. A commit that
   * took effect leaves `live` here, so a release that returns from a wait finds nothing to stop.
   */
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
        // A commit is reachable only through a binding.
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

  /** The disposition after the exit, bounded by the start bound, the index's loading included. */
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

  /**
   * Asks the commit again for a domain whose handover result is unread. One resolution per domain
   * is in flight; a release, a handle stop or a maintenance that arrives meanwhile joins it. A
   * release does not interrupt it: a commit that took effect hands the domain to its scope. A stop
   * this acquisition issued before the answer was lost still does.
   */
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
      // The stop a settled answer started under this acquisition is part of this resolution.
      const stopping = entry.stopping
      await running
      await stopping
    })()
      // A resolution that itself failed leaves the custody as it is; the askers are not rejected.
      .catch(() => undefined)
      .finally(() => {
        entry.resolving = undefined
      })
    return entry.resolving
  }

  /**
   * Whether a stop asked through the handle may act: an unread handover is read first, not
   * stopped. A domain the retention scope owns is left alone; this acquisition cannot confirm a
   * stop it did not issue.
   */
  const ownsForStop = async (entry: E, context: C): Promise<boolean> => {
    if (entry.custody.kind === 'unknown') await resolveUnknown(entry, context)
    return ownedByAcquisition(entry.custody)
  }

  /**
   * The release of one domain, after the release's wait: the custody is read again here, so a
   * handover that took effect meanwhile is left alone. A domain whose handover is unread is asked
   * again, not stopped; the resolution never rejects a release.
   */
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
