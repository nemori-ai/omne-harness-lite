import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { executionEnvironmentKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import { createHostFilesDomain } from '@omne-harness/execution-environment-host-local'
import {
  ExecutionEnvironmentRegistry,
  createHostFilesPlugin,
  hostScreen,
  screenFacilityPlugin,
} from '@omne-harness/execution-environment-host-local/cordis'
import { scriptedScreenPng } from '@omne-harness/execution-environment-contract/testing'
import type { ScreenBackend } from '@omne-harness/screen'
import { testPorts } from './ports.ts'

const backend: ScreenBackend = {
  name: 'fixture',
  verification: 'contract-suite',
  permission: async () => 'satisfied',
  list: async () => [
    {
      id: 'only',
      name: 'Only',
      primary: true,
      pixels: { width: 8, height: 4 },
      scale: 1,
      origin: { x: 0, y: 0 },
    },
  ],
  capture: async () => ({ png: scriptedScreenPng(8, 4), width: 8, height: 4 }),
}

async function world(screen?: ScreenBackend) {
  const tenant = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrs',
      account: 'acc_0123456789abcdefghjkmnpqrs',
    }),
  )
  const scope = decodeScopeRef({ ref: 'screen-cordis' })
  if (!tenant.ok || !('ok' in scope)) throw new Error('identity fixture')
  const ctx = new Context()
  await testPorts(tenant.value).load(ctx)
  await ctx.plugin(ExecutionEnvironmentRegistry)
  const plugin = createHostFilesPlugin(createHostFilesDomain())
  const host = await ctx.plugin({
    name: plugin.name,
    inject: plugin.inject,
    apply: (inner: Context) => plugin.apply(inner, {}, screen === undefined ? {} : { screen }),
  })
  const service = ctx.get(executionEnvironmentKey)
  if (service === undefined) throw new Error('service missing')
  const placement = () =>
    service.resolvePlacement(
      { principal: 'test', tenant: tenant.value },
      {
        scope: scope.ok,
        requirement: {
          allowedBindings: [{ kind: 'host_machine' }],
          facilities: ['screen'],
          isolation: [],
        },
      },
    )
  return { ctx, host, placement }
}

it('a placement that needs the screen resolves while the declaration is there and the host offers it', async () => {
  const { ctx, host, placement } = await world(backend)
  try {
    expect(await placement()).toMatchObject({ kind: 'rejected', reason: 'missingFacility' })
    const declaration = await ctx.plugin(screenFacilityPlugin)
    expect(await placement()).toMatchObject({ kind: 'placement', provider: { name: 'host-files' } })
    await declaration.dispose()
    expect(await placement()).toMatchObject({ kind: 'rejected', reason: 'missingFacility' })
  } finally {
    await host.dispose()
  }
})

it('on a host that offers no screen the placement is unqualified, with the declaration there', async () => {
  const { ctx, host, placement } = await world()
  try {
    await ctx.plugin(screenFacilityPlugin)
    expect(await placement()).toMatchObject({ kind: 'rejected', reason: 'missingFacility' })
  } finally {
    await host.dispose()
  }
})

it('asks the system of this host for its backend: none on a system that has none', async () => {
  expect(await hostScreen('freebsd')).toEqual({
    kind: 'absent',
    reason: 'this system has no screen backend',
  })
})
