import { describe, expect, it } from 'vitest'
import { capabilityId } from '@omne-harness/assets'
import {
  access,
  accountCodec,
  organizationCodec,
  tenant,
  type Access,
} from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  isSourcedSkillName,
  listSourcedSkills,
  mergeSearched,
  orderDocuments,
  sourceOfSkill,
} from '@omne-harness/skill'
import type { CatalogEntry, SkillEntrySource } from '@omne-harness/skill-contract'
import { createMemorySkillEntrySource } from '@omne-harness/skill-contract/testing'

type Principal = 'alice'
const org = organizationCodec.parse('org_0123456789abcdefghjkmnpqrs')
const acc = accountCodec.parse('acc_0123456789abcdefghjkmnpqrs')
if (!org.ok || !acc.ok) throw new Error('the test tenant texts are not legal')
const alice: Access<Principal> = access('alice', tenant(org.value, acc.value))
const RANKING = { k1: 1.2, b: 0.75 }

function memory(prefix: string, names: readonly string[], label = prefix) {
  const skills = Object.fromEntries(
    names.map(name => [name, { description: `About ${name}.`, body: `# ${name}\n` }]),
  )
  return createMemorySkillEntrySource<Principal>({ prefix, label, skills })
}

function broken(prefix: string, list: SkillEntrySource<Principal>['list']) {
  return { ...memory(prefix, []), list }
}

function adopted(name: string, description: string): CatalogEntry {
  const id = capabilityId('skill', name)
  if (!id.ok) throw new Error(name)
  return { kind: 'adopted', capability: id.id, name: name as never, description, dependencies: [] }
}

describe('a name a source gives', () => {
  it('is a prefix of lower-case letters and digits ending in two underscores, then more', () => {
    expect(['mcp__docs__style', 'a1__x'].map(isSourcedSkillName)).toEqual([true, true])
    expect(['mcp__', 'weekly-report', 'Mcp__x', '__x', 'mcp_x'].map(isSourcedSkillName)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ])
  })

  it('belongs to the one source whose prefix starts it, and to none when two claim it', () => {
    const mcp = memory('mcp__', [])
    const other = memory('web__', [])
    expect(sourceOfSkill([mcp, other], 'mcp__docs__style')).toBe(mcp)
    expect(sourceOfSkill([mcp, other], 'files__x')).toBeUndefined()
    expect(sourceOfSkill([mcp, memory('mcp__', [])], 'mcp__docs__style')).toBeUndefined()
  })
})

describe('what the sources list (C405)', () => {
  it('gives every source entry with its label', async () => {
    const listed = await listSourcedSkills(
      [memory('mcp__', ['mcp__docs__style'], 'docs'), memory('web__', ['web__notes'], 'web')],
      alice,
      1000,
    )
    expect(listed.map(entry => [entry.name, entry.label]).toSorted()).toEqual([
      ['mcp__docs__style', 'docs'],
      ['web__notes', 'web'],
    ])
  })

  it('a source that throws, answers unavailable, or takes too long gives nothing; the others are kept', async () => {
    const good = memory('mcp__', ['mcp__docs__style'])
    const throws = broken('bad__', () => {
      throw new Error('boom')
    })
    const rejects = broken('rej__', () => Promise.reject(new Error('boom')))
    const unavailable = broken('off__', () => Promise.resolve(fail('unavailable' as const)))
    const slow = broken('slow__', () => new Promise(() => undefined))
    const started = Date.now()
    const listed = await listSourcedSkills([throws, rejects, unavailable, slow, good], alice, 50)
    expect(listed.map(entry => entry.name)).toEqual(['mcp__docs__style'])
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('a source that lists a name outside its prefix, or one name twice, gives nothing', async () => {
    const entry = (name: string) => ({ name, description: 'x', label: 'x' })
    const outside = broken('out__', () => Promise.resolve(succeed([entry('out__a'), entry('b')])))
    const bare = broken('bare__', () => Promise.resolve(succeed([entry('bare__')])))
    const twice = broken('two__', () =>
      Promise.resolve(succeed([entry('two__a'), entry('two__a')])),
    )
    const listed = await listSourcedSkills(
      [outside, bare, twice, memory('mcp__', ['mcp__docs__style'])],
      alice,
      1000,
    )
    expect(listed.map(one => one.name)).toEqual(['mcp__docs__style'])
  })

  it('two sources with one prefix give nothing', async () => {
    const listed = await listSourcedSkills(
      [memory('mcp__', ['mcp__a__x']), memory('mcp__', ['mcp__b__y'])],
      alice,
      1000,
    )
    expect(listed).toEqual([])
  })
})

describe('one order for asset Skills and source Skills (C401)', () => {
  const order = (text: string, documents: Parameters<typeof orderDocuments>[1]) =>
    orderDocuments(text, documents, RANKING)
  const report = adopted('weekly-report', 'Write the weekly report.')
  const style = {
    name: 'mcp__docs__style',
    description: 'House style for a report.',
    label: 'docs',
  }
  const notes = { name: 'mcp__docs__notes', description: 'Meeting notes.', label: 'docs' }

  it('with no source Skill, the order of the catalog stands', () => {
    const second = adopted('a-report', 'Another report.')
    expect(mergeSearched('report', [report, second], [], order)).toEqual([
      { kind: 'asset', entry: report },
      { kind: 'asset', entry: second },
    ])
  })

  it('ranks both together and leaves out a source Skill the text does not match', () => {
    const merged = mergeSearched('style report', [report], [notes, style], order)
    expect(merged).toEqual([
      { kind: 'source', entry: style },
      { kind: 'asset', entry: report },
    ])
  })

  it('keeps two catalog entries of one name together, and ranks an asset Skill without a description by its name', () => {
    const { description: _, ...bare } = adopted('style-report', 'x') as Extract<
      CatalogEntry,
      { kind: 'adopted' }
    >
    const retired: CatalogEntry = {
      kind: 'stand-in',
      capability: report.capability,
      name: report.name,
      reason: 'retired' as never,
    }
    const merged = mergeSearched('', [report, retired, bare], [notes], order)
    expect(merged).toEqual([
      { kind: 'source', entry: notes },
      { kind: 'asset', entry: bare },
      { kind: 'asset', entry: report },
      { kind: 'asset', entry: retired },
    ])
    expect(mergeSearched('style', [bare], [notes], order)).toEqual([{ kind: 'asset', entry: bare }])
  })

  it('an empty text lists every one by name', () => {
    const merged = mergeSearched('', [report], [style, notes], order)
    expect(merged.map(item => (item.kind === 'asset' ? item.entry.name : item.entry.name))).toEqual(
      ['mcp__docs__notes', 'mcp__docs__style', 'weekly-report'],
    )
  })
})
