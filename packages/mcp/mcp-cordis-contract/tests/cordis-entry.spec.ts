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

it('provides a loaded subclass under its key and removes it when the fiber unloads', async () => {
  class Eligibility extends UseEligibilityService<unknown> {
    async check() {
      return { kind: 'unknown' } as const
    }
  }
  class Credentials extends CredentialUseService<unknown> {
    readonly acquire: CredentialUseService<unknown>['acquire'] = async () => ({
      failure: 'missing',
    })
  }
  const ctx = new Context()
  const eligibility = await ctx.plugin(Eligibility)
  const credentials = await ctx.plugin(Credentials)
  expect(ctx.get(mcpUseEligibilityKey)).toBeInstanceOf(Eligibility)
  expect(ctx.get(mcpCredentialUseKey)).toBeInstanceOf(Credentials)
  await eligibility.dispose()
  await credentials.dispose()
  expect(ctx.get(mcpUseEligibilityKey)).toBeUndefined()
  expect(ctx.get(mcpCredentialUseKey)).toBeUndefined()
})
