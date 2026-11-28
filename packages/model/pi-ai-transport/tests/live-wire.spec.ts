import { judgeContentBlock, type ContentBlock } from '@omne-harness/content-block'
import { readFileSync } from 'node:fs'
import { decodeModelOperationId, type ModelOperationId } from '@omne-harness/model-contract'
import type { LiveFact } from '@omne-harness/model-contract/provider'
import { describe, expect, it } from 'vitest'
import {
  commandMessage,
  factsOf,
  mediaMessage,
  startMessage,
  LIVE_CLOSE,
} from '../src/live/wire.ts'

const ACCOUNTING = { place: 'live.test.invalid', costUnit: 'USD' } as const
const op = (label: string): ModelOperationId => {
  const decoded = decodeModelOperationId(`mop_${label}`)
  if (!('ok' in decoded)) throw new Error(label)
  return decoded.ok
}
const text = (value: string): ContentBlock => {
  const visibility = { toHuman: true, toModel: true }
  const judged = judgeContentBlock({ kind: 'text', id: 'say', text: value, visibility })
  if (!('ok' in judged)) throw new Error('invalid text block')
  return judged.ok
}
/** The messages of a real call (2026-11-26): commands named evt_N on the wire are mop_evt_N here. */
function recorded(direction: 'in' | 'out'): readonly Record<string, unknown>[] {
  const url = new URL('fixtures/live/append-1.jsonl', import.meta.url)
  return readFileSync(url, 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line.replaceAll('"evt_', '"mop_evt_')) as Record<string, unknown>)
    .filter(line => line.dir === direction)
    .map(line => line.ev as Record<string, unknown>)
}
const kinds = (facts: readonly LiveFact[]) => facts.map(fact => fact.kind)

