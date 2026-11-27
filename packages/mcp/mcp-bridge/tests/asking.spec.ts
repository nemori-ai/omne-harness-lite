import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import type { Access } from '@omne-harness/legal-identity'
import { toContentBlocks, type InvokeResult } from '@omne-harness/mcp-contract'
import {
  createMemoryContinuationRecords,
  generationOf,
  jsonOf,
  requestStateOf,
} from '@omne-harness/mcp-contract/testing'
import { succeed } from '@omne-harness/operation-result'
import type { ToolCommandDeclaration, ToolDecision } from '@omne-harness/tool-contract'
import {
  defineToolWaitContract,
  describedAdoption,
  isToolSourceSuspension,
  type ToolSourceCall,
  type ToolSourceSuspension,
  type ToolValueSchema,
} from '@omne-harness/tool-contract/provider'
import { checkpointDigest, decodeKept } from '../src/continuation.ts'
import type { McpPersonAsk, PersonQuestion } from '../src/index.ts'
import { action } from './support.ts'
import { alice, home, world, type Principal } from './world.ts'

function schema(id: string): ToolValueSchema<unknown> {
  return {
    identity: { id, revision: '1', digest: `sha256:${id}` },
    ref: { id: id as never, load: () => Promise.reject(new Error('no schema is loaded')) },
    maxBytes: 4096,
  }
}

const defined = defineToolWaitContract({
  kind: 'ask',
  adoption: describedAdoption({ owner: 'test', name: 'person', revision: '1' }),
  request: schema('person-request'),
  response: schema('person-response'),
  expiry: 'forbidden',
})
if ('failure' in defined) throw new Error('the wait contract of the test is not lawful')
const contract = defined.ok

const asked: PersonQuestion[][] = []
const person: McpPersonAsk = {
  contract,
  request(questions) {
    asked.push([...questions])
    return jsonOf({ questions: questions.map(question => question.id) })
  },
  reply(decision) {
    if (decision.kind !== 'answer')
      return { kind: decision.kind === 'declined' ? 'declined' : 'no-answer' }
    const value = decision.value as Record<string, string>
    return {
      kind: 'answered',
      answers: new Map(Object.entries(value).map(([id, text]) => [id, { kind: 'text', text }])),
    }
  },
}

const ASK_DAY = {
  when: {
    method: 'elicitation/create',
    params: {
      message: 'Which day?',
      requestedSchema: {
        type: 'object',
        properties: { date: { type: 'string' } },
        required: ['date'],
      },
    },
  },
}

const inputRequired = (requests: unknown, state = 's1'): InvokeResult => ({
  kind: 'sent',
  outcome: {
    kind: 'inputRequired',
    ...(requests === undefined ? {} : { inputRequests: { untrusted: jsonOf(requests) } }),
    requestState: requestStateOf(state),
    issuedAt: generationOf(1),
  },
})

const done: InvokeResult = {
  kind: 'sent',
  outcome: {
    kind: 'complete',
    content: toContentBlocks([jsonOf({ type: 'text', text: 'Booked on Tuesday.' })]),
    output: { kind: 'no-schema' },
  },
}

function arranged(maxInputRounds = 3) {
  const records = createMemoryContinuationRecords()
  let present = true
  const w = world(50, {
    person,
    continuations: () => (present ? records : undefined),
    maxInputRounds,
  })
  w.adopt(home, 'desk')
  w.offers('desk', [action('book', { inputSchema: { type: 'object' } })])
  return { w, records, remove: () => (present = false) }
}

async function declaredOf(w: ReturnType<typeof world>, asker: Access<Principal>) {
  await w.source.list(asker)
  const definition = w.source.select(asker, 'mcp__desk')?.definition
  const found = definition?.kind === 'commands' ? definition.commands[0] : undefined
  if (found === undefined) throw new Error('book is not selected')
  return found
}

const callOf = (declared: ToolCommandDeclaration): ToolSourceCall<Principal> => ({
  ...alice,
  name: 'mcp__desk',
  command: declared.name,
  declared,
  arguments: jsonOf({ room: 'A' }),
  invocation: 'call-1',
  program: false,
  signal: new AbortController().signal,
})

async function suspendedCall(w: ReturnType<typeof world>) {
  w.answers(() => inputRequired(ASK_DAY))
  const call = callOf(await declaredOf(w, alice))
  const answer = await w.source.execute(call)
  if (!isToolSourceSuspension(answer)) throw new Error('the call did not suspend')
  return { call, suspension: answer }
}

