import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import {
  ENABLED_EXTENSIONS_BLOCK,
  enabledExtensionsDescriptor,
  enabledExtensionsProducer,
  type EnabledExtensionsView,
  type EnabledExtensionsViews,
} from '@omne-harness/loop-extension-contract'
import type {
  ProducerHandle,
  ProducerRegistration,
  RegisterProducerResult,
  SupplyAnswer,
  SupplyInput,
} from '@omne-harness/runtime-context-contract'

type Key = typeof ENABLED_EXTENSIONS_BLOCK
type Registration = RegisterProducerResult<Key>

export type EnabledExtensionsPublisherInput<P> = Readonly<{
  tenant: TenantId
  principal: P
  runtime: {
    registerProducer(principal: P, input: ProducerRegistration<Key, P>): Promise<Registration>
  }
  views: EnabledExtensionsViews<P>
}>

/** The producer of the block for one tenant. It keeps no value: every read asks the view. */
export function createEnabledExtensionsPublisher<P>(input: EnabledExtensionsPublisherInput<P>) {
  let closed = false
  let handle: ProducerHandle<Key> | undefined
  let starting: Promise<Registration> | undefined

  async function supply(request: SupplyInput<P>): Promise<SupplyAnswer<EnabledExtensionsView>> {
    if (closed) return { kind: 'unavailable' }
    if (!tenantEquals(request.tenant, input.tenant)) return { kind: 'refused' }
    const read = await input.views.read({ principal: request.principal, tenant: request.tenant })
    return read.kind === 'view' ? { kind: 'value', value: read.view } : { kind: 'unavailable' }
  }

  async function register(): Promise<Registration> {
    const result = await input.runtime.registerProducer(input.principal, {
      key: ENABLED_EXTENSIONS_BLOCK,
      tenant: input.tenant,
      producer: enabledExtensionsProducer,
      declaration: enabledExtensionsDescriptor,
      scoped: false,
      supply,
    })
    if (result.kind !== 'registered') return result
    if (closed) {
      await result.handle.dispose()
      return { kind: 'rejected', reason: 'closed' }
    }
    handle = result.handle
    return result
  }

  return {
    start(): Promise<Registration> {
      if (closed) return Promise.resolve({ kind: 'rejected', reason: 'closed' })
      return (starting ??= register())
    },
    async close(): Promise<void> {
      closed = true
      await starting?.catch(() => undefined)
      await handle?.dispose()
      handle = undefined
    },
  }
}
