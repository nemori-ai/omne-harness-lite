import { mkdtemp, realpath, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  acquisitionRef,
  originRef,
  type EnvironmentProvider,
  type ProviderAcquireInput,
} from '@omne-harness/execution-environment-contract'
import { ExecutionEnvironmentRegistry } from '@omne-harness/execution-environment-host-local/cordis'
import { createHostFilesRuntime, type HostFilesRuntime } from '../../../src/host-files.ts'
import { createExecutionHostBinding } from '../../../src/rows/execution-host/index.ts'
import { rowDeclarationOf } from '../../../src/row.ts'
import type { LoadedRow } from '../../../src/readiness.ts'

export function providerInput(provider: EnvironmentProvider, key: string): ProviderAcquireInput {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrs',
      account: 'acc_0123456789abcdefghjkmnpqrs',
    }),
  )
  if (!parsed.ok) throw new Error('invalid fixture tenant')
  function isScope(value: string): value is ProviderAcquireInput['scope']['ref'] {
    return value.length > 0
  }
  const scope = 'host-files-test'
  if (!isScope(scope)) throw new Error('invalid fixture scope')
  return {
    tenant: parsed.value,
    acquisition: acquisitionRef(key),
    origin: originRef('call'),
    scope: { ref: scope },
    placement: {
      kind: 'placement',
      requirement: {
        allowedBindings: [{ kind: 'host_machine' }],
        facilities: ['files'],
        isolation: [],
      },
      binding: { kind: 'host_machine' },
      provider: { name: provider.name, generation: provider.generation, version: provider.version },
      continuity: { kind: 'not_guaranteed' },
      quotaDomain: provider.quotaDomain,
    },
    ledger: {
      closed: new AbortController().signal,
      plan: async () => 'recorded',
      permit: async () => 'confirmed',
      adopt: async () => 'confirmed',
      stopped: async () => 'recorded',
    },
  }
}

export async function hostFixture(
  runtime: HostFilesRuntime = createHostFilesRuntime({ diagnose() {} }),
) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'app-host-files-')))
  const filesRoot = join(directory, 'root')
  const stateDirectory = join(directory, 'state')
  await mkdir(filesRoot)
  await mkdir(stateDirectory)
  const providers: EnvironmentProvider[] = []
  class Registry extends ExecutionEnvironmentRegistry<unknown> {
    protected override onRegisterProvider(provider: EnvironmentProvider) {
      providers.push(provider)
      return super.onRegisterProvider(provider)
    }
  }
  const root = new Context()
  await root.plugin(Registry)
  const { plugin } = createExecutionHostBinding(runtime)
  const declaration = rowDeclarationOf(plugin)
  if (declaration === undefined) throw new Error('missing declaration')
  const { row: id, manifest } = declaration
  async function load() {
    const fiber = await root.plugin(plugin, { filesRoot, stateDirectory, drainBoundMs: 1 })
    const provider = providers.at(-1)
    if (provider === undefined) throw new Error('missing provider')
    const row: LoadedRow = { id, ctx: root, fiber, manifest, visible: [] }
    return { row, provider }
  }
  return {
    directory,
    filesRoot,
    stateDirectory,
    runtime,
    load,
    async close() {
      await runtime.close()
      await root.fiber.dispose()
      await rm(directory, { recursive: true, force: true })
    },
  }
}
