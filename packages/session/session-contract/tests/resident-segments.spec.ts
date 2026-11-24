import { describe, expect, it } from 'vitest'
import type { ResidentSegment, SessionCommand } from '@omne-harness/session-contract'
import { creation, operationId, refused } from '@omne-harness/session-contract/testing'
import { decodeEntries, encodeEntry, fromJsonValue } from '../src/entries.ts'
import type { HistoryEntry } from '../src/faces.ts'
import { scene } from './scene.ts'

const segment = (text: string, ...names: string[]): ResidentSegment => ({
  key: 'kept',
  text,
  sources: names.map(name => ({ category: 'kind-a', name, digest: `sha256:${name}` })),
})

const FIRST = segment('## kept\n- a: first', 'a')
const SECOND = segment(`${FIRST.text}\n- b: second`, 'a', 'b')

async function created(segments: readonly ResidentSegment[] = [FIRST]) {
  const s = scene()
  await s.create(creation({ residentAdoption: { residents: [], keys: [], segments } }))
  await s.accept('first')
  return s
}

function startWith(
  s: Awaited<ReturnType<typeof created>>,
  name: string,
  segments: ResidentSegment[],
) {
  return s.port.commit({
    access: s.access,
    command: {
      kind: 'startRun',
      input: {
        ...s.base,
        operation: operationId(name),
        entry: 'interactive',
        candidate: creation().definition.candidate,
        instance: { owner: 'agent', id: name },
        residentAdoption: { residents: [], keys: [], segments },
      },
    } as SessionCommand & { kind: 'startRun' },
    guards: [],
  })
}

const segmentsOf = (s: Awaited<ReturnType<typeof created>>) =>
  decodeEntries(s.port.controls.entriesOf(s.access.tenant, s.access.session), null).flatMap(
    value =>
      'ok' in value && value.ok.kind === 'session.prompt-segment-admitted'
        ? [value.ok.segment]
        : [],
  )

describe('a resident segment of the system prompt', () => {
  it('is written by the creation, in its commit, and read back as the segment of its key', async () => {
    const s = await created()
    const history = s.port.controls.entriesOf(s.access.tenant, s.access.session)
    const kinds = history.map(entry => entry.kind)
    expect(kinds).toContain('session.prompt-segment-admitted')
    const createdAt = history.find(entry => entry.kind === 'session.created')!.revision
    expect(history.find(entry => entry.kind === 'session.prompt-segment-admitted')!.revision).toBe(
      createdAt,
    )
    expect(segmentsOf(s)).toEqual([FIRST])
    expect((await s.read()).segments).toEqual([FIRST])
  })

  it('stores its text once: the creation names the segment entry of its batch, and reads back whole', async () => {
    const s = await created()
    const history = s.port.controls.entriesOf(s.access.tenant, s.access.session)
    const row = history.find(entry => entry.kind === 'session.created')!
    const stored = fromJsonValue(row.payload) as {
      initialAdoption: { newSegments: { text: string }[] }
    }
    expect(stored.initialAdoption.newSegments.map(item => item.text)).toEqual([
      '=session.prompt-segment-admitted',
    ])
    const decoded = decodeEntries(history, null).flatMap(value => ('ok' in value ? [value.ok] : []))
    const creation = decoded.find(entry => entry.kind === 'session.created')
    if (creation?.kind !== 'session.created') throw new Error('session.created')
    expect(creation.initialAdoption.newSegments).toEqual([FIRST])
    const without = decodeEntries(
      history.filter(entry => entry.kind !== 'session.prompt-segment-admitted'),
      null,
    )
    expect(without).toContainEqual({
      malformed: 'session.created: no segment entry of the batch holds kept',
    })
  })

  it('takes a new revision only when it begins with the text the session keeps', async () => {
    const s = await created()
    expect(
      refused(await startWith(s, 'rewritten', [segment('## kept\n- b: second', 'b')]), 'rewritten'),
    ).toEqual(expect.objectContaining({ kind: 'invalid', field: 'residentAdoption.segments' }))
    expect('ok' in (await startWith(s, 'extended', [SECOND]))).toBe(true)
    expect((await s.read()).segments).toEqual([SECOND])
    expect(segmentsOf(s)).toEqual([FIRST, SECOND])
  })

  it('writes nothing for a segment whose text is the one the session keeps', async () => {
    const s = await created()
    expect('ok' in (await startWith(s, 'same', [FIRST]))).toBe(true)
    expect(segmentsOf(s)).toEqual([FIRST])
  })

  it('refuses an empty or twice-given segment', async () => {
    const s = await created()
    for (const segments of [[segment('', 'a')], [SECOND, SECOND], [{ ...SECOND, key: '' }]])
      expect(refused(await startWith(s, 'bad', segments), 'bad')).toEqual(
        expect.objectContaining({ kind: 'invalid', field: 'residentAdoption.segments' }),
      )
  })

  it('a logged revision that does not begin with the kept text is quarantined', async () => {
    const s = await created()
    const history = s.port.controls.entriesOf(s.access.tenant, s.access.session)
    const snapshot = await s.read()
    const { reduce } = await import('../src/reduce.ts')
    const rewritten = {
      ...encodeEntry(
        { kind: 'session.prompt-segment-admitted', segment: segment('other', 'b') },
        history[0]!.origin,
      ),
      id: 'rewritten',
      revision: String(BigInt(snapshot.revision) + 1n),
    } as HistoryEntry
    expect(reduce(snapshot, { revision: rewritten.revision, entries: [rewritten] })).toEqual({
      kind: 'quarantined',
      diagnostic:
        'session.prompt-segment-admitted at rewritten: resident segment revision does not begin with the previous text',
    })
  })
})
