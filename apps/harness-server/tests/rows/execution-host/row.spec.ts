import { mkdtemp, realpath, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  originRef,
  type EnvironmentProvider,
  type ProviderAcquireInput,
} from '@omne-harness/execution-environment-contract'
import { ExecutionEnvironmentRegistry } from '@omne-harness/execution-environment-host-local/cordis'
import { hostObjectToken } from '@omne-harness/execution-environment-host-local'
import { createHostFilesRuntime } from '../../../src/host-files.ts'
import { createExecutionHostBinding } from '../../../src/rows/execution-host/index.ts'
import { hostOffers } from '../../../src/rows/execution-host/offers.ts'
import { rowDeclarationOf } from '../../../src/row.ts'

afterEach(() => vi.useRealTimers())

it('keeps the maintenance field outside member config and requires native absolute roots', async () => {
  const runtime = createHostFilesRuntime({ diagnose: vi.fn() })
  try {
    const binding = createExecutionHostBinding(runtime)
    const root = process.platform === 'win32' ? 'C:/files' : '/files'
    const config = { stateDirectory: `${root}/state`, drainBoundMs: 7 }
    expect(binding.parseConfig(config)).toEqual({
      maintainIntervalMs: 60000,
      screen: true,
      member: config,
    })
    expect(binding.parseConfig({ ...config, maintainIntervalMs: 23, screen: false })).toEqual({
      maintainIntervalMs: 23,
      screen: false,
      member: config,
    })
    expect(() => binding.parseConfig({ ...config, screen: 'yes' })).toThrow(
      'invalid execution-host configuration',
    )
    for (const invalid of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])
      expect(() => binding.parseConfig({ ...config, maintainIntervalMs: invalid })).toThrow(
        'invalid execution-host configuration',
      )
    for (const invalid of [
      {},
      { ...config, filesRoot: root },
      { ...config, stateDirectory: 'relative' },
      { ...config, extra: true },
    ])
      expect(() => binding.parseConfig(invalid)).toThrow('invalid execution-host configuration')
    expect(rowDeclarationOf(binding.plugin)).toMatchObject({
      row: 'execution-host',
      implementation: 'real',
      manifest: { provides: [] },
      lifecycle: { kind: 'none' },
    })
  } finally {
    await runtime.close()
  }
})

it('reuses the original acquisition history when a real Cordis factory row reloads', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'app-host-reload-')))
  const runtime = createHostFilesRuntime({ diagnose: vi.fn() })
  const providers: EnvironmentProvider[] = []
  class Registry extends ExecutionEnvironmentRegistry<unknown> {
    protected override onRegisterProvider(provider: EnvironmentProvider) {
      providers.push(provider)
      return super.onRegisterProvider(provider)
    }
  }
  const root = new Context()
  try {
    await root.plugin(Registry)
    const { plugin } = createExecutionHostBinding(runtime)
    const config = { stateDirectory: directory }
    const first = await root.plugin(plugin, config)
    const old = providers[0]
    if (old === undefined) throw new Error('provider was not registered')
    const parsed = tenantCodec.parse(
      JSON.stringify({
        organization: 'org_0123456789abcdefghjkmnpqrs',
        account: 'acc_0123456789abcdefghjkmnpqrs',
      }),
    )
    if (!parsed.ok) throw new Error('invalid fixture tenant')
    const scopeText = 'host-reload'
    function isScope(value: string): value is ProviderAcquireInput['scope']['ref'] {
      return value.length > 0
    }
    if (!isScope(scopeText)) throw new Error('invalid fixture scope')
    const input: ProviderAcquireInput = {
      tenant: parsed.value,
      acquisition: acquisitionRef('before-reload'),
      origin: originRef('call'),
      scope: { ref: scopeText },
      placement: {
        kind: 'placement',
        requirement: {
          allowedBindings: [{ kind: 'host_machine' }],
          facilities: ['files'],
          isolation: [],
        },
        binding: { kind: 'host_machine' },
        provider: { name: old.name, generation: old.generation, version: old.version },
        continuity: { kind: 'not_guaranteed' },
        quotaDomain: old.quotaDomain,
      },
      ledger: {
        closed: new AbortController().signal,
        plan: async () => 'recorded',
        permit: async () => 'confirmed',
        adopt: async () => 'confirmed',
        stopped: async () => 'recorded',
      },
    }
    const acquired = await old.acquire(input)
    if (acquired.kind !== 'acquired') throw new Error('expected acquisition')
    const files = acquired.lease.facility('files')
    if (files === undefined) throw new Error('expected files facility')
    const path = join(directory, 'inside.txt')
    await writeFile(path, 'kept')
    const read = await files.read({
      requestId: 'inside',
      access: { tenant: parsed.value, principal: 'fixture' },
      origin: input.origin,
      binding: { kind: 'host_machine' },
      path,
      named: await hostObjectToken(path),
    })
    if (read.kind !== 'done') throw new Error(`expected done, got ${JSON.stringify(read)}`)
    expect(read.value.bytes).toBeInstanceOf(Uint8Array)
    expect(new Uint8Array(read.value.bytes)).toEqual(new TextEncoder().encode('kept'))
    expect(await readFile(path, 'utf8')).toBe('kept')
    await first.dispose()
    await root.plugin(plugin, config)
    const fresh = providers[1]
    if (fresh === undefined) throw new Error('new provider was not registered')
    expect(fresh.generation).not.toBe(old.generation)
    expect(await fresh.inspectAcquisition(input)).toEqual({ kind: 'settled' })
    expect(await old.acquire(input)).toMatchObject({
      kind: 'rejected',
      reason: 'providerUnavailable',
    })
  } finally {
    await runtime.close()
    await root.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})