describe('the messages of a live session read as facts', () => {
  const facts = recorded('in').flatMap(message => factsOf(message, ACCOUNTING))

  it('opens with the deadline the upstream gives, and ends with the usage of its close, then the close', () => {
    expect(facts[0]).toEqual({ kind: 'opened', expiresAt: '2026-11-26T12:02:05.000Z' })
    expect(facts.slice(-2)).toEqual([
      {
        kind: 'account',
        event: 'usage',
        value: {
          usage: [{ name: 'session', state: 'known', lexeme: '39', unit: 'second' }],
          cost: [{ state: 'unknown', unit: 'USD', source: 'billable' }],
          trimmed: { state: 'unknown', unit: 'token' },
          place: 'live.test.invalid',
          duration: { state: 'unknown' },
          revision: '1',
        },
      },
      { kind: 'closed' },
    ])
  })

  it('answers each command it sent by its identity: taken, or refused with the code and message', () => {
    const outcomes = facts.flatMap(fact => (fact.kind === 'command' ? [fact] : []))
    const codeOf = (outcome: (typeof outcomes)[number]['outcome']) =>
      outcome === 'accepted' ? 'accepted' : outcome.rejected.code
    expect(outcomes.map(fact => [fact.id, codeOf(fact.outcome)])).toEqual([
      [op('evt_1'), 'accepted'],
      [op('evt_2'), 'accepted'],
      [op('evt_3'), 'accepted'],
      [op('evt_4'), 'accepted'],
      [op('evt_5'), null],
      [op('evt_bad_content'), 'invalid_type'],
      [op('evt_no_delegation'), 'missing_required_parameter'],
      [op('evt_unknown'), 'invalid_value'],
    ])
    expect(outcomes[4]?.outcome).toEqual({
      rejected: { code: null, message: 'Unknown client or Decision delegation.' },
    })
  })

  it('keeps the transcripts on the upstream clock, the delegation, and the voice as media', () => {
    const events = facts.flatMap(fact => (fact.kind === 'event' ? [fact.event] : []))
    expect(events.filter(event => event.t === 'transcript' && event.who === 'caller')).toHaveLength(
      13,
    )
    expect(events.filter(event => event.t === 'transcript' && event.who === 'model')).toHaveLength(
      67,
    )
    expect(events.find(event => event.t === 'transcript')).toEqual({
      t: 'transcript',
      who: 'caller',
      startMs: 1800,
      endMs: 2000,
      text: ' Hi',
    })
    expect(events.filter(event => event.t === 'delegation')).toEqual([
      { t: 'delegation', id: 'item_EoQaqXmNU2UdvETPd9J8V', offsetMs: 4600 },
    ])
    const media = facts.flatMap(fact => (fact.kind === 'media' ? [fact.frame] : []))
    expect(media).toEqual([
      { modality: 'voice', bytes: new Uint8Array([0, 0, 0]) },
      { modality: 'voice', bytes: new Uint8Array([0, 0, 0]) },
    ])
  })

  it('makes nothing of the running usage, an error no command owns, or a message it does not know', () => {
    expect(
      kinds(factsOf({ type: 'session.usage.updated', usage: { seconds: 13 } }, ACCOUNTING)),
    ).toEqual([])
    expect(
      factsOf(
        { type: 'error', error: { code: 'x', message: 'y', client_event_id: 'event_start' } },
        ACCOUNTING,
      ),
    ).toEqual([])
    expect(factsOf({ type: 'session.someday' }, ACCOUNTING)).toEqual([])
    expect(factsOf('not an object', ACCOUNTING)).toEqual([])
  })

  it('reads standing by and waking as asleep and awake', () => {
    expect(factsOf({ type: 'session.paused' }, ACCOUNTING)).toEqual([
      { kind: 'event', event: { t: 'asleep', on: true } },
    ])
    expect(factsOf({ type: 'session.resumed' }, ACCOUNTING)).toEqual([
      { kind: 'event', event: { t: 'asleep', on: false } },
    ])
  })

  const at = { start_ms: 0, end_ms: 40 }
  it.each([
    ['nothing', null, []],
    ['a type that is not a name', { type: 7 }, []],
    ['a type that only reads as a name', { type: ['session.paused'] }, []],
    ['a taken command without its identity', { type: 'session.thinking.appended' }, []],
    [
      'a taken command with an identity of another form',
      { type: 'session.thinking.appended', client_event_id: 'evt_1' },
      [],
    ],
    [
      'a transcript from the start of the audio',
      { type: 'session.input_transcript.delta', ...at, delta: 'Hi' },
      [
        {
          kind: 'event',
          event: { t: 'transcript', who: 'caller', startMs: 0, endMs: 40, text: 'Hi' },
        },
      ],
    ],
    [
      'a transcript before the audio began',
      { type: 'session.input_transcript.delta', ...at, start_ms: -1, delta: 'Hi' },
      [],
    ],
    [
      'a transcript whose end is not a whole count',
      { type: 'session.output_transcript.delta', ...at, end_ms: 40.5, delta: 'Hi' },
      [],
    ],
    [
      'a transcript whose start is text',
      { type: 'session.output_transcript.delta', ...at, start_ms: '0', delta: 'Hi' },
      [],
    ],
    ['a transcript without text', { type: 'session.output_transcript.delta', ...at, delta: 5 }, []],
    [
      'a delegation before the audio began',
      { type: 'session.delegation.created', offset_ms: -1, delegation: { id: 'item_1' } },
      [],
    ],
    [
      'a delegation that is not a record',
      { type: 'session.delegation.created', offset_ms: 0, delegation: 'item_1' },
      [],
    ],
    [
      'a delegation without its identity',
      { type: 'session.delegation.created', offset_ms: 0, delegation: { id: 1 } },
      [],
    ],
    ['an error that is not a record', { type: 'error', error: 'broken' }, []],
    [
      'an error without a message',
      { type: 'error', error: { client_event_id: 'mop_evt_1', message: 5 } },
      [],
    ],
    [
      'an error whose code is not a name',
      { type: 'error', error: { client_event_id: 'mop_evt_1', message: 'no', code: 5 } },
      [{ kind: 'command', id: op('evt_1'), outcome: { rejected: { code: null, message: 'no' } } }],
    ],
    ['voice that is not text', { type: 'session.output_audio.delta', delta: 5 }, []],
    [
      'a start whose session is not a record',
      { type: 'session.started', session: null },
      [{ kind: 'opened', expiresAt: null }],
    ],
  ] as const)('reads %s as the facts it can stand for, and no more', (_case, message, facts) => {
    expect(factsOf(message, ACCOUNTING)).toEqual(facts)
  })

  it('takes a close without a usage as a close whose usage it does not know', () => {
    expect(factsOf({ type: 'session.closed', reason: 'expired' }, ACCOUNTING)).toEqual([
      { kind: 'closed' },
    ])
  })
})

