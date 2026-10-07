import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import type { ResourceLifecycle, ManagedResource } from '@omne-harness-lite/execution-environments'
import type { SessionAccess, SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import { createHostEnvironment } from '../dist/host.js'
import { defaultHostNativePolicy, type HostNativePolicy } from '../dist/native-policy.js'
import { hostStorageFixture } from './host-storage-fixture.ts'

export async function hostProviderFixture(policy: HostNativePolicy = defaultHostNativePolicy) {
  const database = await hostStorageFixture(),
    tenant = parseTenantId({ organization: 'org', account: 'alice' }),
    session = parseOpaqueIdentifier('host-session', 'SessionRef')
  if (!('ok' in tenant) || !('ok' in session)) throw new Error('Invalid host fixture scope')
  const scope = { tenant: tenant.ok, session: session.ok },
    authorization = {} as SessionAccess
  const access: SessionAccessOperations = {
    authorize: async candidate =>
      candidate === authorization
        ? {
            kind: 'authorized',
            identity: {
              binding: 'fixture',
              principal: 'alice',
              principalKind: 'human',
              scope,
              consumer: 'tool',
              contextKeys: [],
            },
          }
        : { kind: 'rejected', reason: 'notAuthorized' },
  }
  const provider = createHostEnvironment({
    name: 'real-host',
    storage: database.storage,
    access,
    policy,
  })
  const events: { kind: string; key: string }[] = [],
    resources = new Map<string, ManagedResource>()
  async function acquire(
    call: string,
    permit = true,
    customScope = scope,
    overrides: Partial<ResourceLifecycle> = {},
  ) {
    const execution = parseOpaqueIdentifier(call, 'CallId')
    if (!('ok' in execution)) throw new Error('Invalid call')
    const controller = new AbortController()
    const lifecycle: ResourceLifecycle = {
      closed: controller.signal,
      async plan(resource) {
        resources.set(resource.key, resource)
        events.push({ kind: 'planned', key: resource.key })
        return 'recorded'
      },
      async permit(key) {
        if (!resources.has(key)) throw new Error('Unplanned native GO')
        events.push({ kind: 'permitted', key })
        return permit ? 'confirmed' : 'closed'
      },
      async adopt(key) {
        if (!events.some(event => event.key === key && event.kind === 'permitted'))
          throw new Error('Unpermitted adoption')
        events.push({ kind: 'adopted', key })
        return 'confirmed'
      },
      async stopped(key, result) {
        events.push({ kind: result, key })
        return 'recorded'
      },
      ...overrides,
    }
    const result = await provider.acquire({
      scope: customScope,
      authorization,
      call: { tool: { name: 'fixture', definition: 'host-v1' }, execution: execution.ok },
      requirement: { bindingLayer: 'host_machine', facilities: ['command', 'files'] },
      placement: {
        scope: customScope,
        tool: { name: 'fixture', definition: 'host-v1' },
        execution: execution.ok,
        requirement: { bindingLayer: 'host_machine', facilities: ['command', 'files'] },
        permission: 'always-allow',
        revision: 'fixture',
        evidence: null,
      },
      resources: lifecycle,
    })
    if (result.kind !== 'acquired') throw new Error(`Host acquire ${result.reason}`)
    return { lease: result.lease, controller, lifecycle }
  }
  return {
    ...database,
    scope,
    provider,
    events,
    resources,
    acquire,
    access,
    authorization,
    async close() {
      const result = await provider.retire()
      if (result.kind !== 'drained')
        throw new Error(`Host fixture retained ${result.resources.length} resources`)
      await database.close()
    },
  }
}
