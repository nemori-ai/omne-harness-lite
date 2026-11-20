import { describe, expect, it } from 'vitest'
import type { SessionRef } from '@omne-harness/dispatch-contract'
import { sourceRequestIdentities } from '@omne-harness/session-contract'
import {
  CONTEXT_COPY_MAX_BYTES,
  DISPATCH_SOURCES,
  createContextCopies,
  type ModelView,
} from '../src/index.ts'
import { transcriptOf } from '../src/transcript.ts'
import { LEGAL_TENANT, OTHER_TENANT, PARENT, TENANT, dispatchOf, world } from './world.ts'

const seen = { toHuman: true, toModel: true }
const text = (value: string, visibility = seen) => ({
  kind: 'text',
  id: 'b',
  visibility,
  text: value,
})
const row = (seq: number, role: string, blocks: unknown[], bytes = 100) => ({
  seq: String(seq),
  bytes,
  message: { id: `m${String(seq)}`, role, blocks },
})
const called = (name: string, args: unknown) => ({
  kind: 'tool_call',
  id: 'c',
  visibility: seen,
  callId: 'call',
  name,
  arguments: args,
})
const object = (members: Record<string, string>) => ({
  kind: 'object',
  entries: Object.entries(members).map(([key, value]) => ({
    key,
    value: { kind: 'string', value },
  })),
})
const CONVERSATION = [
  row(1, 'user', [text('The code word is HERON.')]),
  row(2, 'assistant', [text('Noted.')]),
  row(3, 'user', [text('Now hand it on.')]),
  row(4, 'assistant', [called('Agents', object({ command: 'dispatch' }))]),
]
const view = (rows: unknown[], epoch = 'epoch-1'): ModelView => ({ epoch, rows }) as never
const moment = (epoch: string, upper: string) => JSON.stringify([epoch, upper])

function copies(answer: unknown) {
  const w = world()
  const asked: unknown[] = []
  Object.assign(w.port, {
    view: async (input: unknown) => {
      asked.push(input)
      if (answer instanceof Error) throw answer
      return answer
    },
  })
  return { ...w, asked, copies: createContextCopies(w.port) }
}
const read = (value: unknown) => ({ kind: 'read', value })

describe('the moment a spawn copies', () => {
  it('is the row before the last assistant message: the input of the model request the call was made in', async () => {
    const c = copies(read(view(CONVERSATION)))
    expect(await c.copies.moment(TENANT, PARENT, 'call-1')).toEqual(
      read({ kind: 'moment', moment: moment('epoch-1', '3') }),
    )
    expect(c.asked).toEqual([{ tenant: LEGAL_TENANT, session: PARENT, moment: null }])
  })

  it('does not take a later tool result for the end of the conversation', async () => {
    const later = [...CONVERSATION, row(5, 'tool', [text('a sibling call returned')])]
    expect(await copies(read(view(later))).copies.moment(TENANT, PARENT, 'call-1')).toEqual(
      read({ kind: 'moment', moment: moment('epoch-1', '3') }),
    )
  })

  it.each([
    ['there is no assistant message', [row(1, 'user', [text('hi')])]],
    ['nothing was said before the assistant message', [row(1, 'assistant', [text('hi')])]],
    ['the view is empty', []],
  ])('gives none when %s', async (_name, rows) => {
    expect(await copies(read(view(rows))).copies.moment(TENANT, PARENT, 'call-1')).toEqual(
      read({ kind: 'none' }),
    )
  })

  it('is too large when the rows it would copy pass the limit, and counts no row after the moment', async () => {
    const half = CONTEXT_COPY_MAX_BYTES / 2
    const fits = [
      row(1, 'user', [text('a')], half),
      row(2, 'user', [text('b')], half),
      row(3, 'assistant', [text('c')], half),
    ]
    expect(await copies(read(view(fits))).copies.moment(TENANT, PARENT, 'call-1')).toEqual(
      read({ kind: 'moment', moment: moment('epoch-1', '2') }),
    )
    const over = [row(1, 'user', [text('a')], half), row(2, 'user', [text('b')], half + 1), fits[2]]
    expect(await copies(read(view(over))).copies.moment(TENANT, PARENT, 'call-1')).toEqual(
      read({ kind: 'too-large' }),
    )
  })

  it.each([
    ['the view cannot be read', { kind: 'unavailable' }],
    ['the read is thrown', new Error('down')],
  ])('is unreadable when %s', async (_name, answer) => {
    expect(await copies(answer).copies.moment(TENANT, PARENT, 'call-1')).toEqual({
      kind: 'unavailable',
    })
  })

  it('gives none for a view that is gone, and for a tenant text that is no tenant without asking', async () => {
    expect(await copies(read('gone')).copies.moment(TENANT, PARENT, 'call-1')).toEqual(
      read({ kind: 'none' }),
    )
    const stranger = copies(read(view(CONVERSATION)))
    expect(await stranger.copies.moment(OTHER_TENANT, PARENT, 'call-1')).toEqual(
      read({ kind: 'none' }),
    )
    expect(stranger.asked).toEqual([])
  })
})

