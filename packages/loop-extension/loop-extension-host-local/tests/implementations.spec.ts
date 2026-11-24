import { describe, expect, it } from 'vitest'
import type { AssetLayerSource, Candidate } from '@omne-harness/assets'
import {
  DECLARATION_PATH,
  loopExtensionBodyContract,
  type TenantExtensionSources,
} from '@omne-harness/loop-extension-contract'
import {
  createBuiltinExtensions,
  createExtensionImplementations,
} from '@omne-harness/loop-extension-host-local'
import { succeed } from '@omne-harness/operation-result'
import { passageOf, probe, reader, tenantA } from './world.ts'

const member = { capability: 'probe', assetRef: 'asset/probe', version: 'v1' }
const candidate = (asset: string, disabled = false): Candidate => ({
  asset,
  version: 'v1',
  disabled,
  immutable: false,
  replaceLocked: false,
})

async function bodyOf(declaration: unknown): Promise<unknown> {
  const bytes = new TextEncoder().encode(JSON.stringify(declaration))
  const inspected = await loopExtensionBodyContract().layout!.inspect({
    manifest: async () =>
      succeed({ entries: [{ path: DECLARATION_PATH, bytes: bytes.length, digest: 'sha256:d' }] }),
    open: async () => succeed(bytes),
  })
  if ('failure' in inspected) throw new Error(JSON.stringify(inspected.failure))
  return inspected.ok
}

const layerOf = (
  name: AssetLayerSource['layer'],
  candidates: readonly Candidate[] | 'unavailable',
): AssetLayerSource => ({
  layer: name,
  list: async () => ({ layer: name, state: 'unavailable' }),
  candidates: async () =>
    candidates === 'unavailable'
      ? { layer: name, state: 'unavailable' }
      : { layer: name, state: 'read', candidates: [...candidates] },
})

type Given = Partial<{
  layers: readonly AssetLayerSource[]
  body(): Promise<unknown>
  away: 'absent' | 'throws'
}>

function arranged(given: Given = {}) {
  const sources: TenantExtensionSources = {
    layers: given.layers ?? [layerOf('tenant', [candidate('asset/probe')])],
    body: given.body ?? (() => bodyOf(probe('probe'))),
    run: async () => ({ kind: 'absent' }),
    locate: async () => ({ kind: 'absent' }),
    basis: async () => undefined,
    changes: { subscribe: () => () => undefined },
  }
  const builtins = createBuiltinExtensions()
  const implementations = createExtensionImplementations<string>({
    sources: {
      async of() {
        if (given.away === 'throws') throw new Error('the assembly is away')
        return given.away === 'absent' ? undefined : sources
      },
    },
    builtins,
  })
  const resolve = (asked = member) =>
    implementations.resolve({ ...reader(tenantA), passage: passageOf(asked) })
  return { builtins, resolve }
}

const unavailable = (diagnostic: string) => ({
  failure: { kind: 'unavailable', owner: 'loop-extension', diagnostic },
})
const HOLDING = 'the holding is disabled, removed or cannot be read'
const DECLARATION = 'the declaration of the recorded version cannot be read'

describe('the implementation of a recorded member', () => {
  it('is the registered builtin when one readable layer holds the asset enabled, whatever the other layers and candidates are', async () => {
    const a = arranged({
      layers: [
        layerOf('organization', 'unavailable'),
        layerOf('tenant', [candidate('asset/other'), candidate('asset/probe')]),
      ],
    })
    a.builtins.register('probe', async () => ({ kind: 'output', value: { kind: 'observed' } }))
    const resolved = await a.resolve()
    if (!('ok' in resolved)) throw new Error(JSON.stringify(resolved))
    expect(resolved.ok.implementation).toEqual(passageOf(member).implementation)
    expect(
      await resolved.ok.invoke({} as never, new AbortController().signal, { kind: 'fresh' }),
    ).toEqual({
      kind: 'output',
      value: { kind: 'observed' },
    })
  })

  it.each([
    [
      'the sources of the tenant are absent',
      { away: 'absent' },
      member,
      'the sources of the tenant are away',
    ],
    [
      'the sources of the tenant fail',
      { away: 'throws' },
      member,
      'the sources of the tenant are away',
    ],
    ['the name is empty', {}, { ...member, capability: '' }, HOLDING],
    [
      'the tenant holds another asset of that name',
      { layers: [layerOf('tenant', [candidate('asset/other')])] },
      member,
      HOLDING,
    ],
    [
      'the holding is disabled',
      { layers: [layerOf('tenant', [candidate('asset/probe', true)])] },
      member,
      HOLDING,
    ],
    ['no layer can be read', { layers: [layerOf('tenant', 'unavailable')] }, member, HOLDING],
    [
      'the body cannot be read',
      { body: () => Promise.reject(new Error('away')) },
      member,
      DECLARATION,
    ],
    [
      'the body is not a declaration',
      { body: async () => ({ kind: 'null' }) },
      member,
      DECLARATION,
    ],
    ['the body declares another name', { body: () => bodyOf(probe('other')) }, member, DECLARATION],
    ['the builtin is not registered', {}, member, 'the builtin implementation is not registered'],
  ] as const)('is unavailable when %s', async (_name, given, asked, diagnostic) => {
    expect(await arranged(given as Given).resolve(asked)).toEqual(unavailable(diagnostic))
  })

  it('is refused for an identity that is not of this group', async () => {
    const passage = passageOf(member)
    const foreign = { ...passage, implementation: { ...passage.implementation, owner: 'tool' } }
    const implementations = createExtensionImplementations<string>({
      sources: { of: async () => undefined },
      builtins: createBuiltinExtensions(),
    })
    expect(await implementations.resolve({ ...reader(tenantA), passage: foreign })).toEqual({
      failure: {
        kind: 'invalid',
        field: 'implementation',
        reason: 'not an implementation of a loop extension',
      },
    })
  })
})

describe('the builtin implementations', () => {
  it('a registration that left does not withdraw the one that took the name after it', () => {
    const builtins = createBuiltinExtensions()
    const first = builtins.register('probe', async () => ({ kind: 'notStartedUnavailable' }))
    if (!('ok' in first)) throw new Error('the name was free')
    first.ok()
    expect(builtins.get('probe')).toBeUndefined()
    const second = builtins.register('probe', async () => ({ kind: 'notStartedUnavailable' }))
    expect('ok' in second).toBe(true)
    first.ok()
    expect(builtins.get('probe')).toBeDefined()
  })
})
