// Properties P2 to P4 of the replay design, over generated sequences of conversation operations
// encoded by the real Messages engine. Not a proof: no counterexample on the generated sequences.
import { writeJsonText } from '@omne-harness/json-text'
import type { FixedModelRequest } from '@omne-harness/model-contract'
import { describe, expect, it } from 'vitest'
import type { PiFamilyBinding } from '../src/index.ts'
import { bindMessages, type MessagesRecord } from '../src/messages/index.ts'
import { sealThinking } from '../src/messages/reasoning.ts'
import {
  LIMITS,
  engineProbe,
  fixedRequest,
  message,
  supplierOf,
  testMeter,
  textBlock,
  thinkingBlock,
  tool,
} from './support/chat-record.ts'
import { messagesRecord } from './support/messages-record.ts'

type Model = 'a' | 'b'

const RECORDS: Readonly<Record<Model, MessagesRecord>> = {
  a: messagesRecord(),
  b: messagesRecord({ name: 'model-b', route: { provider: 'gateway', model: 'lab/model-b' } }),
}
const BINDINGS: Readonly<Record<Model, PiFamilyBinding>> = {
  a: bind(RECORDS.a),
  b: bind(RECORDS.b),
}

function bind(record: MessagesRecord): PiFamilyBinding {
  return bindMessages({
    record,
    supplier: supplierOf(record),
    meter: testMeter(record, engineProbe()),
    limits: LIMITS,
    release: async () => {},
  })
}

// A small seeded generator, so every failing sequence can be replayed from its seed.
function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Produced = Readonly<{ signature: string; before: string; system: string; tools: string }>

type World = {
  messages: unknown[]
  model: Model
  tools: number
  serial: number
  produced: Produced[]
}

const id = (world: World, kind: string) => `${kind}${String(world.serial++).padStart(4, '0')}`

function request(world: World, model: Model): FixedModelRequest {
  return fixedRequest(RECORDS[model], {
    system: [textBlock('s1', 'brief')],
    messages: world.messages,
    tools: Array.from({ length: world.tools }, (_, index) => tool(`lookup${index}`)),
  })
}

type Sent = Readonly<{ body: Readonly<Record<string, unknown>>; prefix: string }>

function send(world: World, model: Model): Sent {
  const fixed = request(world, model)
  const log = JSON.stringify(fixed.messages)
  const encoded = BINDINGS[model].encode({
    request: fixed,
    media: [],
    declaration: fixed.declarations[0],
    resent: [],
  })
  if (!('ok' in encoded)) throw new Error(`encode failed: ${JSON.stringify(encoded.failure)}`)
  // P3: sending leaves the log as it was, byte for byte.
  expect(JSON.stringify(fixed.messages)).toBe(log)
  const body = JSON.parse(writeJsonText(encoded.ok.body)) as Record<string, unknown>
  // The dispatch says it carries reasoning state exactly when its body does.
  expect(encoded.ok.replayCarried).toBe(carried(body).size > 0)
  return { body, prefix: encoded.ok.replayPrefix }
}

type Turn = Readonly<{ role: string; content: readonly Readonly<Record<string, unknown>>[] }>

// The turns of a body without cache marks, which only ever sit on the last part.
function turnsOf(body: Readonly<Record<string, unknown>>): readonly Turn[] {
  const turns = body.messages as readonly Turn[]
  return turns.map(turn => ({
    role: turn.role,
    content: turn.content.map(part => {
      const { cache_control: _mark, ...rest } = part
      return rest
    }),
  }))
}

function carried(body: Readonly<Record<string, unknown>>): ReadonlyMap<string, number> {
  const at = new Map<string, number>()
  for (const [index, turn] of turnsOf(body).entries())
    for (const part of turn.content)
      if (part.type === 'thinking' && typeof part.signature === 'string')
        at.set(part.signature, index)
  return at
}

function reply(world: World, model: Model): void {
  const sent = send(world, model)
  const before = JSON.stringify(turnsOf(sent.body))
  const thought = `thought ${world.serial}`
  const signature = `sig-${model}-${world.serial}`
  const record = RECORDS[model]
  world.messages.push(
    message(
      id(world, 'a'),
      'assistant',
      [
        thinkingBlock(id(world, 'k'), thought),
        {
          kind: 'reasoning_state',
          id: id(world, 'r'),
          visibility: { toHuman: false, toModel: true },
          payload: sealThinking([{ type: 'thinking', thinking: thought, signature }]),
          pairs: [],
        },
        textBlock(id(world, 't'), `answer ${world.serial}`),
      ],
      {
        replay: {
          scope: `${record.route.provider}/${record.route.model}`,
          format: record.replay.formats.produces,
          at: [1],
          prefix: sent.prefix,
        },
      },
    ),
  )
  if (model === 'a')
    world.produced.push({
      signature,
      before,
      system: JSON.stringify(sent.body.system),
      tools: JSON.stringify(sent.body.tools ?? null),
    })
}

function user(world: World): void {
  world.messages.push(
    message(id(world, 'u'), 'user', [textBlock(id(world, 'b'), `ask ${world.serial}`)]),
  )
}

// To the engine a compaction is history replaced: a summary in place of what it covers.
function compact(world: World): void {
  const tail = world.messages.slice(-2)
  world.messages = [
    message(id(world, 'c'), 'user', [textBlock(id(world, 'b'), `summary ${world.serial}`)]),
    ...tail,
  ]
}

// P2: whatever is carried has, before it, the bytes it was produced on.
function checkCarried(world: World, sent: Sent): void {
  const turns = turnsOf(sent.body)
  for (const [signature, index] of carried(sent.body)) {
    const produced = world.produced.find(item => item.signature === signature)
    if (produced === undefined)
      throw new Error(`a state of another model was carried: ${signature}`)
    expect(JSON.stringify(turns.slice(0, index)), signature).toBe(produced.before)
    expect(JSON.stringify(sent.body.system)).toBe(produced.system)
    expect(JSON.stringify(sent.body.tools ?? null)).toBe(produced.tools)
  }
}

describe('replay properties on generated sequences (P2, P3)', () => {
  it.each(Array.from({ length: 60 }, (_, seed) => seed + 1))('seed %i', seed => {
    const next = random(seed)
    const world: World = { messages: [], model: 'a', tools: 1, serial: 0, produced: [] }
    user(world)
    for (let step = 0; step < 14; step++) {
      const roll = next()
      if (roll < 0.35) {
        reply(world, world.model)
        user(world)
      } else if (roll < 0.55) world.model = world.model === 'a' ? 'b' : 'a'
      else if (roll < 0.7) world.tools = 1 + Math.floor(next() * 3)
      else if (roll < 0.8 && world.messages.length > 3) compact(world)
      else user(world)
      checkCarried(world, send(world, 'a'))
    }
  })
})

describe('switching away and back (P4)', () => {
  it.each(Array.from({ length: 30 }, (_, seed) => seed + 101))('seed %i', seed => {
    const next = random(seed)
    const world: World = { messages: [], model: 'a', tools: 1, serial: 0, produced: [] }
    user(world)
    const own = 1 + Math.floor(next() * 3)
    for (let round = 0; round < own; round++) {
      reply(world, 'a')
      user(world)
    }
    const away = 1 + Math.floor(next() * 4)
    for (let round = 0; round < away; round++) {
      reply(world, 'b')
      user(world)
    }
    const sent = send(world, 'a')
    expect([...carried(sent.body).keys()].toSorted()).toEqual(
      world.produced.map(item => item.signature).toSorted(),
    )
    checkCarried(world, sent)
  })
})