describe('what a live session sends', () => {
  const sent = recorded('out')

  it('starts the session with the model, the instructions, the audio and the voice', () => {
    const start = startMessage({
      model: 'gpt-live-1.1',
      instructions: 'Be concise.',
      voice: 'marin',
      audio: 'pcm16',
    })
    expect(start).toEqual({
      ok: {
        type: 'session.start',
        event_id: 'start',
        session: {
          model: 'gpt-live-1.1',
          instructions: 'Be concise.',
          audio: { format: { type: 'audio/pcm', rate: 24000 }, output: { voice: 'marin' } },
          delegation: { type: 'client' },
        },
      },
    })
    const silent = startMessage({ model: 'm', instructions: '', voice: null, audio: 'pcm16' })
    expect('ok' in silent && silent.ok.session).toMatchObject({
      audio: { format: { type: 'audio/pcm', rate: 24000 } },
    })
    expect('ok' in silent && (silent.ok.session as { audio: object }).audio).not.toHaveProperty(
      'output',
    )
    expect(startMessage({ model: 'm', instructions: '', voice: null, audio: 'opus' })).toEqual({
      failure: 'request.media.audio',
    })
  })

  it('says a command as the append of its use, with its identity and the delegation it is about', () => {
    const about = 'item_EoQaqXmNU2UdvETPd9J8V'
    const say = (use: 'directive' | 'context' | 'speak', content: string, on: string | null) =>
      ({ type: 'say', use, about: on, content: [text(content)] }) as const
    const evt2 = sent.find(message => message.event_id === 'mop_evt_2')
    const evt3 = sent.find(message => message.event_id === 'mop_evt_3')
    const evt4 = sent.find(message => message.event_id === 'mop_evt_4')
    expect(commandMessage(say('context', String(evt2?.content), about), op('evt_2'))).toEqual(evt2)
    expect(commandMessage(say('speak', String(evt3?.content), about), op('evt_3'))).toEqual(evt3)
    expect(commandMessage(say('directive', String(evt4?.content), null), op('evt_4'))).toEqual(evt4)
  })

  it('says a command of several texts as the texts in order, nothing between them', () => {
    const said = commandMessage(
      { type: 'say', use: 'speak', about: null, content: [text('Booked'), text(' at two.')] },
      op('two'),
    )
    expect(said).toMatchObject({ content: 'Booked at two.' })
  })

  it('sends no command whose content is not all text', () => {
    const picture = {
      type: 'say',
      use: 'context',
      about: null,
      content: [text('a'), { kind: 'image' }],
    }
    expect(commandMessage(picture as never, op('c'))).toBeNull()
  })

  it('sends voice as appended audio, and nothing for another modality', () => {
    expect(mediaMessage({ modality: 'voice', bytes: new Uint8Array([1, 2, 3]) })).toEqual({
      type: 'session.input_audio.append',
      audio: 'AQID',
    })
    expect(mediaMessage({ modality: 'image', bytes: new Uint8Array([1]) })).toBeNull()
  })

  it('closes with the close the upstream answers', () => {
    expect(LIVE_CLOSE).toEqual({ type: 'session.close', event_id: 'close' })
  })
})
