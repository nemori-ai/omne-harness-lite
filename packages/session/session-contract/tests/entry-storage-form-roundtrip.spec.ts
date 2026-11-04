// The stored form of session-log revision 4 (SPEC「条目的存储形式」, R2-D357): every value that the
// origin, the SE01 of the session or an SE36 of the batch holds is stored once, and a read gives the
// value of the full form. Each case fails when a marker is lost, resolved against the wrong target,
// accepted without its target, or when bytes of another revision are read in the new form.
import { describe, expect, it } from 'vitest'
import { tenantCodec, workspaceCodec } from '@omne-harness/legal-identity'
import type { ResidentKey, SessionCommand } from '@omne-harness/session-contract'
import { expandHistoryEntries } from '@omne-harness/session-contract'
import { creation, evidence, operationId, refused } from '@omne-harness/session-contract/testing'
import {
  SESSION_INTERPRETER,
  decodeEntries,
  decodeEntry,
  encodeEntry,
  fromJsonValue,
  toJsonValue,
  type SessionEntry,
} from '../src/entries.ts'
import type { HistoryEntry } from '../src/faces.ts'
import { digestOf } from '../src/operations.ts'
import { INITIAL_ADOPTION, SAMPLES } from './storage-form-fixture.ts'
import { scene } from './scene.ts'

const rows: HistoryEntry[] = SAMPLES.map((sample, index) => ({
  id: `entry-${index}` as HistoryEntry['id'],
  revision: '1' as HistoryEntry['revision'],
  ...encodeEntry(sample.entry, sample.origin, { created: INITIAL_ADOPTION }),
}))
const byKind = (kind: string) => rows.filter(row => row.kind === kind)
const plain = (row: HistoryEntry) => fromJsonValue(row.payload) as Record<string, any>

/** The payload of the full form: what revision 3 stored for the same entry. */
function fullPayload(entry: SessionEntry): HistoryEntry['payload'] {
  const { kind: _kind, ...body } = entry
  const out: Record<string, unknown> = { ...body }
  if (entry.kind === 'session.created') {
    const tenant = tenantCodec.encode(entry.tenant)
    if (!tenant.ok) throw new Error('tenant')
    const workspace =
      entry.creation.workspace === null ? null : workspaceCodec.encode(entry.creation.workspace)
    out['tenant'] = tenant.value
    out['creation'] = { ...entry.creation, workspace: workspace?.ok ? workspace.value : null }
  }
  return toJsonValue(out)
}

describe('the stored form holds each repeated value once', () => {
  it('stores fact sources, the initial adoption, the command input and resident shapes by reference', () => {
    const [created] = byKind('session.created')
    const [adoption] = byKind('session.adoption')
    expect(plain(created!)['input']).toBe('=session.created.command')
    for (const resident of plain(created!)['initialAdoption'].newResidents)
      expect(resident.shape).toBe('=session.tool-resident-admitted')
    expect(plain(adoption!)['initialization'].adoption).toBe('=session.created.initialAdoption')
    for (const row of [...byKind('call.execution-fact'), ...byKind('account.linked')])
      expect(plain(row)['fact'].source).toBe('=origin.source')
    for (const row of byKind('session.tool-resident-admitted'))
      expect(plain(row)['resident'].shape).toEqual(
        INITIAL_ADOPTION.newResidents.find(
          item => item.capability === plain(row)['resident'].capability,
        )?.shape,
      )
    // A message keeps its own source: public history readers page it as stored.
    expect(plain(byKind('message.tool')[0]!)['source']).toEqual(SAMPLES.at(-1)!.origin.source)
    expect(rows.every(row => row.schema.revision === '4')).toBe(true)
  })

  it('decodes every representative entry to the value it encoded, member order kept', () => {
    const decoded = decodeEntries(rows, null)
    SAMPLES.forEach((sample, index) => {
      const value = decoded[index]!
      if (!('ok' in value)) throw new Error(`${sample.name}: ${JSON.stringify(value)}`)
      expect(value.ok, sample.name).toEqual(sample.entry)
    })
    const created = decoded[0]!
    if (!('ok' in created) || created.ok.kind !== 'session.created') throw new Error('SE01')
    expect(JSON.stringify(created.ok.input)).toBe(
      JSON.stringify(SAMPLES[0]!.entry['input' as never]),
    )
    expect(JSON.stringify(created.ok.initialAdoption)).toBe(JSON.stringify(INITIAL_ADOPTION))
  })

  it('keeps a fact source in full when the origin of the entry names another source', () => {
    const sample = SAMPLES.find(item => item.entry.kind === 'account.linked')!
    const other = { ...sample.origin, source: evidence('another-origin') }
    const row = { ...encodeEntry(sample.entry, other), id: 'x', revision: '1' } as HistoryEntry
    expect(plain(row)['fact'].source).toEqual(
      (sample.entry as unknown as { fact: { source: unknown } }).fact.source,
    )
    expect(decodeEntry(row)).toEqual({ ok: sample.entry })
  })

  it('stores an SE08 adoption in full when it is not the SE01 initial adoption', () => {
    const sample = SAMPLES.find(item => item.entry.kind === 'session.adoption')!
    const row = encodeEntry(sample.entry, sample.origin, {
      created: { ...INITIAL_ADOPTION, definitionName: 'other' },
    })
    expect(typeof plain(row as HistoryEntry)['initialization'].adoption).toBe('object')
    expect(decodeEntry(row)).toEqual({ ok: sample.entry })
  })
})

