import {
  managedResourceSchema,
  type ManagedResource,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import {
  environmentFailure,
  type EnvironmentAddress,
  type EnvironmentStateStore,
  type ResourceFact,
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
    if ((await input.authorize()) !== 'authorized') return 'unavailable'
    const result = await input.state.update(input.address, state => {
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
    })
    if ('ok' in result) return 'confirmed'
    const current = await inspectState()
    return 'ok' in current && current.ok?.closed ? 'closed' : 'unavailable'
  }

  const ledger: EnvironmentResourceLedger = {
    closed: controller.signal,
    async plan(resource: ManagedResource) {
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
