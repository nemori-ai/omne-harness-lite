import {
  managedResourceSchema,
  type ManagedResource,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import {
  environmentFailure,
  type EnvironmentAddress,
  type EnvironmentStateStore,
  type EnvironmentState,
  type ResourceFact,
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
        if (!found || found.stop === 'confirmed')
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
            item.resource.key === key
              ? { ...item, stop: item.stop === 'confirmed' ? 'confirmed' : status }
              : item,
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
export type RetainedTerminalLedgerView = Pick<
  ResourceLedger,
  'closed' | 'plan' | 'permit' | 'stopped'
> &
  Readonly<{
    close(): Promise<'confirmed' | 'unavailable'>
    inspect(): Promise<readonly RetainedResourceFact[] | null>
  }>

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
  if ('ok' in initial && initial.ok?.closed) controller.abort()
  const owns = (item: RetainedResourceFact, key: string) =>
    item.resource.key === key &&
    item.creator.call === input.address.call &&
    item.creator.operation === input.address.operation &&
    boundOriginal !== null &&
    canonicalDigest(item.original) === canonicalDigest(boundOriginal.original)
  const ledger: RetainedTerminalLedgerView = {
    closed: controller.signal,
    async plan(resource) {
      const bound = await binding()
      if (!bound) return 'unavailable'
      if (controller.signal.aborted) return 'closed'
      const checked = await managedResourceSchema['~standard'].validate(resource)
      if (checked.issues) return 'unavailable'
      const result = await input.state.updateRetention(input.address, input.scope, state => {
        if (state?.closed) return fail({ kind: 'not-settled' })
        const resources = state?.resources ?? []
        const existing = resources.find(item => owns(item, checked.value.key))
        if (existing && canonicalDigest(existing.resource) !== canonicalDigest(checked.value))
          return fail({ kind: 'conflict', operation: input.address.operation })
        return succeed({
          scope: input.scope,
          closed: false,
          resources: existing
            ? resources
            : [
                ...resources,
                {
                  creator: bound.preparation,
                  original: bound.original,
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
          if (state.closed) return fail({ kind: 'not-settled' })
          const found = state.resources.find(item => owns(item, key))
          if (!found || found.stop === 'confirmed')
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
    async stopped(key, status) {
      const bound = await binding()
      if (!bound) return 'unavailable'
      const result = await input.state.updateRetention(input.address, input.scope, state => {
        if (!state || !state.resources.some(item => owns(item, key)))
          return environmentFailure('retained resource plan is missing')
        return succeed({
          ...state,
          resources: state.resources.map(item =>
            owns(item, key)
              ? { ...item, stop: item.stop === 'confirmed' ? 'confirmed' : status }
              : item,
          ),
        })
      })
      return 'ok' in result ? 'recorded' : 'unavailable'
    },
    async close() {
      if (!(await binding())) return 'unavailable'
      const result = await input.state.updateRetention(input.address, input.scope, state =>
        succeed({ scope: input.scope, closed: true, resources: state?.resources ?? [] }),
      )
      if ('failure' in result) return 'unavailable'
      controller.abort()
      return 'confirmed'
    },
    async inspect() {
      const result = await input.state.readRetention(input.address, input.scope)
      if ('failure' in result) return null
      if (result.ok?.closed) controller.abort()
      return (
        result.ok?.resources.filter(
          item =>
            item.creator.call === input.address.call &&
            item.creator.operation === input.address.operation,
        ) ?? []
      )
    },
  }
  return Object.freeze(ledger)
}