describe('the conversation as the starting input words it', () => {
  it('writes each message the model saw under who said it, and a tool call as text', () => {
    const hidden = text('not for the model', { toHuman: true, toModel: false })
    const rows = [
      row(1, 'system_reminder', [text('A reminder.')]),
      row(2, 'user', [text('First.'), text('Second.'), hidden]),
      row(3, 'assistant', [
        text('I will look.'),
        called('Files', object({ command: 'read', path: 'a.txt' })),
        { kind: 'reasoning_state', id: 'r', visibility: { toHuman: false, toModel: true } },
      ]),
      row(4, 'tool', [
        { kind: 'tool_result', id: 't', visibility: seen, callId: 'call' },
        text('contents'),
      ]),
      row(5, 'assistant', [{ kind: 'reasoning_state', id: 'r', visibility: seen }]),
      row(6, 'compaction', [text('Earlier, in short.')]),
      row(8, 'tool_internal', [text('kept by the tool')]),
      row(9, 'assistant', [
        {
          kind: 'tool_call_incomplete',
          id: 'p',
          visibility: seen,
          callId: 'c',
          name: 'Shell',
          partial: '{',
        },
        {
          kind: 'tool_call_unparsed',
          id: 'u',
          visibility: seen,
          callId: 'c',
          name: 'Web',
          raw: 'x',
        },
      ]),
      row(7, 'user', [{ kind: 'image', id: 'i', visibility: seen }]),
    ]
    expect(transcriptOf(rows.map(item => item.message) as never)).toBe(
      [
        'System reminder:\nA reminder.',
        'User:\nFirst.\nSecond.',
        'Assistant:\nI will look.\n[called the tool Files with {"command":"read","path":"a.txt"}]',
        'Tool result:\ncontents',
        'Summary of the earlier conversation:\nEarlier, in short.',
        'Tool result:\nkept by the tool',
        'Assistant:\n[called the tool Shell]\n[called the tool Web]',
        'User:\n[image]',
      ].join('\n\n'),
    )
  })
})

describe('the session of a spawn', () => {
  const spawned = (context: string | null = moment('epoch-1', '3')) =>
    dispatchOf({ mode: 'spawn', context, instruction: 'Check the word.', expectation: null })
  const create = async (answer: unknown, dispatch = spawned()) => {
    const c = copies(answer)
    const identities = sourceRequestIdentities({
      tenant: LEGAL_TENANT,
      source: DISPATCH_SOURCES.instruction,
      request: dispatch.id,
    })
    const created = await c.sessions.create(TENANT, {
      session: identities.session as unknown as SessionRef,
      dispatch,
      permission: 'never',
    })
    const [call] = c.made('create') as [
      { creation: { standing: { initial: { message: { blocks: [{ text: string }] } } } } }?,
    ]
    return { ...c, created, input: call?.creation.standing.initial.message.blocks[0].text }
  }

  it('starts from the copy of the conversation read by the moment of the dispatch, then the work', async () => {
    const { created, input, asked } = await create(read(view(CONVERSATION.slice(0, 3))))
    expect(created).toEqual({ kind: 'created' })
    expect(asked).toEqual([
      { tenant: LEGAL_TENANT, session: PARENT, moment: moment('epoch-1', '3') },
    ])
    expect(input).toContain('It starts from a copy of the conversation of the dispatching session')
    expect(input).toContain(
      'User:\nThe code word is HERON.\n\nAssistant:\nNoted.\n\nUser:\nNow hand it on.',
    )
    expect(input?.endsWith('Work:\nCheck the word.')).toBe(true)
    expect(input?.indexOf('HERON')).toBeLessThan(input?.indexOf('Work:') ?? 0)
  })

  it.each([
    ['the view cannot be read now', { kind: 'unavailable' }, { kind: 'unknown' }],
    ['the read is thrown', new Error('down'), { kind: 'unknown' }],
    [
      'the conversation was replaced since',
      read('gone'),
      {
        kind: 'failed',
        detail: 'the conversation of the dispatching session was compacted since the dispatch',
      },
    ],
  ])('creates nothing when %s', async (_name, answer, expected) => {
    const { created, made } = await create(answer)
    expect(created).toEqual(expected)
    expect(made('create')).toEqual([])
  })

  it('creates nothing for a spawn that has no moment, and reads no view for a delegate', async () => {
    const lost = await create(read(view(CONVERSATION)), spawned(null))
    expect(lost.created).toEqual({ kind: 'failed', detail: 'the spawn has no moment to copy' })
    const plain = await create(
      read(view(CONVERSATION)),
      dispatchOf({ mode: 'delegate', context: null }),
    )
    expect(plain.created).toEqual({ kind: 'created' })
    expect(plain.asked).toEqual([])
    expect(plain.input).not.toContain('copy of the conversation')
  })
})
