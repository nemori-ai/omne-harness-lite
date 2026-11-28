import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import {
  ActionDiscoveryService,
  ActionInvokerService,
  AdoptionViewService,
  CredentialUseService,
  EndpointStatusService,
  UseEligibilityService,
  mcpActionDiscoveryKey,
  mcpActionInvokerKey,
  mcpAdoptionViewKey,
  mcpCredentialUseKey,
  mcpEndpointStatusKey,
  mcpUseEligibilityKey,
} from '@omne-harness/mcp-cordis-contract/cordis'

const KEYS = [
  [ActionDiscoveryService, mcpActionDiscoveryKey, 'mcpActionDiscovery'],
  [ActionInvokerService, mcpActionInvokerKey, 'mcpActionInvoker'],
  [EndpointStatusService, mcpEndpointStatusKey, 'mcpEndpointStatus'],
  [AdoptionViewService, mcpAdoptionViewKey, 'mcpAdoptionView'],
  [UseEligibilityService, mcpUseEligibilityKey, 'mcpUseEligibility'],
  [CredentialUseService, mcpCredentialUseKey, 'mcpCredentialUse'],
] as const

it('writes each service key once, on its abstract Service, and exports a constant equal to it', () => {
  for (const [service, key, name] of KEYS) {
    expect(service.provide).toBe(name)
    expect(key).toBe(service.provide)
  }
})

it('gives the six services six different keys', () => {
  expect(new Set(KEYS.map(([, key]) => key)).size).toBe(6)
})

it('exports exactly the twenty-one abstract Service classes, the twenty-one key constants and the point of the category', async () => {
  const cordis: Record<string, unknown> = await import('@omne-harness/mcp-cordis-contract/cordis')
  expect(Object.keys(cordis).sort()).toEqual([
    'ActionDiscoveryService',
    'ActionInvokerService',
    'AdoptionViewService',
    'AuthorizationRecordsService',
    'CallbackReceiverService',
    'CatalogStoreService',
    'ContinuationRecordsService',
    'CredentialUseService',
    'EndpointConnectService',
    'EndpointStatusService',
    'EventCatalogStoreService',
    'EventConsumerService',
    'EventRecordsService',
    'EventSubscriptionsService',
    'GrantConnectorService',
    'HoldingRowsService',
    'PeerSkillsService',
    'SkillCatalogStoreService',
    'TaskRecordsService',
    'TaskWatchService',
    'UseEligibilityService',
    'mcpActionDiscoveryKey',
    'mcpActionInvokerKey',
    'mcpAdoptionViewKey',
    'mcpAuthorizationRecordsKey',
    'mcpCallbackReceiverKey',
    'mcpCatalogStoreKey',
    'mcpContinuationRecordsKey',
    'mcpCredentialUseKey',
    'mcpEndpointConnectKey',
    'mcpEndpointStatusKey',
    'mcpEndpointsPoint',
    'mcpEventCatalogStoreKey',
    'mcpEventConsumerKey',
    'mcpEventRecordsKey',
    'mcpEventSubscriptionsKey',
    'mcpGrantConnectorKey',
    'mcpHoldingRowsKey',
    'mcpPeerSkillsKey',
    'mcpSkillCatalogStoreKey',
    'mcpTaskRecordsKey',
    'mcpTaskWatchKey',
    'mcpUseEligibilityKey',
  ])
})

function notCalled(): never {
  throw new Error('the table loads the subclass and calls none of its methods')
}

class Discovery extends ActionDiscoveryService<unknown> {
  current() {
    return notCalled()
  }
  refresh() {
    return notCalled()
  }
  peer() {
    return notCalled()
  }
  eventTypes() {
    return notCalled()
  }
  skills() {
    return notCalled()
  }
}
class Invoker extends ActionInvokerService<unknown> {
  invoke() {
    return notCalled()
  }
  continueWithInput() {
    return notCalled()
  }
  cancel() {
    return notCalled()
  }
  queryTask() {
    return notCalled()
  }
  taskResult() {
    return notCalled()
  }
  provideTaskInput() {
    return notCalled()
  }
  cancelTask() {
    return notCalled()
  }
}
class Status extends EndpointStatusService<unknown, unknown> {
  inspect() {
    return notCalled()
  }
  list() {
    return notCalled()
  }
  subscribe() {
    return () => undefined
  }
}
class Adoption extends AdoptionViewService<unknown, unknown> {
  endpoints() {
    return notCalled()
  }
  endpoint() {
    return notCalled()
  }
}
class Eligibility extends UseEligibilityService<unknown> {
  check() {
    return notCalled()
  }
}
class Credentials extends CredentialUseService<unknown> {
  readonly acquire: CredentialUseService<unknown>['acquire'] = notCalled
}

const LOADABLE = [
  ['ActionDiscoveryService', Discovery, mcpActionDiscoveryKey],
  ['ActionInvokerService', Invoker, mcpActionInvokerKey],
  ['EndpointStatusService', Status, mcpEndpointStatusKey],
  ['AdoptionViewService', Adoption, mcpAdoptionViewKey],
  ['UseEligibilityService', Eligibility, mcpUseEligibilityKey],
  ['CredentialUseService', Credentials, mcpCredentialUseKey],
] as const

it.each(LOADABLE)(
  'provides a loaded subclass of %s under its key and removes it when the fiber unloads',
  async (_name, Sub, key) => {
    const ctx = new Context()
    const fiber = await ctx.plugin(Sub)
    expect(ctx.get(key)).toBeInstanceOf(Sub)
    await fiber.dispose()
    expect(ctx.get(key)).toBeUndefined()
  },
)
