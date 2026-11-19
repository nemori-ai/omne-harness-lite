import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type {
  ProducerHandle,
  ProducerRegistration,
  RegisterProducerResult,
  ScopeRef,
  SupplyAnswer,
  SupplyInput,
} from '@omne-harness/runtime-context-contract'
import type { WorkingDirectory } from '../working-directory-schema.ts'
import { workingDirectoryDescriptor, workingDirectoryProducer } from './working-directory-block.ts'

type Key = 'session.working-directory'
type Registration = RegisterProducerResult<Key>

export type WorkingDirectoryPublisherInput<P> = Readonly<{
  tenant: TenantId
  principal: P
  runtime: {
    registerProducer(principal: P, input: ProducerRegistration<Key, P>): Promise<Registration>
  }
}>

export type DirectoryPublication =
  | Readonly<{ kind: 'published' | 'unregistered' | 'closed' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** Publishes what a step boundary decided. It supplies only what it published in this process. */
export function createWorkingDirectoryPublisher<P>(input: WorkingDirectoryPublisherInput<P>) {
  const inForce = new Map<string, WorkingDirectory>()
  let closed = false
  let handle: ProducerHandle<Key> | undefined
  let starting: Promise<Registration> | undefined

  async function supply(request: SupplyInput<P>): Promise<SupplyAnswer<WorkingDirectory>> {
    if (closed) return { kind: 'unavailable' }
    if (!tenantEquals(request.tenant, input.tenant)) return { kind: 'refused' }
    const value = inForce.get(request.scope.ref)
    return value === undefined ? { kind: 'unavailable' } : { kind: 'value', value }
  }

  async function register(): Promise<Registration> {
    const result = await input.runtime.registerProducer(input.principal, {
      key: 'session.working-directory',
      tenant: input.tenant,
      producer: workingDirectoryProducer,
      declaration: workingDirectoryDescriptor,
      scoped: true,
      supply,
    })
    if (result.kind === 'registered') handle = result.handle
    return result
  }

  function start(): Promise<Registration> {
    if (closed) return Promise.resolve({ kind: 'rejected', reason: 'closed' })
    if (handle !== undefined) return Promise.resolve({ kind: 'registered', handle })
    starting ??= register().finally(() => {
      starting = undefined
    })
    return starting
  }

  async function publish(scope: ScopeRef, value: WorkingDirectory): Promise<DirectoryPublication> {
    const registered = await start()
    if (closed) return { kind: 'closed' }
    if (registered.kind !== 'registered')
      return { kind: 'unavailable', diagnostic: `the producer registration is ${registered.kind}` }
    if (JSON.stringify(inForce.get(scope.ref)) === JSON.stringify(value))
      return { kind: 'published' }
    const result = await registered.handle.publish({ scope, tenant: input.tenant, value })
    if (result.kind === 'published') {
      inForce.set(scope.ref, value)
      return { kind: 'published' }
    }
    if (result.kind === 'rejected' && result.reason === 'scope-unregistered')
      return { kind: 'unregistered' }
    const reason = 'reason' in result ? `: ${result.reason}` : ''
    return { kind: 'unavailable', diagnostic: `the publication was ${result.kind}${reason}` }
  }

  async function close(): Promise<void> {
    closed = true
    await starting?.catch(() => undefined)
    await handle?.dispose()
  }

  return Object.freeze({ start, publish, close })
}

export type WorkingDirectoryPublishersInput<P> = Readonly<{
  /** The principal the tenant's producer registers and publishes as. Undefined: it cannot be issued. */
  principal(tenant: TenantId): P | undefined
  runtime: WorkingDirectoryPublisherInput<P>['runtime']
}>

/** One publisher for each tenant, made when the tenant's first boundary needs it. */
export function createWorkingDirectoryPublishers<P>(input: WorkingDirectoryPublishersInput<P>) {
  const publishers = new Map<string, ReturnType<typeof createWorkingDirectoryPublisher<P>>>()
  let closed = false

  function publisherOf(tenant: TenantId) {
    const encoded = tenantCodec.encode(tenant)
    if (!encoded.ok) return undefined
    const existing = publishers.get(encoded.value)
    if (existing !== undefined) return existing
    const principal = input.principal(tenant)
    if (principal === undefined) return undefined
    const created = createWorkingDirectoryPublisher<P>({
      tenant,
      principal,
      runtime: input.runtime,
    })
    publishers.set(encoded.value, created)
    return created
  }

  return Object.freeze({
    async publish(
      tenant: TenantId,
      scope: ScopeRef,
      value: WorkingDirectory,
    ): Promise<DirectoryPublication> {
      if (closed) return { kind: 'closed' }
      const publisher = publisherOf(tenant)
      return publisher === undefined
        ? { kind: 'unavailable', diagnostic: 'the tenant has no working directory publisher' }
        : publisher.publish(scope, value)
    },
    async close(): Promise<void> {
      closed = true
      await Promise.all([...publishers.values()].map(publisher => publisher.close()))
    },
  })
}
