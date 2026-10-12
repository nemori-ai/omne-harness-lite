import { expect, it } from 'vitest'
import { writeJsonLossless, type JsonObject } from '@omne-harness-lite/content-blocks'
import {
  capabilityCanonicalString,
  createAssetModelJudge,
  parseCapabilityCanonicalString,
} from '../src/index.ts'
import { isObject } from '../src/judge.ts'
import fixtures from './fixtures/examples.json' with { type: 'json' }
import { bodies, json } from './ports.ts'

const judge = createAssetModelJudge(bodies)
function fixture(id: string): JsonObject {
  const row = fixtures.find(candidate => candidate.id === id)
  if (row === undefined) throw new Error('missing normative fixture')
  const copied = json(writeJsonLossless(row.value))
  if (!isObject(copied)) throw new Error('expected object fixture')
  return copied
}

it('S-29 preserves the two prescribed canonical spellings and refuses slash repair', () => {
  for (const capability of [
    { category: 'mcp', name: 'github' },
    { category: 'slash_command', name: 'omne-official:reload-skills' },
  ] as const) {
    expect(judge.judgeAssetValue('CapabilityId', capability)).toEqual({ ok: true })
    expect(capabilityCanonicalString(capability)).toBe(`${capability.category}/${capability.name}`)
    expect(parseCapabilityCanonicalString(capabilityCanonicalString(capability))).toEqual({
      ok: capability,
    })
  }
  const invalid = { category: 'mcp', name: 'gh/issues' }
  expect(judge.judgeAssetValue('CapabilityId', invalid)).toEqual({ rejected: 'name_invalid' })
  expect(invalid.name).toBe('gh/issues')
})

it('S-30 accepts the official two-version tool without authors and rejects invented authors', () => {
  const record = fixture('4.1')
  expect(judge.judgeAssetValue('AssetDefinition', record)).toEqual({ ok: true })
  expect(
    judge.judgeAssetValue('AssetDefinition', {
      ...record,
      author: { organization: 'org_platform', account: 'acc_platform' },
    }),
  ).toEqual({ rejected: 'malformed' })
  expect(Object.hasOwn(record, 'author')).toBe(false)
  expect(Object.hasOwn(record, 'owner')).toBe(false)
})

it('S-31 runs the skipped-number and reversed-number counterexamples together', () => {
  const record = fixture('4.1')
  if (!Array.isArray(record.versions)) throw new Error('expected normative version line')
  const versions = record.versions.map((version: unknown) => {
    if (!isObject(version)) throw new Error('expected normative version')
    return version
  })
  expect(judge.judgeAssetValue('AssetDefinition', record)).toEqual({ ok: true })
  for (const numbers of [
    [1, 3],
    [2, 1],
  ]) {
    const broken = {
      ...record,
      versions: versions.map((version, index) => ({ ...version, number: numbers[index] })),
    }
    expect(judge.validate('AssetDefinition', broken)).toEqual({ valid: true })
    expect(judge.judgeAssetValue('AssetDefinition', broken)).toEqual({
      rejected: 'version_sequence_broken',
    })
  }
})

it('S-32 tests boolean disabled, both value/lock defects and the official false prohibition', () => {
  const holding = fixture('10.3')
  const disabled = { item: 'disabled', value: true, immutable: false, since: holding.since }
  expect(judge.judgeAssetValue('AssetHolding', holding)).toEqual({ ok: true })
  for (const assignment of [
    { ...disabled, immutable: true },
    { ...disabled, value: 'yes' },
  ])
    expect(
      judge.judgeAssetValue('AssetHolding', { ...holding, assignments: [assignment] }),
    ).toEqual({ rejected: 'malformed' })
  expect(
    judge.judgeAssetValue('AssetHolding', {
      ...fixture('10.1'),
      assignments: [{ ...disabled, value: false }],
    }),
  ).toEqual({ rejected: 'malformed' })
})

it('S-34 separates directory escape from noncanonical source spelling without repairing either', () => {
  const manifest = fixture('12.1')
  const capability = { category: 'skill', name: 'review' }
  expect(
    judge.judgeAssetValue('WorkspaceCarrierManifest', {
      ...manifest,
      assets: [{ capability, source: 'skills/review' }],
    }),
  ).toEqual({ ok: true })
  for (const source of ['../shared/skills/review', '/etc/skills', 'C:/skills', 'skills\\..\\..\\x'])
    expect(
      judge.judgeAssetValue('WorkspaceCarrierManifest', {
        ...manifest,
        assets: [{ capability, source }],
      }),
    ).toEqual({ rejected: 'manifest_source_escapes' })
  expect(
    judge.judgeAssetValue('WorkspaceCarrierManifest', {
      ...manifest,
      assets: [{ capability, source: 'skills//review' }],
    }),
  ).toEqual({ rejected: 'malformed' })
})
