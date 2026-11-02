import { Context } from '@deepseek-ai/cordis'
import type { Adoption } from '@omne-harness/session-contract'
import { describe, expect, test } from 'vitest'
import {
  DefinitionMappingsService,
  canonicalText,
  contentDigest,
  definitionMappingsKey,
  definitionResolverOf,
  modesAdoptionOf,
  type DefinitionMappingEntry,
  type DefinitionMappings,
} from '../src/definition-mappings.ts'

const adoption = (name: string, digest = `d-${name}`): Adoption => ({
  owner: 'test-owner',
  name,
  revision: '1',
  digest,
})

const entry = (
  name: string,
  patch: Partial<DefinitionMappingEntry> = {},
): DefinitionMappingEntry => ({
  name,
  candidate: adoption(name),
  execution: adoption('execution'),
  entryContract: adoption('entry-contract'),
  requiredIdentities: [{ capability: 'model', name: 'default' }],
  modes: {
    permission: 'never',
    environment: adoption('environment'),
    collaboration: 'co-work',
  },
  ...patch,
})

function tableOf(entries: readonly DefinitionMappingEntry[]): DefinitionMappings {
  const frozen = Object.freeze([...entries])
  return {
    identity: contentDigest(frozen),
    entries: () => frozen,
    byName: name => frozen.find(item => item.name === name),
    byCandidate: candidate =>
      frozen.find(item => canonicalText(item.candidate) === canonicalText(candidate)),
  }
}

describe('contentDigest', () => {
  test('object key order does not change the digest, content does', () => {
    expect(contentDigest({ a: 1, b: { c: [1, 2], d: 'x' } })).toBe(
      contentDigest({ b: { d: 'x', c: [1, 2] }, a: 1 }),
    )
    expect(contentDigest({ a: 1 })).not.toBe(contentDigest({ a: 2 }))
    expect(contentDigest([1, 2])).not.toBe(contentDigest([2, 1]))
  })

  test('an absent member and an undefined member are the same content', () => {
    expect(contentDigest({ a: 1, b: undefined })).toBe(contentDigest({ a: 1 }))
  })
})

describe('modesAdoptionOf', () => {
  test('changing only a mode default changes the adoption digest', () => {
    const base = entry('alpha')
    const changed = entry('alpha', { modes: { ...base.modes, collaboration: 'auto-drive' } })
    expect(modesAdoptionOf(changed).digest).not.toBe(modesAdoptionOf(base).digest)
    expect(modesAdoptionOf(changed).name).toBe(modesAdoptionOf(base).name)
  })

  test('the same modes of two definitions differ by name', () => {
    expect(modesAdoptionOf(entry('alpha')).name).not.toBe(modesAdoptionOf(entry('beta')).name)
  })
})

describe('definitionResolverOf', () => {
  test('a known name resolves to its own entry parts and the modes adoption', () => {
    const alpha = entry('alpha')
    const resolve = definitionResolverOf(tableOf([alpha, entry('beta')]))
    expect(resolve('alpha')).toEqual({
      candidate: alpha.candidate,
      execution: alpha.execution,
      entryContract: alpha.entryContract,
      requiredIdentities: alpha.requiredIdentities,
      tenantDefaults: modesAdoptionOf(alpha),
    })
  })

  test('an unknown name is undefined, not a default definition', () => {
    const resolve = definitionResolverOf(tableOf([entry('alpha')]))
    expect(resolve('missing')).toBeUndefined()
    expect(resolve('')).toBeUndefined()
  })

  test('an initial model selection is passed on only when the entry has one', () => {
    const selection = {
      name: 'route',
      basis: { owner: 'o', record: 'r', revision: '1', digest: 'd' },
    }
    const resolve = definitionResolverOf(
      tableOf([entry('alpha', { initialModelSelection: selection }), entry('beta')]),
    )
    expect(resolve('alpha')?.initialModelSelection).toEqual(selection)
    expect(resolve('beta') && 'initialModelSelection' in (resolve('beta') ?? {})).toBe(false)
  })
})

describe('DefinitionMappingsService', () => {
  class Provider extends DefinitionMappingsService {
    readonly identity: string
    constructor(
      ctx: Context,
      private readonly table: DefinitionMappings,
    ) {
      super(ctx)
      this.identity = table.identity
    }
    entries = () => this.table.entries()
    byName = (name: string) => this.table.byName(name)
    byCandidate = (candidate: Adoption) => this.table.byCandidate(candidate)
  }

  test('the key is definitionMappings and a consumer reads the provided table', async () => {
    expect(definitionMappingsKey).toBe('definitionMappings')
    const table = tableOf([entry('alpha')])
    const root = new Context()
    new Provider(root, table)
    let seen: DefinitionMappings | undefined
    await root.plugin({
      name: 'consumer',
      inject: [definitionMappingsKey],
      apply(ctx: Context) {
        seen = ctx.definitionMappings
      },
    })
    expect(seen?.identity).toBe(table.identity)
    expect(seen?.byName('alpha')?.name).toBe('alpha')
    expect(seen?.entries()).toBe(seen?.entries())
  })
})
