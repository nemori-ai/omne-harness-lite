import {
  managedResourceSchema,
  type ManagedResource,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import {
  closedRetention,
  createdBy,
  environmentFailure,
  retentionEntries,
  scopeOwned,
  type EnvironmentAddress,
  type EnvironmentStateStore,
  type EnvironmentState,
  type ResourceFact,
  type ResourceStop,
  type RetainedCreator,
  type RetainedResourceFact,
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
          ? succeed({ ...state, closed: true })
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
     * from the commit that confirmed its stop until the scope is released, `none` before and
     * after, `unavailable` when the end fact cannot be read.
     */
    ended(key: string): Promise<'confirmed' | 'none' | 'unavailable'>
    close(): Promise<'confirmed' | 'unavailable'>
    inspect(): Promise<readonly RetainedResourceFact[] | null>
  }>

/** The distinct creators of `entries`. */
function creatorsOf(entries: readonly RetainedResourceFact[]): readonly RetainedCreator[] {
  const seen = new Map<string, RetainedCreator>()
  for (const entry of entries)
    seen.set(JSON.stringify([entry.creator.call, entry.creator.operation]), entry.creator)
  return [...seen.values()]
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
  if ('ok' in initial && initial.ok && initial.ok.phase !== 'open') controller.abort()
  const creator = (bound: EnvironmentState): RetainedCreator => ({
    call: bound.preparation.call,
    operation: bound.preparation.operation,
    original: canonicalDigest(bound.original),
  })
  const owns = (item: RetainedResourceFact, key: string) =>
    item.resource.key === key && boundOriginal !== null && createdBy(item.creator, boundOriginal)
  const ledger: RetainedTerminalLedgerView = {
    closed: controller.signal,
    async plan(resource) {
      const bound = await binding()
      if (!bound) return 'unavailable'
      if (controller.signal.aborted || bound.closed) return 'closed'
      const checked = await managedResourceSchema['~standard'].validate(resource)
      if (checked.issues) return 'unavailable'
      const result = await input.state.updateRetention(input.address, input.scope, state => {
        if (state && state.phase !== 'open') return fail({ kind: 'not-settled' })
        const resources = retentionEntries(state)
        const existing = resources.find(item => owns(item, checked.value.key))
        if (existing && canonicalDigest(existing.resource) !== canonicalDigest(checked.value))
          return fail({ kind: 'conflict', operation: input.address.operation })
        return succeed({
          phase: 'open',
          scope: input.scope,
          resources: existing
            ? resources
            : [
                ...resources,
                {
                  creator: creator(bound),
                  resource: checked.value,
                  permitted: false,
                  adopted: false,
                  stop: 'active',
                },
              ],
        })
      })
      if ('ok' in result) return 'recorded'
      if (result.failure.kind === 'conflict') return 'conflict'
      if (result.failure.kind === 'not-settled') {
        controller.abort()
        return 'closed'
      }
      return 'unavailable'
    },
    async permit(key) {
      const bound = await binding()
      if (!bound) return 'unavailable'
      const result = await input.state.updateRetention(
        input.address,
        input.scope,
        state => {
          if (!state) return environmentFailure('retained resource has no durable plan')
          if (state.phase !== 'open') return fail({ kind: 'not-settled' })
          if (!state.resources.some(item => owns(item, key)))
            return environmentFailure('retained resource has no active durable plan')
          return succeed({
            ...state,
            resources: state.resources.map(item =>
              owns(item, key) ? { ...item, permitted: true } : item,
            ),
          })
        },
        input.authorize,
      )
      if ('ok' in result) return 'confirmed'
      return result.failure.kind === 'not-settled' ? 'closed' : 'unavailable'
    },
    /**
     * The handover commit. A key this call already adopted answers `confirmed` without a write, so a
     * repeated `adopt` is the query for a lost answer. Otherwise one commit of the scope's record
     * adopts the reservation, asserting the acquisition and the original call unchanged; the
     * acquisition then shows the key as `handedOver`. A closed scope, a closed acquisition and a
     * settled original call answer `closed`.
     */
    async adopt(key) {
      const bound = await binding()
      if (!bound) return 'unavailable'
      const prior = await input.state.readRetention(input.address, input.scope)
      if ('failure' in prior) return 'unavailable'
      if (retentionEntries(prior.ok).some(item => owns(item, key) && item.adopted))
        return 'confirmed'
      if (prior.ok && prior.ok.phase !== 'open') return 'closed'
      const result = await input.state.handOver(
        input.address,
        input.scope,
        (acquisition, retention) => {
          if (!retention) return environmentFailure('retained process has no durable reservation')
          if (retention.phase !== 'open') return fail({ kind: 'not-settled' })
          if (!retention.resources.some(item => owns(item, key)))
            return environmentFailure('retained process has no active reservation')
          const handed = acquisition.resources.find(item => item.resource.key === key)
          if (!handed || handed.stop === 'confirmed')
            return environmentFailure('acquisition has no live fact for the handed-over resource')
          return succeed({
            ...retention,
            resources: retention.resources.map(item =>
              owns(item, key) ? { ...item, permitted: true, adopted: true } : item,
            ),
          })
        },
        input.authorize,
      )
      if ('ok' in result) return 'confirmed'
      return result.failure.kind === 'not-settled' ? 'closed' : 'unavailable'
    },
    /**
     * A key the scope took over belongs to the retention scope, so any view of the scope records
     * its stop: after a provider restart no view of the creating call exists. A reservation the
     * scope did not take over stays the creating call's. A confirmed stop ends the scope's hold:
     * the entry is removed, a process's end fact is kept in the same commit, and a closed scope
     * that holds nothing more loses its record and its end facts.
     */
    async stopped(key, status) {
      const bound = await binding()
      if (!bound) return 'unavailable'
      const records = (item: RetainedResourceFact) =>
        scopeOwned(item) ? item.resource.key === key : owns(item, key)
      if (status === 'confirmed') {
        // The resource stopped: its creator's own fact says so too, so the creator's view does
        // not fall back to `active` once the scope no longer holds the key. The scope's commit
        // below is the one that ends the hold; this write is recorded first and asserted by it.
        const current = await input.state.readRetention(input.address, input.scope)
        if ('failure' in current) return 'unavailable'
        for (const creator of creatorsOf(retentionEntries(current.ok).filter(records))) {
          const marked = await input.state.update(
            { tenant: input.address.tenant, call: creator.call, operation: creator.operation },
            state =>
              state
                ? succeed({
                    ...state,
                    resources: state.resources.map(item =>
                      item.resource.key === key ? { ...item, stop: 'confirmed' } : item,
                    ),
                  })
                : environmentFailure('creator acquisition is missing'),
          )
          if ('failure' in marked) return 'unavailable'
        }
      }
      const result = await input.state.updateRetention(input.address, input.scope, state => {
        if (!state || state.phase === 'released' || !state.resources.some(records))
          return environmentFailure('retained resource plan is missing')
        return succeed({
          ...state,
          resources:
            status === 'confirmed'
              ? state.resources.filter(item => !records(item))
              : state.resources.map(item => (records(item) ? { ...item, stop: status } : item)),
        })
      })
      return 'ok' in result ? 'recorded' : 'unavailable'
    },
    ended: key => input.state.readEnded(input.address, input.scope, key),
    /**
     * Closes the scope: nothing is taken over any more. What it took over stays until its stop is
     * confirmed; every reservation nobody took over goes in this commit. A scope that then holds
     * nothing is released in the same commit: its record shrinks to the closed marker and its end
     * facts are deleted. Closing a closed or released scope changes nothing.
     */
    async close() {
      if (!(await binding())) return 'unavailable'
      const result = await input.state.updateRetention(input.address, input.scope, state =>
        succeed(closedRetention(input.scope, state)),
      )
      if ('failure' in result) return 'unavailable'
      controller.abort()
      return 'confirmed'
    },
    async inspect() {
      const result = await input.state.readRetention(input.address, input.scope)
      if ('failure' in result) return null
      if (result.ok && result.ok.phase !== 'open') controller.abort()
      return retentionEntries(result.ok).filter(
        item =>
          item.creator.call === input.address.call &&
          item.creator.operation === input.address.operation,
      )
    },
  }
  return Object.freeze(ledger)
}
