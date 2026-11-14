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
export type RetainedTerminalLedgerView = Pick<
  ResourceLedger,
  'closed' | 'plan' | 'permit' | 'adopt' | 'stopped'
> &
  Readonly<{
    ended(key: string): Promise<'confirmed' | 'none' | 'unavailable'>
    close(): Promise<'confirmed' | 'unavailable'>
    inspect(): Promise<readonly RetainedResourceFact[] | null>
  }>

const creatorOf = (creator: EnvironmentState): RetainedCreator => ({
  call: creator.preparation.call,
  operation: creator.preparation.operation,
  original: canonicalDigest(creator.original),
})

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
    async stopped(key, status) {
      if (!(await binding())) return 'unavailable'
      const current = await input.state.readRetention(input.address, input.scope)
      if ('failure' in current) return 'unavailable'
      const held = current.ok?.resources.find(item => item.resource.key === key)
      return held ? stopHeld(held, key, status) : stopOwn(key, status)
    },
    ended: key => input.state.readEnded(input.address, input.scope, key),
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
