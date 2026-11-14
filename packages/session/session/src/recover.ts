// The recovery of an active Run whose execution was handed over (contract PM-14, PM-05; SPEC C2
// 顺序：恢复与接管, the recovery path only). S3 hands an active Run here. The execution record decides:
//
// - The attachment is active and the host of the record has no judgment that its runtime is out of
//   contact: the Agent advances the execution, and nothing is done (PM-14).
// - The attachment is active and the host judges its runtime out of contact (`ExecutionStatus.lost`,
//   for example the runtime of a process that ended): `detach` through the recovery entry of the
//   host hands the attachment back in the place of that runtime, which suspends the execution. The
//   next item then applies. The old runtime, should the judgment be wrong, learns it from
//   `stale-advance` at its next commit; nothing here depends on the judgment being right for safety.
// - The execution is suspended, so its attachment was handed back: `claim` grants a new attempt
//   with the handover evidence as its continuity, and `resume` asks the Agent to go on under the
//   grant of that attempt. `claim` supersedes the former attempt in the same batch (PM-05 item 1).
//   The claim of one handover has one operation identity. The recovery queries it first (PM-14:
//   先查后做): a claim that is committed already gives its grant, so a recovery that comes back
//   after a failed `resume` resumes with the same grant and claims no second attempt (PM-10).
// - The execution ended while this Run is still open: an event it left is not interpreted yet. The
//   drive's `inspect` wakes the readers of the published events again; nothing else is done here.
// - Its record cannot be read: nothing is done here.
//
// The takeover in one commit (an `attach` that supersedes an active attachment, Agent SPEC "恢复与
// 接管") is not in this member: an attachment whose runtime is out of contact goes the hand-back way
// above. A `resume` that fails leaves the claim as it is; the next scan comes back with the same
// identities.
import type { Outcome } from '@omne-harness/operation-result'
import {
  deriveDriveOperation,
  deriveSessionOperation,
  expectedRevision,
  type AgentDrivePort,
  type DriveFailure,
  type DurableEvidence,
  type ExecutionStatus,
  type RunId,
  type SessionFaces,
  type SessionFailure,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { SessionDependencies } from './dependencies.ts'
import type { SessionDiagnostic } from './diagnostics.ts'
import { messageOf } from './failures.ts'
import type { Lifecycle } from './lifecycle.ts'
import { sessionKey, type Scheduling, type SessionRef } from './scheduling.ts'
import { sessionSlotReference } from './slot-reference.ts'

export type Recovery = Readonly<{
  /** Checks the active Run of one session. A check in flight absorbs later triggers into one more. */
  trigger(ref: SessionRef): void
}>

type ActiveRun = Extract<WorkSnapshot['run'], { kind: 'active' }>

/**
 * The active Run that the Agent accepted: its first input was handed over (SE35), or the Agent
 * took it in a batch, so it is no longer pending. The second fact stands alone where the
 * hand-over cannot be recorded (no production evidence source). The other case, a first input that
 * is pending without a hand-over, is the granted Run that C2 invokes again (PA-06 item 2).
 */
export function acceptedRun(snapshot: WorkSnapshot): ActiveRun | null {
  const { run } = snapshot
  if (run.kind !== 'active') return null
  return snapshot.handed.includes(run.first) || !snapshot.pending.includes(run.first) ? run : null
}

/**
 * Whether the attachment of the execution can be handed back now: it was handed back already, or
 * it is active and the host of the record judges its runtime out of contact. An active attachment
 * without that judgment belongs to an Agent that advances, or to one nobody can speak for: both
 * wait (PM-14). Session never infers the judgment from a timeout or an empty directory.
 */
export function handsBack(status: ExecutionStatus): boolean {
  if (status.state === 'suspended') return true
  return status.state === 'open' && status.attachment === 'active' && status.lost !== null
}

/** A drive failure that the next scan may meet differently: nothing is reported for it. */
const transient = (failure: DriveFailure): boolean =>
  failure.kind === 'unavailable' || failure.kind === 'busy' || failure.kind === 'commit-unknown'

export function createRecovery<P>(
  input: Readonly<{
    dependencies: SessionDependencies<P>
    lifecycle: Lifecycle
    scheduling: Scheduling<P>
    coordinator: SessionFaces<P>
  }>,
): Recovery {
  const { dependencies, lifecycle, scheduling, coordinator } = input

  const report = (
    ref: SessionRef,
    step: SessionDiagnostic['step'],
    run: RunId,
    failure: SessionFailure | DriveFailure,
  ): void => {
    if (lifecycle.closed) return
    lifecycle.diagnose({
      owner: 'C2',
      step,
      tenant: ref.tenant,
      session: ref.session,
      run,
      reason: failure.kind,
      detail: JSON.stringify(failure),
    })
  }

  const drive = (): AgentDrivePort | null => {
    try {
      return dependencies.agentDrive.current()
    } catch {
      return null
    }
  }

  /** One outbound call; a throw of the port is `unavailable`, like an absent port. */
  const outbound = async <T>(
    call: () => Promise<Outcome<T, DriveFailure>>,
  ): Promise<Outcome<T, DriveFailure>> => {
    try {
      return await call()
    } catch (error) {
      return { failure: { kind: 'unavailable', diagnostic: `the port threw: ${messageOf(error)}` } }
    }
  }

  /**
   * The grant of the attempt claimed for `handover`: the receipt of the claim that is committed
   * already (query first, contract PM-14), else of the claim committed now. Null: the claim did not
   * commit here, and the next scan comes back.
   */
  const claimedGrant = async (
    ref: SessionRef,
    principal: P,
    snapshot: WorkSnapshot,
    run: ActiveRun,
    handover: DurableEvidence,
  ): Promise<DurableEvidence | null> => {
    const instance = sessionSlotReference(ref.session, run.adoption)
    const operation = deriveSessionOperation({
      kind: 'claim',
      run: run.run,
      instance,
      continuity: handover,
    })
    const known = await coordinator.work.queryOperation({ principal, ...ref, operation })
    if ('failure' in known) return null
    if (known.ok.kind === 'committed') return known.ok.receipt.source
    const claimed = await coordinator.work.claim({
      principal,
      ...ref,
      operation,
      run: run.run,
      instance,
      continuity: handover,
      expected: expectedRevision(snapshot, 'claim'),
    })
    if ('ok' in claimed) return claimed.ok.receipt.source
    // `stale-advance`, `changed` and `conflict`: another recovery, or an earlier claim of this one
    // whose outcome was unknown, moved the Run layer first. The next scan reads the Run again.
    if (!['stale-advance', 'changed', 'conflict'].includes(claimed.failure.kind))
      report(ref, 'claim', run.run, claimed.failure)
    return null
  }

  /** `claim` for the handover, then `resume` under the grant of the claimed attempt. */
  const takeUp = async (
    ref: SessionRef,
    port: AgentDrivePort,
    principal: P,
    snapshot: WorkSnapshot,
    run: ActiveRun,
    handover: DurableEvidence,
  ): Promise<void> => {
    const grant = await claimedGrant(ref, principal, snapshot, run, handover)
    if (grant === null) return
    const execution = run.execution.execution
    const resumed = await outbound(() =>
      port.resume({
        ...ref,
        execution,
        operation: deriveDriveOperation({ kind: 'resume', execution, grant }),
        recovery: handover,
        grant,
      }),
    )
    if ('failure' in resumed && !transient(resumed.failure))
      report(ref, 'resume', run.run, resumed.failure)
  }

  const check = async (ref: SessionRef): Promise<void> => {
    const port = drive()
    if (port === null) return
    const principal = await scheduling.principal('coordinator', ref)
    if ('failure' in principal) return
    const snapshot = await coordinator.work.readWork({ principal: principal.ok, ...ref })
    if ('failure' in snapshot) return
    const run = acceptedRun(snapshot.ok)
    if (run === null) return
    // No member releases an advance without a claim, so the Run that the Agent accepted holds one.
    const { advance } = run
    if (advance === null) return
    const execution = run.execution.execution
    const status = await outbound(() => port.inspect({ ...ref, execution }))
    if ('failure' in status || !handsBack(status.ok)) return
    // A suspended execution handed its attachment back already, so `detach` answers its handover
    // evidence. For a runtime that is out of contact, the recovery entry of the host hands the
    // attachment back in its place, and the execution is suspended from then on.
    const handover = await outbound(() =>
      port.detach({
        ...ref,
        execution,
        operation: deriveDriveOperation({ kind: 'detach', execution, advance }),
        advance,
      }),
    )
    if ('failure' in handover) {
      if (!transient(handover.failure)) report(ref, 'detach', run.run, handover.failure)
      return
    }
    await takeUp(ref, port, principal.ok, snapshot.ok, run, handover.ok)
  }

  const triggers = new Map<string, { again: boolean }>()
  return {
    trigger: ref => {
      if (lifecycle.closed) return
      const key = sessionKey(ref)
      const inFlight = triggers.get(key)
      if (inFlight !== undefined) {
        inFlight.again = true
        return
      }
      const state = { again: false }
      triggers.set(key, state)
      lifecycle.spawn(async () => {
        try {
          do {
            state.again = false
            await scheduling.serial(key, () => check(ref))
          } while (state.again && !lifecycle.closed)
        } finally {
          triggers.delete(key)
        }
      })
    },
  }
}
