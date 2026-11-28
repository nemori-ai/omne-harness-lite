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
import type { Advance } from './advance.ts'
import { messageOf, type DriveRefusal } from './failures.ts'
import { handedRun, type KnownHandovers } from './known-handovers.ts'
import type { Lifecycle } from './lifecycle.ts'
import { sessionKey, type Scheduling, type SessionRef } from './scheduling.ts'
import { sessionSlotReference } from './slot-reference.ts'

export type Joining = Readonly<{
  run: RunId
  execution: string
  handover: DurableEvidence
  grant: DurableEvidence
}>

export type Recovery = Readonly<{
  trigger(ref: SessionRef): void
  /** Keeps the checks away from the session while `work` hands its run over and joins the new attempt. */
  holding<T>(ref: SessionRef, work: () => Promise<T>): Promise<T>
  /** Joins a granted attempt to the handed-over execution; false when it did not join now. */
  join(ref: SessionRef, port: AgentDrivePort, joining: Joining): Promise<boolean>
}>

type ActiveRun = Extract<WorkSnapshot['run'], { kind: 'active' }>

export function handsBack(status: ExecutionStatus): boolean {
  if (status.state === 'suspended') return true
  return status.state === 'open' && status.attachment === 'active' && status.lost !== null
}

export function currentDrive<P>(dependencies: SessionDependencies<P>): AgentDrivePort | null {
  try {
    return dependencies.agentDrive.current()
  } catch {
    return null
  }
}

export async function outbound<T>(
  call: () => Promise<Outcome<T, DriveFailure>>,
): Promise<Outcome<T, DriveFailure>> {
  try {
    return await call()
  } catch (error) {
    return { failure: { kind: 'unavailable', diagnostic: `the port threw: ${messageOf(error)}` } }
  }
}

const transient = (failure: DriveFailure): boolean =>
  failure.kind === 'unavailable' || failure.kind === 'busy' || failure.kind === 'commit-unknown'

export function createRecovery<P>(
  input: Readonly<{
    dependencies: SessionDependencies<P>
    lifecycle: Lifecycle
    scheduling: Scheduling<P>
    coordinator: SessionFaces<P>
    known: KnownHandovers
    closeRefused: Advance['closeRefused']
  }>,
): Recovery {
  const { dependencies, lifecycle, scheduling, coordinator, known, closeRefused } = input
  const held = new Map<string, number>()

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
    if (!['stale-advance', 'changed', 'conflict'].includes(claimed.failure.kind))
      report(ref, 'claim', run.run, claimed.failure)
    return null
  }

  const closeRun = async (ref: SessionRef, run: RunId, refusal: DriveRefusal): Promise<void> => {
    const principal = await scheduling.principal('coordinator', ref)
    if ('failure' in principal) return
    const snapshot = await coordinator.work.readWork({ principal: principal.ok, ...ref })
    if ('failure' in snapshot) return
    const active = snapshot.ok.run
    if (active.kind === 'active' && active.run === run && active.advance !== null)
      await closeRefused(ref, active.advance, refusal)
  }

  const join: Recovery['join'] = async (ref, port, { run, execution, handover, grant }) => {
    const resumed = await outbound(() =>
      port.resume({
        ...ref,
        execution,
        operation: deriveDriveOperation({ kind: 'resume', execution, grant }),
        recovery: handover,
        grant,
      }),
    )
    if ('ok' in resumed) return true
    if (resumed.failure.kind === 'refused') await closeRun(ref, run, resumed.failure)
    else if (!transient(resumed.failure)) report(ref, 'resume', run, resumed.failure)
    return false
  }

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
    await join(ref, port, { run: run.run, execution: run.execution.execution, handover, grant })
  }

  const holding: Recovery['holding'] = async (ref, work) => {
    const key = sessionKey(ref)
    held.set(key, (held.get(key) ?? 0) + 1)
    try {
      return await work()
    } finally {
      const left = (held.get(key) ?? 1) - 1
      if (left === 0) held.delete(key)
      else held.set(key, left)
    }
  }

  const check = async (ref: SessionRef): Promise<void> => {
    if (held.has(sessionKey(ref))) return
    const port = currentDrive(dependencies)
    if (port === null) return
    const principal = await scheduling.principal('coordinator', ref)
    if ('failure' in principal) return
    const snapshot = await coordinator.work.readWork({ principal: principal.ok, ...ref })
    if ('failure' in snapshot) return
    const run = handedRun(snapshot.ok, known.of(ref, snapshot.ok))
    if (run === null) return
    const { advance } = run
    if (advance === null) return
    const execution = run.execution.execution
    const status = await outbound(() => port.inspect({ ...ref, execution }))
    if ('failure' in status || !handsBack(status.ok)) return
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

  return { trigger: absorbing(lifecycle, scheduling, check), holding, join }
}

function absorbing<P>(
  lifecycle: Lifecycle,
  scheduling: Scheduling<P>,
  check: (ref: SessionRef) => Promise<void>,
): (ref: SessionRef) => void {
  const triggers = new Map<string, { again: boolean }>()
  return ref => {
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
  }
}
