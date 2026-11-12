import { createHash } from 'node:crypto'
import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import {
  createCalendarSqlSupplyStorage,
  type CalendarSeedPackRegistry,
} from '@omne-harness/calendar-local'
import { calendarSeedPackSchema, instantSchema } from '@omne-harness/calendar-contract'
import { openWorld, run, instant } from './world.ts'
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const material = () => ({
  sourceId: 'fixture',
  content: new Uint8Array([0, 1, 128, 255]),
  mediaType: 'application/octet-stream',
  acquiredAt: instant,
  knowledgeAsOf: instant,
  lineageRef: 'fixture-lineage',
  authorityRef: 'fixture-authority',
})
function seedBytes() {
  const { content, ...metadata } = material()
  const pack = calendarSeedPackSchema.parse({
    format: 'omne.calendar-seed/1',
    releaseRef: 'fixture-release',
    releaseDate: '2026-01-02',
    calendars: [
      {
        policyVersion: 'fixture-policy',
        policyHash: 'a'.repeat(64),
        snapshot: { ...run().command.candidate.snapshot, publicationGeneration: 0 },
        authorityCoverageEnd: '2026-12-31',
        materials: [
          {
            ...metadata,
            rawHash: hash(content),
            contentBase64: Buffer.from(content).toString('base64'),
          },
        ],
      },
    ],
  })
  return Buffer.from(JSON.stringify(pack))
}
it('round trips exact bytes and every observation metadata across restart', async () => {
  const w = await openWorld()
  let reference = ''
  try {
    const stored = await w.materials.preserve(material())
    expect(stored).toMatchObject({
      kind: 'ok',
      value: { rawHash: hash(material().content), material: material() },
    })
    if (stored.kind !== 'ok') throw new Error('Expected stored material')
    reference = stored.value.reference
    expect(await w.materials.preserve(material())).toEqual(stored)
    expect(await w.materials.read({ reference })).toEqual(stored)
    const later = await w.materials.preserve({
      ...material(),
      acquiredAt: instantSchema.parse('2026-01-03T00:00:00.000Z'),
    })
    expect(later).toMatchObject({ kind: 'ok' })
    if (later.kind === 'ok') expect(later.value.reference).not.toBe(reference)
    const other = createCalendarSqlSupplyStorage({ ...w.options, systemScopeRef: 'other' })
    expect(await other.materials.read({ reference })).toEqual({ kind: 'ok', value: null })
  } finally {
    await w.close()
  }
  const restored = await openWorld(w.root)
  try {
    expect(await restored.materials.read({ reference })).toMatchObject({
      kind: 'ok',
      value: { material: material() },
    })
  } finally {
    await restored.close()
  }
})
it('rejects corrupted stored bytes and explicit capacity overflow', async () => {
  const w = await openWorld()
  try {
    const stored = await w.materials.preserve(material())
    if (stored.kind !== 'ok') throw new Error('Expected stored material')
    const corrupt = createCalendarSqlSupplyStorage({
      ...w.options,
      storage: {
        ...w.storage,
        read: async input => {
          const result = await w.storage.read(input)
          if (result.kind !== 'read') return result
          return {
            ...result,
            output: {
              reference: stored.value.reference,
              material: {
                sourceId: 'fixture',
                mediaType: 'application/octet-stream',
                acquiredAt: instant,
                knowledgeAsOf: instant,
                lineageRef: 'fixture-lineage',
                authorityRef: 'fixture-authority',
                contentBase64: 'AAAAAA==',
                rawHash: stored.value.rawHash,
              },
            },
          }
        },
      },
    })
    expect(await corrupt.materials.read({ reference: stored.value.reference })).toEqual({
      kind: 'unavailable',
      reason: 'materialIntegrity',
    })
    const small = createCalendarSqlSupplyStorage({ ...w.options, maxMaterialBytes: 3 })
    expect(await small.materials.preserve(material())).toEqual({
      kind: 'unavailable',
      reason: 'materialCapacityExceeded',
    })
    expect(await w.materials.preserve({ ...material(), sourceId: '\ud800' })).toMatchObject({
      kind: 'invalid',
    })
  } finally {
    await w.close()
  }
})
it('reads only registered seed bytes or files with exact pack and material hashes', async () => {
  const w = await openWorld(),
    bytes = seedBytes(),
    path = join(w.root, 'seed.json')
  await writeFile(path, bytes)
  const registry: CalendarSeedPackRegistry = new Map([
    ['release-file', { kind: 'file', path }],
    ['release-bytes', { kind: 'bytes', read: async () => bytes }],
  ])
  const custody = createCalendarSqlSupplyStorage({
    ...w.options,
    seedPackRegistry: registry,
  }).materials
  try {
    for (const packRef of ['release-file', 'release-bytes'])
      expect(await custody.readSeed({ packRef, packHash: hash(bytes) })).toEqual({
        kind: 'ok',
        value: JSON.parse(bytes.toString()),
      })
    expect(await custody.readSeed({ packRef: path, packHash: hash(bytes) })).toEqual({
      kind: 'unavailable',
      reason: 'unregisteredSeedPack',
    })
    expect(await custody.readSeed({ packRef: 'release-file', packHash: '0'.repeat(64) })).toEqual({
      kind: 'unavailable',
      reason: 'seedHashMismatch',
    })
    await writeFile(path, Buffer.from('{}'))
    expect(await custody.readSeed({ packRef: 'release-file', packHash: hash(bytes) })).toEqual({
      kind: 'unavailable',
      reason: 'seedHashMismatch',
    })
    expect(
      await custody.readSeed({ packRef: 'release-file', packHash: hash(Buffer.from('{}')) }),
    ).toMatchObject({ kind: 'unavailable' })
    const invalid = JSON.parse(bytes.toString())
    invalid.calendars[0].materials[0].rawHash = '0'.repeat(64)
    const bad = Buffer.from(JSON.stringify(invalid))
    await writeFile(path, bad)
    expect(await custody.readSeed({ packRef: 'release-file', packHash: hash(bad) })).toEqual({
      kind: 'unavailable',
      reason: 'seedMaterialHashMismatch',
    })
    await unlink(path)
    expect(await custody.readSeed({ packRef: 'release-file', packHash: hash(bytes) })).toEqual({
      kind: 'unavailable',
      reason: 'seedReadFailed',
    })
  } finally {
    await w.close()
  }
})
it('requires an explicit authority and a legal system domain at construction', async () => {
  const w = await openWorld()
  try {
    expect(() =>
      Reflect.apply(createCalendarSqlSupplyStorage, undefined, [
        { ...w.options, authority: undefined },
      ]),
    ).toThrow('authority')
    expect(() => createCalendarSqlSupplyStorage({ ...w.options, systemScopeRef: '' })).toThrow(
      'scope',
    )
    expect(() =>
      createCalendarSqlSupplyStorage({
        ...w.options,
        combination: { ...w.options.combination, scope: { kind: 'tenant', tenant: 'not-system' } },
      }),
    ).toThrow('system.calendar')
    expect(() =>
      createCalendarSqlSupplyStorage({
        ...w.options,
        authority: { ...w.options.authority, participant: 'unregistered' },
      }),
    ).toThrow('authority')
  } finally {
    await w.close()
  }
})
it('preserves structured transport evidence without rewriting authority or source metadata', async () => {
  const w = await openWorld()
  const evidence = {
    url: 'https://fixture.invalid/calendar.json',
    method: 'GET' as const,
    status: 200,
    etag: 'fixture-etag',
    lastModified: null,
    contentLength: 4,
    bodyHash: hash(material().content),
    knowledgeBasis: 'fixture authoritative publication date',
  }
  const input = { ...material(), transportEvidence: [evidence] }
  let reference = ''
  try {
    const saved = await w.materials.preserve(input)
    expect(saved).toMatchObject({ kind: 'ok', value: { material: input } })
    if (saved.kind !== 'ok') throw new Error('Expected retained transport evidence')
    reference = saved.value.reference
    expect(await w.materials.read({ reference })).toEqual(saved)
    const changed = await w.materials.preserve({
      ...input,
      transportEvidence: [{ ...evidence, etag: 'later-etag' }],
    })
    expect(changed).toMatchObject({ kind: 'ok' })
    if (changed.kind === 'ok') expect(changed.value.reference).not.toBe(reference)
    expect(
      await w.materials.preserve({ ...input, transportEvidence: [{ ...evidence, status: 700 }] }),
    ).toMatchObject({ kind: 'invalid' })
    const seed = JSON.parse(seedBytes().toString())
    seed.calendars[0].materials[0].transportEvidence = [evidence]
    const bytes = Buffer.from(JSON.stringify(seed))
    const store = createCalendarSqlSupplyStorage({
      ...w.options,
      seedPackRegistry: new Map([
        ['transport-seed', { kind: 'bytes' as const, read: async () => bytes }],
      ]),
    }).materials
    expect(await store.readSeed({ packRef: 'transport-seed', packHash: hash(bytes) })).toEqual({
      kind: 'ok',
      value: seed,
    })
  } finally {
    await w.close()
  }
  const restored = await openWorld(w.root)
  try {
    expect(await restored.materials.read({ reference })).toMatchObject({
      kind: 'ok',
      value: { material: input },
    })
  } finally {
    await restored.close()
  }
})
