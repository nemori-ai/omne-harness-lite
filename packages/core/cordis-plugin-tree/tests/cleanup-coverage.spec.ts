import { Context, Service } from '@deepseek-ai/cordis'
import { createAssemblyLifetime } from '@omne-harness-lite/assembly-lifecycle'
import {
  ASSEMBLY_LIFETIME_SERVICE,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import {
  composePluginTree,
  PluginTreeError,
  PluginTreePreparationError,
  PluginTreeStartError,
  type AssemblyDeclaration,
  type PluginTreePreparationCode,
} from '@omne-harness-lite/cordis-plugin-tree'
import {
  inspectPluginTree,
  loadPluginTree,
  preparePluginTree,
} from '@omne-harness-lite/cordis-plugin-tree/cordis'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { assert, describe, expect, it, vi } from 'vitest'

const secret = 'private-fixture-sentinel'
const row = (id: string, config: unknown = {}) => ({
  id,
  plugin: { package: 'provider', export: 'Managed' },
  config,
})
const declaration = (): AssemblyDeclaration => ({
  provides: [],
  requires: [],
  optional: [],
  dynamicProvides: [],
  dynamicRequires: [],
  claims: [],
})

function expectClosedError(error: Error, fields: Record<string, unknown>) {
  const expected = { rowId: undefined, layer: undefined, index: undefined, ...fields }
  expect(error.message).toBe('Plugin tree rejected')
  expect(Object.keys(error).sort()).toEqual(Object.keys(expected).sort())
  expect(error).toMatchObject(expected)
  expect(error).not.toHaveProperty('cause')
  expect(error).not.toHaveProperty('issues')
  expect(JSON.stringify(Object.getOwnPropertyDescriptors(error))).not.toContain(secret)
}

function preparationFixture(claims: AssemblyDeclaration['claims'] = []) {
  const output = { transformed: ['schema-output'] }
  const validate = vi.fn((_: unknown) => ({ value: output }))
  const Config: StandardSchemaV1 = {
    '~standard': { version: 1, vendor: 'test', validate },
  }
  const describeAssembly = vi.fn((_: unknown) => ({ ...declaration(), claims }))
  const apply = vi.fn()
  const plugin = { name: 'managed', assemblyLifecycle: 1, Config, describeAssembly, apply }
  const resolveModule = vi.fn(async (): Promise<unknown> => ({ Managed: plugin }))
  const prepare = () =>
    preparePluginTree(composePluginTree([row('a', { input: 'original' })]), {
      externalServices: [],
      resolveModule,
    })
  return { output, validate, Config, describeAssembly, apply, plugin, resolveModule, prepare }
}

async function expectPreparationFailure(
  fixture: ReturnType<typeof preparationFixture>,
  code: PluginTreePreparationCode,
  calls: { validate: number; describe: number },
) {
  const error: unknown = await fixture.prepare().catch((reason: unknown) => reason)
  assert.instanceOf(error, PluginTreePreparationError)
  expectClosedError(error, { name: 'PluginTreePreparationError', code, rowId: 'a', index: 0 })
  expect(fixture.resolveModule).toHaveBeenCalledExactlyOnceWith({
    package: 'provider',
    export: 'Managed',
  })
  expect(fixture.validate).toHaveBeenCalledTimes(calls.validate)
  expect(fixture.describeAssembly).toHaveBeenCalledTimes(calls.describe)
  expect(fixture.apply).not.toHaveBeenCalled()
}

describe('distribution data capture', () => {
  it('rejects an extra row accessor without reading its value', () => {
    let reads = 0
    const input: unknown = [
      {
        ...row('a'),
        get extra() {
          reads += 1
          return secret
        },
      },
    ]
    let error: unknown
    try {
      composePluginTree(input)
    } catch (reason) {
      error = reason
    }
    assert.instanceOf(error, PluginTreeError)
    expectClosedError(error, {
      name: 'PluginTreeError',
      code: 'invalid-tree',
      layer: 'distribution',
      index: 0,
    })
    expect(error.rowId).toBeUndefined()
    expect(reads).toBe(0)
  })

  it('rejects the second distribution row with the same id', () => {
    let error: unknown
    try {
      composePluginTree([row('a', { value: 1 }), row('a', { value: 2 })])
    } catch (reason) {
      error = reason
    }
    assert.instanceOf(error, PluginTreeError)
    expectClosedError(error, {
      name: 'PluginTreeError',
      code: 'duplicate-id',
      layer: 'distribution',
      index: 1,
      rowId: 'a',
    })
  })

  it('captures ordinary config fields and preserves distinct distribution ids in order', () => {
    const first = { extra: [1] }
    const second = { extra: [2] }
    const distribution = [row('a', first), row('b', second)]
    const tree = composePluginTree(distribution, [])
    expect(distribution).toEqual([row('a', { extra: [1] }), row('b', { extra: [2] })])
    first.extra.push(3)
    second.extra.push(4)
    expect(tree).toEqual([
      { ...row('a', { extra: [1] }), enabled: true, source: 'distribution' },
      { ...row('b', { extra: [2] }), enabled: true, source: 'distribution' },
    ])
    expect(Object.isFrozen(tree)).toBe(true)
    for (const item of tree) {
      expect(Object.isFrozen(item)).toBe(true)
      expect(Object.isFrozen(item.config)).toBe(true)
      assert(item.config !== null && typeof item.config === 'object' && 'extra' in item.config)
      expect(Object.isFrozen(item.config.extra)).toBe(true)
    }
  })
})

describe('synchronous prepared declarations', () => {
  it('rejects a plain function export without executing it', async () => {
    const fixture = preparationFixture()
    const plainFunction = vi.fn()
    fixture.resolveModule.mockResolvedValue({ Managed: plainFunction })
    await expectPreparationFailure(fixture, 'invalid-export', { validate: 0, describe: 0 })
    expect(plainFunction).not.toHaveBeenCalled()
  })

  it('rejects an unsupported Standard Schema version before validation', async () => {
    const fixture = preparationFixture()
    fixture.resolveModule.mockResolvedValue({
      Managed: {
        ...fixture.plugin,
        Config: { '~standard': { version: 2, vendor: 'test', validate: fixture.validate } },
      },
    })
    await expectPreparationFailure(fixture, 'missing-schema', { validate: 0, describe: 0 })
  })

  it('rejects a missing declaration hook before validation', async () => {
    const fixture = preparationFixture()
    fixture.resolveModule.mockResolvedValue({
      Managed: {
        name: 'managed',
        assemblyLifecycle: 1,
        Config: fixture.Config,
        apply: fixture.apply,
      },
    })
    await expectPreparationFailure(fixture, 'invalid-declaration', { validate: 0, describe: 0 })
  })

  it('classifies resolver rejection without retaining the private error', async () => {
    const fixture = preparationFixture()
    fixture.resolveModule.mockRejectedValue(new Error(secret))
    await expectPreparationFailure(fixture, 'module-unavailable', { validate: 0, describe: 0 })
  })

  it('reads a throwing trusted export getter once and does not inspect plugin metadata', async () => {
    const fixture = preparationFixture()
    let exportReads = 0
    let metadataReads = 0
    const plugin = {
      ...fixture.plugin,
      get Config() {
        metadataReads += 1
        return fixture.Config
      },
    }
    const module = {
      get Managed() {
        exportReads += 1
        throw new Error(secret, { cause: plugin })
      },
    }
    fixture.resolveModule.mockResolvedValue(module)
    await expectPreparationFailure(fixture, 'invalid-export', { validate: 0, describe: 0 })
    expect(exportReads).toBe(1)
    expect(metadataReads).toBe(0)
  })

  it('classifies schema issues without retaining their private message', async () => {
    const fixture = preparationFixture()
    const validate = vi.fn(() => ({ issues: [{ message: secret }] }))
    fixture.resolveModule.mockResolvedValue({
      Managed: {
        ...fixture.plugin,
        Config: { '~standard': { version: 1, vendor: 'test', validate } },
      },
    })
    await expectPreparationFailure(fixture, 'invalid-config', { validate: 0, describe: 0 })
    expect(validate).toHaveBeenCalledExactlyOnceWith({ input: 'original' })
  })

  it('captures distinct claim versions using the exact schema output once', async () => {
    const config = { nested: [1, 2] }
    const claims = [
      { name: 'capability', version: 1, config },
      { name: 'capability', version: 2, config: { nested: [3] } },
    ]
    const fixture = preparationFixture(claims)
    const prepared = await fixture.prepare()
    expect(fixture.resolveModule).toHaveBeenCalledTimes(1)
    expect(fixture.validate).toHaveBeenCalledExactlyOnceWith({ input: 'original' })
    expect(fixture.describeAssembly).toHaveBeenCalledTimes(1)
    expect(fixture.describeAssembly.mock.calls[0]?.[0]).toBe(fixture.output)
    expect(fixture.apply).not.toHaveBeenCalled()
    expect(prepared.ids).toEqual(['a'])
    config.nested.push(4)
    expect(config).toEqual({ nested: [1, 2, 4] })
    expect(prepared.declarations).toEqual([
      {
        id: 'a',
        declaration: {
          provides: [],
          requires: [],
          optional: [],
          dynamicProvides: [],
          dynamicRequires: [],
          claims: [
            { name: 'capability', version: 1, config: { nested: [1, 2] } },
            { name: 'capability', version: 2, config: { nested: [3] } },
          ],
        },
      },
    ])
    const capturedClaims = prepared.declarations[0]?.declaration.claims
    assert(capturedClaims !== undefined)
    expect(Object.isFrozen(capturedClaims)).toBe(true)
    for (const claim of capturedClaims) {
      expect(Object.isFrozen(claim)).toBe(true)
      expect(Object.isFrozen(claim.config)).toBe(true)
      assert(claim.config !== null && typeof claim.config === 'object' && 'nested' in claim.config)
      expect(Object.isFrozen(claim.config.nested)).toBe(true)
    }
  })

  it.each([
    { name: 'nonpositive claim version', claims: [{ name: 'capability', version: 0, config: {} }] },
    {
      name: 'duplicate claim name and version',
      claims: [
        { name: 'capability', version: 1, config: { value: 1 } },
        { name: 'capability', version: 1, config: { value: 2 } },
      ],
    },
  ])('rejects $name after one validation and declaration', async ({ claims }) => {
    const fixture = preparationFixture(claims)
    await expectPreparationFailure(fixture, 'invalid-declaration', { validate: 1, describe: 1 })
    expect(fixture.describeAssembly.mock.calls[0]?.[0]).toBe(fixture.output)
  })
})

class PromisedService extends Service {
  constructor(context: Context) {
    super(context, 'promised')
  }
}

describe('actual Cordis row lifetime', () => {
  it.each(['missing-registration', 'provided-service-missing', 'published'])(
    'settles %s with owned close results and the exact started prefix',
    async kind => {
      const context = new Context()
      const calls = { apply: 0, setup: 0, close: 0, suffixApply: 0, suffixSetup: 0, suffixClose: 0 }
      const Config: StandardSchemaV1 = {
        '~standard': { version: 1, vendor: 'test', validate: value => ({ value }) },
      }
      const provider = {
        name: 'provider',
        assemblyLifecycle: 1,
        Config,
        inject: [ASSEMBLY_LIFETIME_SERVICE],
        describeAssembly: () => ({ ...declaration(), provides: ['promised'] }),
        apply(inner: Context) {
          calls.apply += 1
          if (kind === 'missing-registration') return
          startAssemblyWork(
            inner,
            async () => {
              calls.setup += 1
              if (kind === 'published') new PromisedService(inner)
            },
            async () => {
              calls.close += 1
            },
          )
        },
      }
      const suffix = {
        name: 'suffix',
        assemblyLifecycle: 1,
        Config,
        inject: [ASSEMBLY_LIFETIME_SERVICE, 'promised'],
        describeAssembly: () => ({ ...declaration(), requires: ['promised'] }),
        apply(inner: Context) {
          calls.suffixApply += 1
          expect(inner.get('promised')).toBeInstanceOf(PromisedService)
          startAssemblyWork(
            inner,
            async () => {
              calls.suffixSetup += 1
            },
            async () => {
              calls.suffixClose += 1
            },
          )
        },
      }
      const prepared = await preparePluginTree(
        composePluginTree([
          { ...row('row-0'), plugin: { package: 'provider', export: 'Managed' } },
          { ...row('row-1'), plugin: { package: 'suffix', export: 'Managed' } },
        ]),
        {
          externalServices: [],
          resolveModule: async reference => ({
            Managed: reference.package === 'provider' ? provider : suffix,
          }),
        },
      )
      const lifetime = createAssemblyLifetime(prepared.ids, () => {})
      const handle = loadPluginTree(context, prepared, lifetime)
      try {
        expect(calls).toEqual({
          apply: 0,
          setup: 0,
          close: 0,
          suffixApply: 0,
          suffixSetup: 0,
          suffixClose: 0,
        })
        if (kind === 'published') {
          await expect(handle.ready).resolves.toBeUndefined()
          expect(inspectPluginTree(handle).map(item => item.id)).toEqual(['row-0', 'row-1'])
          expect(calls).toEqual({
            apply: 1,
            setup: 1,
            close: 0,
            suffixApply: 1,
            suffixSetup: 1,
            suffixClose: 0,
          })
          expect(handle.dispose()).toBe(handle.closed)
          expect(await handle.closed).toEqual({
            complete: true,
            assemblyErrors: [],
            rows: [
              { id: 'row-1', result: { kind: 'closed' } },
              { id: 'row-0', result: { kind: 'closed' } },
            ],
          })
          expect(calls).toEqual({
            apply: 1,
            setup: 1,
            close: 1,
            suffixApply: 1,
            suffixSetup: 1,
            suffixClose: 1,
          })
        } else {
          const error: unknown = await handle.ready.catch((reason: unknown) => reason)
          assert.instanceOf(error, PluginTreeStartError)
          expectClosedError(error, { name: 'PluginTreeStartError', code: kind, rowId: 'row-0' })
          expect(inspectPluginTree(handle).map(item => item.id)).toEqual(['row-0'])
          expect(handle.dispose()).toBe(handle.closed)
          if (kind === 'missing-registration') {
            expect(await handle.closed).toEqual({
              complete: false,
              assemblyErrors: ['assembly-protocol-failed'],
              rows: [],
            })
            expect(calls).toEqual({
              apply: 1,
              setup: 0,
              close: 0,
              suffixApply: 0,
              suffixSetup: 0,
              suffixClose: 0,
            })
          } else {
            expect(await handle.closed).toEqual({
              complete: true,
              assemblyErrors: [],
              rows: [{ id: 'row-0', result: { kind: 'closed' } }],
            })
            expect(calls).toEqual({
              apply: 1,
              setup: 1,
              close: 1,
              suffixApply: 0,
              suffixSetup: 0,
              suffixClose: 0,
            })
          }
        }
      } finally {
        await handle.dispose()
        await context.fiber.dispose()
      }
    },
  )
})