describe('whether the host row offers the screen facility', () => {
  const backend = {
    name: 'fixture',
    verification: 'contract-suite' as const,
    permission: async () => 'satisfied' as const,
    list: async () => [],
    capture: async () => 'not-found' as const,
  }
  async function loaded(
    choose: () => Promise<
      { kind: 'offered'; backend: typeof backend } | { kind: 'absent'; reason: string }
    >,
    config: object = {},
  ) {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'app-host-screen-')))
    const runtime = createHostFilesRuntime({ diagnose: vi.fn() })
    const providers: EnvironmentProvider[] = []
    class Registry extends ExecutionEnvironmentRegistry<unknown> {
      protected override onRegisterProvider(provider: EnvironmentProvider) {
        providers.push(provider)
        return super.onRegisterProvider(provider)
      }
    }
    const root = new Context()
    await root.plugin(Registry)
    const { plugin } = createExecutionHostBinding(runtime, { screen: choose })
    const fiber = await root.plugin(plugin, { stateDirectory: directory, ...config })
    return {
      root,
      fiber,
      facilities: providers.at(-1)?.facilities,
      async close() {
        await runtime.close()
        await root.fiber.dispose()
        await rm(directory, { recursive: true, force: true })
      },
    }
  }

  it('offers it when the system has a backend: the provider lists it, and the application knows', async () => {
    const world = await loaded(async () => ({ kind: 'offered', backend }))
    try {
      expect(world.facilities).toEqual(['files', 'command', 'terminal', 'screen'])
      expect([...(hostOffers(world.root) ?? [])]).toEqual(world.facilities)
      await world.fiber.dispose()
      expect(hostOffers(world.root)).toBeUndefined()
    } finally {
      await world.close()
    }
  })

  it('offers none where the system has no backend', async () => {
    const world = await loaded(async () => ({ kind: 'absent', reason: 'no display' }))
    try {
      expect(world.facilities).toEqual(['files', 'command', 'terminal'])
      expect([...(hostOffers(world.root) ?? [])]).toEqual(world.facilities)
    } finally {
      await world.close()
    }
  })

  it('does not look for a backend when the operator turned the screen off', async () => {
    const choose = vi.fn(async () => ({ kind: 'offered' as const, backend }))
    const world = await loaded(choose, { screen: false })
    try {
      expect(choose).not.toHaveBeenCalled()
      expect(world.facilities).toEqual(['files', 'command', 'terminal'])
    } finally {
      await world.close()
    }
  })
})
