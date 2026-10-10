import { expect, it, vi } from 'vitest'
import { createAssetEvaluator } from '@omne-harness-lite/asset-evaluation'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { readRunnerChain } from '../src/index.ts'
import {
  chainScenario,
  manifestRecord,
  tenant,
  versionFor,
  type Head,
} from './runner-chain-support.ts'

it('reads one captured head and exact versions in manifest order, then freezes the chain', async () => {
  const { input, trace } = chainScenario()
  const chain = await readRunnerChain(input)
  if ('failure' in chain) throw new Error('valid chain rejected')
  expect(chain.map(item => item.definition.name)).toEqual(['example:b', 'example:a'])
  expect(Object.isFrozen(chain)).toBe(true)
  expect(chain.every(item => Object.isFrozen(item))).toBe(true)
  expect(trace.map(item => (Array.isArray(item) ? item[0] : item))).toEqual([
    'active',
    'holding',
    'active',
    'head',
    'active',
    'version',
    'active',
    'version',
    'active',
  ])
  const requests = trace.filter(item => Array.isArray(item) && item[0] === 'version')
  expect(requests).toMatchObject([
    [
      'version',
      { session: input.session, tenant, category: 'loop_extension', asset: 'ast_b', version: 1 },
    ],
    ['version', { asset: 'ast_a', version: 1 }],
  ])
})

it.each(['session', 'logGeneration'] as const)(
  'rejects an invalid binding %s before source calls',
  async field => {
    const { input, trace } = chainScenario()
    expect(await readRunnerChain({ ...input, binding: { ...input.binding, [field]: '' } })).toEqual(
      { failure: 'invalidInput' },
    )
    expect(trace).toEqual([])
  },
)

it('keeps a different session distinct from invalid input and does not read sources', async () => {
  const { input, trace } = chainScenario()
  expect(await readRunnerChain({ ...input, session: 'different' })).toEqual({
    failure: 'manifestMissing',
  })
  expect(trace).toEqual([])
})

it.each(['sessionNotFound', 'invalidInput', 'unavailable'] as const)(
  'maps holding failure %s without a head read',
  async failure => {
    const { input, trace } = chainScenario({ holding: { failure } })
    expect(await readRunnerChain(input)).toEqual({
      failure: failure === 'sessionNotFound' ? 'manifestMissing' : 'unavailable',
    })
    expect(trace).toHaveLength(3)
  },
)

it('denies a held tenant mismatch before reading the manifest', async () => {
  const { input, trace } = chainScenario()
  expect(
    await readRunnerChain({
      ...input,
      binding: {
        ...input.binding,
        tenant: unwrap(parseTenantId({ organization: 'other', account: 'other' })),
      },
    }),
  ).toEqual({ failure: 'unavailable' })
  expect(trace).toHaveLength(3)
})

it.each([0, -1, Number.NaN, 0.5, Number.MAX_SAFE_INTEGER + 1])(
  'keeps bad or empty manifest head %s distinct',
  async head => {
    const { input } = chainScenario({ head: { head, latest: {} } })
    expect(await readRunnerChain(input)).toEqual({
      failure: head === 0 ? 'manifestMissing' : 'unavailable',
    })
  },
)

it.each([
  { failure: 'unavailable' },
  { head: 1, latest: {} },
  { head: 1, latest: { loop_extension: { ...manifestRecord(), seq: 2 } } },
] satisfies Head[])('rejects failed or incomplete current records %#', async head => {
  const { input } = chainScenario({ head })
  expect(await readRunnerChain(input)).toEqual({ failure: 'unavailable' })
})

it.each([1, 2, 3, 4, 5])('rechecks withdrawal at activity checkpoint %s', async stoppedAt => {
  let count = 0
  const { input } = chainScenario({ active: () => ++count !== stoppedAt })
  expect(await readRunnerChain(input)).toEqual({ failure: 'unavailable' })
  expect(count).toBe(stoppedAt)
})

it('does not return a partial chain when the second immutable version fails', async () => {
  let reads = 0
  const { input } = chainScenario({
    history: async request =>
      ++reads === 2 ? { failure: 'unavailable', stage: 'source' } : versionFor(request),
  })
  expect(await readRunnerChain(input)).toEqual({ failure: 'unavailable' })
  expect(reads).toBe(2)
})

it('propagates the original provider exception rather than inventing a read failure', async () => {
  const error = new Error('provider failure')
  const { input } = chainScenario({
    history: async () => {
      throw error
    },
  })
  await expect(readRunnerChain(input)).rejects.toBe(error)
})

it('captures methods and receivers before the first suspension', async () => {
  const { input } = chainScenario()
  let release: (value: { tenant: typeof tenant }) => void = () => {
    throw new Error('holding not started')
  }
  const pending = new Promise<{ tenant: typeof tenant }>(resolve => {
    release = resolve
  })
  const tenancy = {
    async holdingTenant() {
      expect(this).toBe(tenancy)
      return pending
    },
  }
  const manifest = {
    async readHead() {
      expect(this).toBe(manifest)
      return { head: 1, latest: { loop_extension: manifestRecord() } }
    },
    async dependencyPresence() {
      throw new Error('unused')
    },
  }
  const history = {
    async read(request: unknown) {
      expect(this).toBe(history)
      return versionFor(request)
    },
  }
  const result = readRunnerChain({
    ...input,
    sources: { ...input.sources, sessionTenancy: tenancy, manifest, history },
  })
  manifest.readHead = async () => {
    throw new Error('replacement head must not run')
  }
  history.read = async () => {
    throw new Error('replacement history must not run')
  }
  release({ tenant })
  expect(await result).toHaveLength(2)
})

it('uses the assembly evaluator for every fresh chain projection', async () => {
  const { input } = chainScenario()
  const owner = createAssetEvaluator()
  const judgeEffectiveAssembly = vi.fn(owner.judgeEffectiveAssembly)
  const supplied = { ...input, evaluator: { ...owner, judgeEffectiveAssembly } }
  const first = await readRunnerChain(supplied)
  expect(Array.isArray(first)).toBe(true)
  expect(await readRunnerChain(supplied)).toEqual(first)
  expect(judgeEffectiveAssembly).toHaveBeenCalledTimes(2)
  const rejected = { ...supplied, evaluator: { ...owner, judgeEffectiveAssembly: () => false } }
  expect(await readRunnerChain(rejected)).toEqual({ failure: 'unavailable' })
})
