import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
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
    if (result.kind !== 'registered') return result
    if (closed) {
      await result.handle.dispose()
      return { kind: 'rejected', reason: 'closed' }
    }
    handle = result.handle
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
    inForce.clear()
    await starting?.catch(() => undefined)
    await handle?.dispose()
  }

  return Object.freeze({ start, publish, close })
}

export type WorkingDirectoryPublisher = ReturnType<typeof createWorkingDirectoryPublisher<unknown>>
