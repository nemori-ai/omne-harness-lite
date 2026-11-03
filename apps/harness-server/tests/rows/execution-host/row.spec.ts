import { mkdtemp, realpath, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
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
import { rowDeclarationOf } from '../../../src/row.ts'

afterEach(() => vi.useRealTimers())

it('keeps the maintenance field outside member config and requires native absolute roots', async () => {
  const runtime = createHostFilesRuntime({ diagnose: vi.fn() })
  try {
    const binding = createExecutionHostBinding(runtime)
    const root = process.platform === 'win32' ? 'C:/files' : '/files'
    const config = { filesRoot: root, stateDirectory: `${root}/state`, drainBoundMs: 7 }
    expect(binding.parseConfig(config)).toEqual({ maintainIntervalMs: 60000, member: config })
    expect(binding.parseConfig({ ...config, maintainIntervalMs: 23 })).toEqual({
      maintainIntervalMs: 23,
      member: config,
    })
    for (const invalid of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])
      expect(() => binding.parseConfig({ ...config, maintainIntervalMs: invalid })).toThrow(
        'invalid execution-host configuration',
      )
    for (const invalid of [
      {},
      { ...config, filesRoot: 'relative' },
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
    const config = { filesRoot: directory, stateDirectory: directory }
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
    // Both platforms read the original bytes. The win32 branch that expected rejected/unavailable
    // went stale when L-TOOL delivered the Windows files backend (67450f08c, 3f82f5bbc); consumer
    // migration by Reduce per R2-D142 item 11. The Windows backend returns a Buffer, which is a
    // Uint8Array, so the bytes are compared as a plain Uint8Array view.
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
