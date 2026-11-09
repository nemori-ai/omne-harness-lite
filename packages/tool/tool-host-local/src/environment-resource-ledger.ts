import {
  managedResourceSchema,
  type ManagedResource,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type { ToolFailure, ToolOperationId } from '@omne-harness/tool-contract'
import {
  closedAcquisition,
  createdBy,
  environmentFailure,
  type EnvironmentAddress,
  type EnvironmentStateStore,
  type EnvironmentState,
  type ResourceFact,
  type ResourceStop,
  type RetainedCreator,
  type RetainedResourceFact,
  type RetentionState,
} from './environment-state.ts'

export type EnvironmentResourceLedgerInput = Readonly<{
  state: EnvironmentStateStore
  address: EnvironmentAddress
  authorize(): Promise<'authorized' | 'notAuthorized' | 'unavailable'>
}>
export type EnvironmentResourceLedger = ResourceLedger &
  Readonly<{
    close(): Promise<'confirmed' | 'unavailable'>
    inspect(): Promise<readonly ResourceFact[] | null>
  }>

/** A confirmed stop and a handover are final for this acquisition; a later stop fact keeps them. */
function settledStop(current: ResourceStop, status: 'confirmed' | 'unconfirmed'): ResourceStop {
  return current === 'confirmed' || current === 'handedOver' ? current : status
}

export async function createEnvironmentResourceLedger(
  input: EnvironmentResourceLedgerInput,
): Promise<EnvironmentResourceLedger> {
  const controller = new AbortController()
  const unsubscribe = input.state.onClosed(input.address, () => controller.abort())
  controller.signal.addEventListener('abort', unsubscribe, { once: true })
  async function inspectState() {
    const result = await input.state.read(input.address)
    if ('ok' in result && result.ok?.closed) controller.abort()
    return result
  }
  await inspectState()

  async function confirm(
    key: string,
    adopted: boolean,
  ): Promise<'confirmed' | 'closed' | 'unavailable'> {
    const prior = await inspectState()
    if ('failure' in prior || !prior.ok) return 'unavailable'
    if (prior.ok.closed) return 'closed'
    const result = await input.state.permit(
      input.address,
      state => {
        if (!state) return environmentFailure('original acquisition is missing')
        if (state.closed) return fail({ kind: 'not-settled' })
        const found = state.resources.find(item => item.resource.key === key)
        if (!found || found.stop === 'confirmed' || found.stop === 'handedOver')
          return environmentFailure('resource has no active durable plan')
        return succeed({
          ...state,
          resources: state.resources.map(item =>
            item.resource.key === key
              ? { ...item, permitted: true, adopted: item.adopted || adopted }
              : item,
          ),
        })
      },
      input.authorize,
    )
    if ('ok' in result) return 'confirmed'
    if (result.failure.kind === 'not-settled') {
      controller.abort()
      return 'closed'
    }
    const current = await inspectState()
    return 'ok' in current && current.ok?.closed ? 'closed' : 'unavailable'
  }

  const ledger: EnvironmentResourceLedger = {
    closed: controller.signal,
    async plan(resource: ManagedResource) {
      if (controller.signal.aborted) return 'closed'
      const checked = await managedResourceSchema['~standard'].validate(resource)
      if (checked.issues) return 'unavailable'
      const result = await input.state.update(input.address, state => {
        if (!state) return environmentFailure('original acquisition is missing')
        if (state.closed) return fail({ kind: 'not-settled' })
        const existing = state.resources.find(item => item.resource.key === checked.value.key)
        if (existing && canonicalDigest(existing.resource) !== canonicalDigest(checked.value))
          return fail({ kind: 'conflict', operation: input.address.operation })
        return succeed(
          existing
            ? state
            : {
                ...state,
                resources: [
                  ...state.resources,
                  { resource: checked.value, permitted: false, adopted: false, stop: 'active' },
                ],
              },
        )
      })
      if ('ok' in result) return 'recorded'
      if (result.failure.kind === 'conflict') return 'conflict'
      if (result.failure.kind === 'not-settled') {
        controller.abort()
        return 'closed'
      }
      return 'unavailable'
    },
    permit: key => confirm(key, false),
    adopt: key => confirm(key, true),
    async stopped(key, status) {
      const result = await input.state.update(input.address, state => {
        if (!state || !state.resources.some(item => item.resource.key === key))
          return environmentFailure('resource plan is missing')
        return succeed({
          ...state,
          resources: state.resources.map(item =>
            item.resource.key === key ? { ...item, stop: settledStop(item.stop, status) } : item,
          ),
        })
      })
      return 'ok' in result ? 'recorded' : 'unavailable'
    },
    async close() {
      const result = await input.state.update(input.address, state =>
        state
          ? succeed(closedAcquisition(state))
          : environmentFailure('original acquisition is missing'),
      )
      if ('failure' in result) return 'unavailable'
      controller.abort()
      return 'confirmed'
    },
    async inspect() {
      const result = await inspectState()
      return 'ok' in result && result.ok ? result.ok.resources : null
    },
  }
  return Object.freeze(ledger)
}

export type RetainedTerminalLedgerInput = EnvironmentResourceLedgerInput &
  Readonly<{ scope: ScopeRef }>
/**
 * The retention scope's ledger view for one original call. The integrator hands the same object as
 * the retained terminal ledger and as the retained process ledger: `permit` serves terminals, `adopt`
 * commits the handover of a one-shot command's domain.
 */
export type RetainedTerminalLedgerView = Pick<
  ResourceLedger,
  'closed' | 'plan' | 'permit' | 'adopt' | 'stopped'
> &
  Readonly<{
    /**
     * Whether the scope holds the end fact of a handed-over process (stop clause 7): `confirmed`
     * from the commit that confirmed its stop on, `none` before, `unavailable` when the end fact
     * cannot be read.
     */
    ended(key: string): Promise<'confirmed' | 'none' | 'unavailable'>
    close(): Promise<'confirmed' | 'unavailable'>
    inspect(): Promise<readonly RetainedResourceFact[] | null>
  }>

const creatorOf = (creator: EnvironmentState): RetainedCreator => ({
  call: creator.preparation.call,
  operation: creator.preparation.operation,
  original: canonicalDigest(creator.original),
})

/** The acquisition with every fact it keeps for `key` written as a confirmed stop. */
function stoppedKey(state: EnvironmentState, key: string): EnvironmentState {
  return {
    ...state,
    resources: state.resources.map(item =>
      item.resource.key === key ? { ...item, stop: 'confirmed' } : item,
    ),
    reservations: state.reservations.map(item =>
      item.resource.key === key ? { ...item, stop: 'confirmed' } : item,
    ),
  }
}

/**
 * The acquisition with `resource` reserved (`PlanCommit`): `not-settled` when the scope or the
 * acquisition is closed, a conflict when the key holds another resource, unchanged when it holds
 * this one.
 */
function reserve(
  state: EnvironmentState | null,
  scopeClosed: boolean,
  resource: ManagedResource,
  operation: ToolOperationId,
): Outcome<EnvironmentState, ToolFailure> {
  if (!state) return environmentFailure('original acquisition is missing')
  if (scopeClosed || state.closed) return fail({ kind: 'not-settled' })
  const existing = state.reservations.find(item => item.resource.key === resource.key)
  if (!existing)
    return succeed({
      ...state,
      reservations: [...state.reservations, { resource, stop: 'active' }],
    })
  return canonicalDigest(existing.resource) === canonicalDigest(resource)
    ? succeed(state)
    : fail({ kind: 'conflict', operation })
}

function planAnswer(result: Outcome<EnvironmentState, ToolFailure>) {
  if ('ok' in result) return 'recorded'
  if (result.failure.kind === 'conflict') return 'conflict'
  return result.failure.kind === 'not-settled' ? 'closed' : 'unavailable'
}

/**
 * The take-over decision of `key` (`TakeCommit`): `held` when the scope adopted it already, else
 * the entry for an active reservation of an open acquisition in an open scope.
 */
function takeDecision(
  key: string,
  taken: RetainedResourceFact['taken'],
): (
  creator: EnvironmentState,
  retention: RetentionState | null,
) => Outcome<RetainedResourceFact | 'held', ToolFailure> {
  return (creator, retention) => {
    const held = retention?.resources.find(
      item => item.resource.key === key && createdBy(item.creator, creator),
    )
    if (taken === 'adopted' && held?.taken === 'adopted') return succeed('held')
    if (retention?.phase === 'closed' || creator.closed) return fail({ kind: 'not-settled' })
    const reservation = creator.reservations.find(item => item.resource.key === key)
    if (reservation?.stop !== 'active')
      return environmentFailure('retained resource has no active reservation')
    return succeed({
      resource: reservation.resource,
      taken,
      stop: 'active',
      creator: creatorOf(creator),
    })
  }
}

export async function createRetainedTerminalLedger(
  input: RetainedTerminalLedgerInput,
): Promise<RetainedTerminalLedgerView> {
  const controller = new AbortController()
  const unsubscribe = input.state.onClosed(input.address, () => controller.abort(), input.scope)
  controller.signal.addEventListener('abort', unsubscribe, { once: true })
  let boundOriginal: EnvironmentState | null = null
  async function binding() {
    const original = await input.state.read(input.address)
    const current =
      'ok' in original &&
      original.ok?.original.retentionScope &&
      canonicalDigest(original.ok.original.retentionScope) === canonicalDigest(input.scope)
        ? original.ok
        : null
    if (
      !current ||
      (boundOriginal &&
        canonicalDigest(boundOriginal.original) !== canonicalDigest(current.original))
    )
      return null
    boundOriginal = current
    return current
  }
  const initial = await input.state.readRetention(input.address, input.scope)
  if ('ok' in initial && initial.ok?.phase === 'closed') controller.abort()

  /**
   * The take-over of this call's reservation `key`: one commit of the scope's record, decided on
   * the creating acquisition and the scope. A process the scope adopted already answers
   * `confirmed` without a write, so a repeated `adopt` is the query for a lost answer. A closed scope, a
   * closed acquisition and a settled original call answer `closed`.
   */
  async function takeOver(
    key: string,
    taken: RetainedResourceFact['taken'],
  ): Promise<'confirmed' | 'closed' | 'unavailable'> {
    if (!(await binding())) return 'unavailable'
    const result = await input.state.takeOver(
      input.address,
      input.scope,
      takeDecision(key, taken),
      input.authorize,
    )
    if ('ok' in result) return 'confirmed'
    return result.failure.kind === 'not-settled' ? 'closed' : 'unavailable'
  }

  /** A stop of a key the scope holds (`StopCommit`): the creator's facts first when confirmed. */
  async function stopHeld(
    held: RetainedResourceFact,
    key: string,
    status: 'confirmed' | 'unconfirmed',
  ): Promise<'recorded' | 'unavailable'> {
    if (status === 'confirmed') {
      const creator = { tenant: input.address.tenant, ...held.creator }
      const marked = await input.state.update(creator, state =>
        state
          ? succeed(stoppedKey(state, key))
          : environmentFailure('creator acquisition is missing'),
      )
      if ('failure' in marked) return 'unavailable'
    }
    const stopped = await input.state.stopRetained(input.address, input.scope, key, status)
    return 'ok' in stopped ? 'recorded' : 'unavailable'
  }

  /**
   * A stop of this call's own reservation (`CreatorStopCommit`). A key the scope took over after
   * the read is the scope's to record.
   */
  async function stopOwn(
    key: string,
    status: 'confirmed' | 'unconfirmed',
  ): Promise<'recorded' | 'unavailable'> {
    let taken = false
    const own = await input.state.update(input.address, state => {
      const reservation = state?.reservations.find(item => item.resource.key === key)
      if (!state || !reservation) return environmentFailure('reservation is missing')
      taken = reservation.stop === 'handedOver'
      if (taken) return environmentFailure('reservation was taken over')
      return succeed({
        ...state,
        reservations: state.reservations.map(item =>
          item === reservation ? { ...item, stop: settledStop(item.stop, status) } : item,
        ),
      })
    })
    if ('ok' in own) return 'recorded'
    return taken ? ledger.stopped(key, status) : 'unavailable'
  }

  const ledger: RetainedTerminalLedgerView = {
    closed: controller.signal,
    /**
     * The reservation goes into this call's own acquisition record, never into the scope. The
     * write decides on the scope's record and asserts its revision: a closed scope answers
     * `closed` and nothing is written.
     */
    async plan(resource) {
      const bound = await binding()
      if (!bound) return 'unavailable'
      if (controller.signal.aborted || bound.closed) return 'closed'
      const checked = await managedResourceSchema['~standard'].validate(resource)
      if (checked.issues) return 'unavailable'
      let scopeClosed = false
      const result = await input.state.update(input.address, (state, _receipt, retention) => {
        scopeClosed = retention?.phase === 'closed'
        return reserve(state, scopeClosed, checked.value, input.address.operation)
      })
      const answer = planAnswer(result)
      if (answer === 'closed' && scopeClosed) controller.abort()
      return answer
    },
    permit: key => takeOver(key, 'permitted'),
    adopt: key => takeOver(key, 'adopted'),
    /**
     * A key the scope took over belongs to the scope, so any view of the scope records its stop:
     * after a provider restart no view of the creating call exists. A confirmed stop first writes
     * the creator's own facts for the key, then removes the entry in one commit of the scope.
     * A reservation the scope did not take over is the creating call's: its view records the stop
     * in its own record, whether or not the scope is closed.
     */
    async stopped(key, status) {
      if (!(await binding())) return 'unavailable'
      const current = await input.state.readRetention(input.address, input.scope)
      if ('failure' in current) return 'unavailable'
      const held = current.ok?.resources.find(item => item.resource.key === key)
      return held ? stopHeld(held, key, status) : stopOwn(key, status)
    },
    ended: key => input.state.readEnded(input.address, input.scope, key),
    /** Marks the scope closed: nothing is taken over any more; what it took over stays. */
    async close() {
      if (!(await binding())) return 'unavailable'
      const result = await input.state.closeRetention(input.address, input.scope)
      if ('failure' in result) return 'unavailable'
      controller.abort()
      return 'confirmed'
    },
    async inspect() {
      const result = await input.state.readRetention(input.address, input.scope)
      if ('failure' in result) return null
      if (result.ok?.phase === 'closed') controller.abort()
      return (result.ok?.resources ?? []).filter(
        item =>
          item.creator.call === input.address.call &&
          item.creator.operation === input.address.operation,
      )
    },
  }
  return Object.freeze(ledger)
}
