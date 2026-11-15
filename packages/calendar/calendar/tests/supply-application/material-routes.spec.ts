import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { instantSchema } from '@omne-harness/calendar-contract'
import {
  materialHash,
  parseMaterials,
  parseStoredMaterial,
} from '../../src/supply-application/materials.ts'
import { shippedCalendarSupplyPolicies } from '../../src/supply/index.ts'
import type { CalendarStoredMaterial } from '../../src/supply-application/ports.ts'

const bytes = (name: string) => readFileSync(new URL(`../supply/fixtures/${name}`, import.meta.url))
const text = (name: string) => bytes(name).toString('utf8')
const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

function stored(sourceId: string, content: Uint8Array): CalendarStoredMaterial {
  const source = shippedCalendarSupplyPolicies
    .flatMap(policy => policy.sources)
    .find(item => item.sourceId === sourceId)
  const material = {
    sourceId,
    content,
    mediaType: sourceId === 'cao-syukujitsu-csv' ? 'text/csv' : 'application/json',
    acquiredAt: instantSchema.parse('2026-08-21T00:00:00.000Z'),
    knowledgeAsOf: instantSchema.parse('2026-08-20T00:00:00.000Z'),
    lineageRef: source?.lineage ?? 'unsupported-test-source',
    authorityRef: `fixture-authority:${sourceId}`,
  }
  return { reference: `stored:${sourceId}`, rawHash: materialHash(material), material }
}

describe('stored material source routing', () => {
  it.each([
    {
      sourceId: 'cg-zhou-holiday-calendar',
      content: () =>
        json({
          format: 'cg_zhou_year_bundle/v1',
          index: JSON.stringify({ regions: [{ name: 'CN', startYear: 2026, endYear: 2026 }] }),
          years: { 'data/CN/2026.json': text('cn_2026.json') },
        }),
      role: 'oracle',
      coverage: [{ start: '2026-01-01', end: '2026-12-31' }],
      count: 39,
      day: { date: '2026-02-14', category: 'workingDay' },
    },
    {
      sourceId: 'cg-zhou-index-endyear',
      content: () => bytes('index.json'),
      role: 'horizonProbe',
      coverage: [{ start: '2000-01-01', end: '2026-12-31' }],
      count: 0,
      day: null,
    },
    {
      sourceId: 'cao-syukujitsu-csv',
      content: () => bytes('current_shape_excerpt.csv'),
      role: 'truth',
      coverage: [{ start: '1955-01-01', end: '2027-12-31' }],
      count: 15,
      day: { date: '2026-05-06', category: 'holiday' },
    },
    {
      sourceId: 'vacanza-holidays-library',
      content: () =>
        json({
          country: 'JP',
          library_version: '0.80',
          window_start_year: 2026,
          window_end_year: 2026,
          supported_start_year: 1949,
          supported_end_year: 2100,
          years: { '2026': { '2026-01-01': '元日' } },
        }),
      role: 'oracle',
      coverage: [{ start: '2026-01-01', end: '2026-12-31' }],
      count: 1,
      day: { date: '2026-01-01', category: 'holiday' },
    },
    {
      sourceId: 'federal-register-eo-feed',
      content: () =>
        json({
          kind: 'federal_register_eo_bundle',
          schema_version: 1,
          pages: [JSON.parse(text('documents_bounded_capture_20260821.json'))],
          bodies: {
            '2025-23847': text('body_capture_2025-23847_20260821.txt'),
            '2024-31766': text('body_capture_2024-31766_20260821.txt'),
          },
        }),
      role: 'exceptionFeed',
      coverage: [{ start: '2024-12-30', end: '2026-08-14' }],
      count: 3,
      day: { date: '2025-12-26', category: 'holiday' },
    },
  ])('carries $sourceId facts through the stored material boundary', sample => {
    const input = stored(sample.sourceId, sample.content())
    const result = parseMaterials([input])
    expect(result.findings).toEqual([])
    expect(result.contributions).toHaveLength(1)
    const contribution = result.contributions[0]
    expect(contribution).toMatchObject({
      sourceId: sample.sourceId,
      role: sample.role,
      lineageRef: input.material.lineageRef,
      coverageIntervals: sample.coverage,
      material: {
        rawSha256: input.rawHash,
        reference: input.material.authorityRef,
        acquiredAt: input.material.acquiredAt,
        knowledgeAsOf: input.material.knowledgeAsOf,
      },
    })
    expect(contribution?.days).toHaveLength(sample.count)
    if (sample.day) expect(contribution?.days).toContainEqual(expect.objectContaining(sample.day))
    expect(
      contribution?.days.every(day =>
        day.provenance.every(record => record.sourceId === sample.sourceId),
      ),
    ).toBe(true)
  })

  it('retains an unsupported source failure at its stored reference without inventing a contribution', () => {
    const input = stored('unregistered-source', bytes('index.json'))
    expect(parseMaterials([input])).toEqual({
      contributions: [],
      findings: [
        {
          code: 'source.invalid',
          status: 'failed',
          severity: 'blocker',
          detail: 'Error: Unsupported source unregistered-source',
          dates: [],
          references: [input.reference],
        },
      ],
    })
  })

  it('keeps malformed first-party material rejected with its source authority and original digest', () => {
    const input = stored('cao-syukujitsu-csv', bytes('current_shape_excerpt_utf8.csv'))
    expect(parseStoredMaterial(input)).toMatchObject({
      kind: 'rejected',
      material: { rawSha256: input.rawHash, reference: input.material.authorityRef },
    })
    const result = parseMaterials([input])
    expect(result.contributions).toEqual([])
    expect(result.findings).toEqual([
      expect.objectContaining({
        code: 'source.invalid',
        status: 'failed',
        severity: 'blocker',
        references: [input.material.authorityRef],
      }),
    ])
  })
})