describe('a reference without its target is malformed, never guessed', () => {
  it('refuses an SE01 whose batch has no SE36 for a resident', () => {
    const decoded = decodeEntries(
      rows.filter(row => row.kind !== 'session.tool-resident-admitted'),
      null,
    )
    expect(decoded[0]).toEqual({
      malformed: expect.stringContaining('no SE36 of the batch admits Files'),
    })
  })

  it('refuses an SE01 whose SE36 admits another asset digest', () => {
    const changed = rows.map(row => {
      if (row.kind !== 'session.tool-resident-admitted') return row
      const value = plain(row)
      value['resident'] = { ...value['resident'], admitted: evidence('another-asset') }
      return { ...row, payload: toJsonValue(value) }
    })
    expect(decodeEntries(changed, null)[0]).toEqual({
      malformed: expect.stringContaining('same version and asset digest'),
    })
  })

  it('refuses an SE08 that names the SE01 when the SE01 is not read, and a fact without origin', () => {
    const adoption = byKind('session.adoption')[0]!
    expect(decodeEntry(adoption)).toEqual({ malformed: expect.stringContaining('SE01') })
    const fact = byKind('account.linked')[0]!
    expect(decodeEntry({ kind: fact.kind, payload: fact.payload })).toEqual({
      malformed: expect.stringContaining('origin'),
    })
  })

  it('reports bytes of revision 3 as malformed instead of reading them in the new form', () => {
    const third = { ...SESSION_INTERPRETER, revision: '3' }
    for (const row of rows)
      expect(decodeEntry({ ...row, schema: third }, { created: INITIAL_ADOPTION })).toEqual({
        malformed: `${row.kind}: stored by session-log revision 3; this interpreter reads only revision 4`,
      })
  })
})

describe('history pages expand to the full form', () => {
  it('a page from the middle gives the payload of the full form; the SE01 target comes from the snapshot', () => {
    const middle = rows.slice(1)
    expect(expandHistoryEntries(middle, null)).toEqual({ missing: 'created' })
    const expanded = expandHistoryEntries(middle, INITIAL_ADOPTION)
    if (!('ok' in expanded)) throw new Error(JSON.stringify(expanded))
    expanded.ok.forEach((row, index) =>
      expect(JSON.stringify(row.payload), row.kind).toBe(
        JSON.stringify(fullPayload(SAMPLES[index + 1]!.entry)),
      ),
    )
    const whole = expandHistoryEntries(rows, INITIAL_ADOPTION)
    if (!('ok' in whole)) throw new Error(JSON.stringify(whole))
    expect(JSON.stringify(whole.ok[0]!.payload)).toBe(
      JSON.stringify(fullPayload(SAMPLES[0]!.entry)),
    )
  })

  it('a page that only names its own origins needs no snapshot, and a page without markers is returned as is', () => {
    const facts = [...byKind('call.execution-fact'), ...byKind('account.linked')]
    const expanded = expandHistoryEntries(facts, null)
    if (!('ok' in expanded)) throw new Error(JSON.stringify(expanded))
    expect(plain(expanded.ok[0]!)['fact'].source).toEqual(facts[0]!.origin.source)
    const messages = byKind('message.tool')
    expect(expandHistoryEntries(messages, null)).toEqual({ ok: messages })
  })
})