const resumeOf = (
  call: ToolSourceCall<Principal>,
  suspension: ToolSourceSuspension,
  response: ToolDecision<unknown>,
) => {
  const { arguments: _arguments, ...facts } = call
  return { ...facts, checkpoint: suspension.state, response }
}

function readable(value: JsonValue | undefined): unknown {
  if (value === undefined) return undefined
  switch (value.kind) {
    case 'object':
      return Object.fromEntries(value.entries.map(entry => [entry.key, readable(entry.value)]))
    case 'array':
      return value.items.map(readable)
    case 'number':
      return Number(value.lexeme)
    case 'null':
      return null
    default:
      return value.value
  }
}

describe('a peer that asks a person for input (C109, MC-30)', () => {
  it('suspends the call on the person: the questions go out on the wait, the checkpoint keeps what a resume needs, and nothing more is sent', async () => {
    const { w } = arranged()
    const { suspension } = await suspendedCall(w)
    expect(suspension.wait).toMatchObject({
      kind: 'ask',
      key: 'input',
      contract,
      request: jsonOf({ questions: ['q1'] }),
    })
    expect(suspension.closedResult).toContain('desk')
    expect(decodeKept(suspension.state)).toMatchObject({
      ref: { name: 'desk' },
      action: 'book',
      definition: 'sha256:book:1',
      requestState: 's1',
      round: 1,
    })
    expect(w.continued).toEqual([])
    expect(w.source.checkpoint?.waits).toEqual([contract])
  })

  it('takes the answer of the person back to the peer once, with its state and against the same definition, and ends with what the peer answers', async () => {
    const { w, records } = arranged()
    const { call, suspension } = await suspendedCall(w)
    w.continuesWith(() => done)
    const answer = await w.source.resume?.(
      resumeOf(call, suspension, { kind: 'answer', value: { q1: 'Tuesday' } }),
    )
    expect(answer).toMatchObject({ content: [{ kind: 'text' }] })
    expect(w.continued).toHaveLength(1)
    expect(w.continued[0]?.asker).toEqual({ principal: alice.principal, tenant: alice.tenant })
    const sent = w.continued[0]?.request
    expect(sent).toMatchObject({
      ref: { name: 'desk' },
      action: 'book',
      requestState: 's1',
      expectedDefinition: 'sha256:book:1',
      correlationKey: 'call-1',
      args: jsonOf({ room: 'A' }),
    })
    expect(readable(sent?.inputResponses)).toEqual({
      when: { action: 'accept', content: { date: 'Tuesday' } },
    })
    expect(records.marks()).toHaveLength(1)
    expect(records.marks()[0]).toContain(checkpointDigest(suspension.state))
  })

  it('a second run of the same checkpoint sends nothing and says the effect is not known (I1, MC-27)', async () => {
    const { w } = arranged()
    const { call, suspension } = await suspendedCall(w)
    w.continuesWith(() => done)
    const resume = resumeOf(call, suspension, { kind: 'answer', value: { q1: 'Tuesday' } })
    await w.source.resume?.(resume)
    await expect(w.source.resume?.(resume)).rejects.toThrow('was already sent once')
    expect(w.continued).toHaveLength(1)
  })

  it('without the records, or when they cannot be written, nothing is sent and the call did not start', async () => {
    for (const cut of ['absent', 'unavailable'] as const) {
      const { w, records, remove } = arranged()
      const { call, suspension } = await suspendedCall(w)
      if (cut === 'absent') remove()
      else records.cut()
      await expect(
        w.source.resume?.(resumeOf(call, suspension, { kind: 'answer', value: { q1: 'Tuesday' } })),
      ).rejects.toThrow('could not be written. Nothing was sent to the endpoint')
      expect(w.continued).toEqual([])
    }
  })

  it('the person declining or not answering goes back as decline or cancel', async () => {
    for (const [decision, action] of [
      [{ kind: 'declined' }, 'decline'],
      [{ kind: 'no-answer' }, 'cancel'],
    ] as const) {
      const { w } = arranged()
      const { call, suspension } = await suspendedCall(w)
      w.continuesWith(() => done)
      await w.source.resume?.(resumeOf(call, suspension, decision))
      expect(readable(w.continued[0]?.request.inputResponses)).toEqual({ when: { action } })
    }
  })

  it('a peer that asks again suspends again, up to the bound; past it the effect is not known', async () => {
    const { w } = arranged(2)
    const { call, suspension } = await suspendedCall(w)
    w.continuesWith(() => inputRequired(ASK_DAY, 's2'))
    const again = await w.source.resume?.(
      resumeOf(call, suspension, { kind: 'answer', value: { q1: 'Monday' } }),
    )
    if (again === undefined || !isToolSourceSuspension(again))
      throw new Error('did not suspend again')
    expect(decodeKept(again.state)).toMatchObject({ requestState: 's2', round: 2 })
    await expect(
      w.source.resume?.(resumeOf(call, again, { kind: 'answer', value: { q1: 'Tuesday' } })),
    ).rejects.toThrow('asked for input more than 2 times')
    expect(w.continued).toHaveLength(2)
  })

  it('what cannot be put to a person goes back as cancel at once; only a state goes back at once with nothing else', async () => {
    const { w } = arranged()
    const declared = await declaredOf(w, alice)
    w.answers(() =>
      inputRequired({
        when: {
          method: 'elicitation/create',
          params: { requestedSchema: { type: 'object', properties: { a: { type: 'array' } } } },
        },
      }),
    )
    w.continuesWith(() => done)
    expect(isToolSourceSuspension(await w.source.execute(callOf(declared)))).toBe(false)
    expect(readable(w.continued[0]?.request.inputResponses)).toEqual({ when: { action: 'cancel' } })
    w.answers(() => inputRequired(undefined, 's9'))
    await w.source.execute(callOf(declared))
    expect(w.continued[1]?.request).toMatchObject({ requestState: 's9' })
    expect(w.continued[1]?.request).not.toHaveProperty('inputResponses')
    expect(asked.length).toBeGreaterThan(0)
  })

  it('questions that do not fit one request of the wait go back as cancel at once', async () => {
    const records = createMemoryContinuationRecords()
    const tooBig: McpPersonAsk = { ...person, request: () => undefined }
    const w = world(50, { person: tooBig, continuations: () => records, maxInputRounds: 3 })
    w.adopt(home, 'desk')
    w.offers('desk', [action('book', { inputSchema: { type: 'object' } })])
    w.answers(() => inputRequired(ASK_DAY))
    w.continuesWith(() => done)
    expect(isToolSourceSuspension(await w.source.execute(callOf(await declaredOf(w, alice))))).toBe(
      false,
    )
    expect(readable(w.continued[0]?.request.inputResponses)).toEqual({ when: { action: 'cancel' } })
  })

  it('a checkpoint or an answer this bridge did not give out is refused, and nothing is marked or sent', async () => {
    const { w, records } = arranged()
    const { call, suspension } = await suspendedCall(w)
    const odd = { ...suspension, state: new TextEncoder().encode('{"not":"ours"}') }
    await expect(
      w.source.resume?.(resumeOf(call, odd, { kind: 'answer', value: { q1: 'Tuesday' } })),
    ).rejects.toThrow('not one this bridge gave out')
    const unread: McpPersonAsk = { ...person, reply: () => undefined }
    const other = world(50, { person: unread, continuations: () => records, maxInputRounds: 3 })
    await expect(
      other.source.resume?.(resumeOf(call, suspension, { kind: 'answer', value: {} })),
    ).rejects.toThrow('not one this bridge gave out')
    expect(records.marks()).toEqual([])
    expect(w.continued).toEqual([])
  })

  it('a continuation the core could not send ends the call as not started, and its words say why', async () => {
    const { w } = arranged()
    const { call, suspension } = await suspendedCall(w)
    w.continuesWith(() => ({ kind: 'not-sent', reason: { kind: 'definition-changed' } }))
    await expect(
      w.source.resume?.(resumeOf(call, suspension, { kind: 'answer', value: { q1: 'Tuesday' } })),
    ).rejects.toThrow('Nothing was sent to the endpoint')
  })

  it('a request that is not a form ends the call: the effect is not known', async () => {
    const { w } = arranged()
    w.answers(() => inputRequired({ x: { method: 'sampling/createMessage', params: {} } }))
    await expect(w.source.execute(callOf(await declaredOf(w, alice)))).rejects.toThrow(
      'a kind of input this version did not offer',
    )
    expect(w.continued).toEqual([])
  })
})

describe('a bridge given no way to ask a person', () => {
  it('has no checkpoint, and a peer asking for input ends the call as before', async () => {
    const w = world()
    w.adopt(home, 'desk')
    w.offers('desk', [action('book', { inputSchema: { type: 'object' } })])
    expect(w.source.checkpoint).toBeUndefined()
    expect(w.source.resume).toBeUndefined()
    w.answers(() => inputRequired(ASK_DAY))
    await expect(w.source.execute(callOf(await declaredOf(w, alice)))).rejects.toThrow(
      'asked a person for more input',
    )
    expect(succeed(1)).toEqual({ ok: 1 })
  })
})
