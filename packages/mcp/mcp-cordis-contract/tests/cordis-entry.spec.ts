import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import {
  ActionDiscoveryService,
  ActionInvokerService,
  AdoptionViewService,
  CredentialUseService,
  EndpointStatusService,
  ProcessLandingService,
  UseEligibilityService,
  mcpActionDiscoveryKey,
  mcpActionInvokerKey,
  mcpAdoptionViewKey,
  mcpCredentialUseKey,
  mcpEndpointStatusKey,
  mcpProcessLandingKey,
  mcpUseEligibilityKey,
} from '@omne-harness/mcp-cordis-contract/cordis'

const KEYS = [
  [ActionDiscoveryService, mcpActionDiscoveryKey, 'mcpActionDiscovery'],
  [ActionInvokerService, mcpActionInvokerKey, 'mcpActionInvoker'],
  [EndpointStatusService, mcpEndpointStatusKey, 'mcpEndpointStatus'],
  [AdoptionViewService, mcpAdoptionViewKey, 'mcpAdoptionView'],
  [UseEligibilityService, mcpUseEligibilityKey, 'mcpUseEligibility'],
  [CredentialUseService, mcpCredentialUseKey, 'mcpCredentialUse'],
  [ProcessLandingService, mcpProcessLandingKey, 'mcpProcessLanding'],
] as const

it('writes each service key once, on its abstract Service, and exports a constant equal to it', () => {
  for (const [service, key, name] of KEYS) {
    expect(service.provide).toBe(name)
    expect(key).toBe(service.provide)
  }
})

it('gives the seven services seven different keys', () => {
  expect(new Set(KEYS.map(([, key]) => key)).size).toBe(7)
})

it('exports exactly the seven abstract Service classes and the seven key constants', async () => {
  const cordis: Record<string, unknown> = await import('@omne-harness/mcp-cordis-contract/cordis')
  expect(Object.keys(cordis).sort()).toEqual([
    'ActionDiscoveryService',
    'ActionInvokerService',
    'AdoptionViewService',
    'CredentialUseService',
    'EndpointStatusService',
    'ProcessLandingService',
    'UseEligibilityService',
    'mcpActionDiscoveryKey',
    'mcpActionInvokerKey',
    'mcpAdoptionViewKey',
    'mcpCredentialUseKey',
    'mcpEndpointStatusKey',
    'mcpProcessLandingKey',
    'mcpUseEligibilityKey',
  ])
})

/** The body of every method of the subclasses below: the table only loads them. */
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
class Landing extends ProcessLandingService<unknown> {
  start() {
    return notCalled()
  }
}

const LOADABLE = [
  ['ActionDiscoveryService', Discovery, mcpActionDiscoveryKey],
  ['ActionInvokerService', Invoker, mcpActionInvokerKey],
  ['EndpointStatusService', Status, mcpEndpointStatusKey],
  ['AdoptionViewService', Adoption, mcpAdoptionViewKey],
  ['UseEligibilityService', Eligibility, mcpUseEligibilityKey],
  ['CredentialUseService', Credentials, mcpCredentialUseKey],
  ['ProcessLandingService', Landing, mcpProcessLandingKey],
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
