import { writeJsonText } from '@omne-harness/json-text'
import { describe, expect, it } from 'vitest'
import { bindChatCompletions } from '../src/chat-completions/index.ts'
import {
  LIMITS,
  engineProbe,
  fixedRequest,
  message,
  supplierOf,
  testHooks,
  testMeter,
  testRecord,
  textBlock,
} from './support/chat-record.ts'

// P1 at the wire: when the message list only grows, the encoded body of the longer list keeps every
// member of the shorter one and starts its `messages` with the shorter list, byte for byte.

type Body = Readonly<{ messages: readonly unknown[] } & Record<string, unknown>>
type Encoder = (messages: readonly unknown[]) => Body

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 2 ** 32
  }
}

function logOf(next: () => number, length: number): readonly unknown[] {
  return Array.from({ length }, (_, index) => {
    const roll = next()
    const role = roll < 0.4 ? 'user' : roll < 0.8 ? 'assistant' : 'system_reminder'
    const words = `entry ${index} ${Math.floor(roll * 1_000_000)}`
    return message(`m${index}`, role, [textBlock('b1', words)])
  })
}

const record = testRecord()
const binding = bindChatCompletions({
  record,
  supplier: supplierOf(record),
  hooks: testHooks(engineProbe()),
  meter: testMeter(record, engineProbe()),
  limits: LIMITS,
  release: async () => {},
})

const realEncoder: Encoder = messages => {
  const request = fixedRequest(record, { messages })
  const outcome = binding.encode({
    request,
    media: [],
    declaration: request.declarations[0],
    resent: [],
  })
  if (!('ok' in outcome)) throw new Error(`encode failed: ${JSON.stringify(outcome.failure)}`)
  return JSON.parse(writeJsonText(outcome.ok.body)) as Body
}

// The broken projection P1 must catch: a reminder that is not in the log, put before the last
// message.
const insertingEncoder: Encoder = messages => {
  const body = realEncoder(messages)
  const at = Math.max(1, body.messages.length - 1)
  return {
    ...body,
    messages: [
      ...body.messages.slice(0, at),
      { role: 'developer', content: `count ${messages.length}` },
      ...body.messages.slice(at),
    ],
  }
}

function rest(body: Body): string {
  const { messages: _messages, ...others } = body
  return JSON.stringify(others)
}

function counterexample(encoder: Encoder, seeds: number): string | null {
  for (let seed = 1; seed <= seeds; seed++) {
    const next = random(seed)
    const length = 2 + Math.floor(next() * 12)
    const log = logOf(next, length)
    const cut = 1 + Math.floor(next() * (length - 1))
    const earlier = encoder(log.slice(0, cut))
    const later = encoder(log)
    if (rest(earlier) !== rest(later)) return `seed ${seed}: a member besides messages changed`
    const head = later.messages.slice(0, earlier.messages.length)
    if (JSON.stringify(head) !== JSON.stringify(earlier.messages))
      return `seed ${seed}: the later body does not start with the earlier one (cut ${cut} of ${length})`
  }
  return null
}

describe('P1 at the wire', () => {
  it('holds on generated logs', () => {
    expect(counterexample(realEncoder, 200)).toBeNull()
  })
  it('finds a counterexample when the encoding inserts content that is not in the log', () => {
    expect(counterexample(insertingEncoder, 200)).toMatch(/does not start with/u)
  })
})