describe('the first resident shape stays whole while its holder lives', () => {
  const shapeA = toJsonValue({ commands: ['read', 'write'] })
  const shapeB = toJsonValue({ commands: ['read', 'write', 'delete'] })
  const key = (name: string) => `rk1:${name}` as ResidentKey
  const resident = (capability: string, version: string, shape: typeof shapeA) => ({
    capability,
    version,
    shape,
    admitted: evidence(`${capability}@${version}`),
  })

  it('a newer version is compared with the first shape from SE36; a new capability gets its own SE36', async () => {
    const s = scene()
    await s.create(
      creation({
        residentAdoption: {
          residents: [resident('Files', '1', shapeA)],
          keys: [{ capability: 'Files', key: key('files') }],
        },
      }),
    )
    await s.accept('first')
    const startWith = (name: string, residents: ReturnType<typeof resident>[]) =>
      s.port.commit({
        access: s.access,
        command: {
          kind: 'startRun',
          input: {
            ...s.base,
            operation: operationId(name),
            entry: 'interactive',
            candidate: creation().definition.candidate,
            instance: { owner: 'agent', id: name },
            residentAdoption: {
              residents,
              keys: residents.map(item => ({
                capability: item.capability,
                key: key(item.capability),
              })),
            },
          },
        } as SessionCommand & { kind: 'startRun' },
        guards: [],
      })
    // Version 2 changes the shape: Session compares it with the first one and refuses it.
    expect(
      refused(await startWith('changed', [resident('Files', '2', shapeB)]), 'changed'),
    ).toEqual(expect.objectContaining({ kind: 'invalid', field: 'residentAdoption.residents' }))
    // Version 2 with the same shape and a new capability: one new SE36, for the new capability only.
    const started = await startWith('same', [
      resident('Files', '2', shapeA),
      resident('Shell', '1', shapeB),
    ])
    expect('ok' in started).toBe(true)
    const history = s.port.controls.entriesOf(s.access.tenant, s.access.session)
    const decoded = decodeEntries(history, null).flatMap(value => ('ok' in value ? [value.ok] : []))
    expect(decoded).toHaveLength(history.length)
    const holders = decoded.flatMap(entry =>
      entry.kind === 'session.tool-resident-admitted' ? [entry.resident] : [],
    )
    expect(holders.map(item => [item.capability, item.version])).toEqual([
      ['Files', '1'],
      ['Shell', '1'],
    ])
    const [first] = holders
    expect(first!.shape).toEqual(shapeA)
    expect(digestOf(first!.shape)).toBe(digestOf(shapeA))
    expect(digestOf(first!.shape)).not.toBe(digestOf(shapeB))
    const created = decoded.find(entry => entry.kind === 'session.created')
    if (created?.kind !== 'session.created') throw new Error('SE01')
    expect(created.initialAdoption.newResidents[0]!.shape).toEqual(shapeA)
    expect((await s.read()).residents.map(item => item.shape)).toEqual([shapeA, shapeB])
  })

  it('a second SE36 for the same capability is quarantined: the first holder stays the only one', async () => {
    const s = scene()
    await s.create(
      creation({
        residentAdoption: {
          residents: [resident('Files', '1', shapeA)],
          keys: [{ capability: 'Files', key: key('files') }],
        },
      }),
    )
    const history = s.port.controls.entriesOf(s.access.tenant, s.access.session)
    const snapshot = await s.read()
    const { reduce } = await import('../src/reduce.ts')
    const second = {
      ...encodeEntry(
        { kind: 'session.tool-resident-admitted', resident: resident('Files', '2', shapeB) },
        history[0]!.origin,
      ),
      id: 'second-holder',
      revision: String(BigInt(snapshot.revision) + 1n),
    } as HistoryEntry
    expect(reduce(snapshot, { revision: second.revision, entries: [second] })).toEqual({
      kind: 'quarantined',
      diagnostic: 'session.tool-resident-admitted at second-holder: resident admitted twice',
    })
  })
})
