// Captures one real stream per current record into tests/fixtures/records/<name>/<revision>/:
// request.json (the request and the body the engine writes), stream.sse (the gateway's bytes as
// they arrived) and facts.json (what the engine decodes from them). It sends through a local
// forwarder that adds the credential, so no key is read here. Run from this package:
//   NODE_EXTRA_CA_CERTS=<ca.crt> node --conditions=source --experimental-strip-types \
//     tests/live/capture-records.ts <forwarder origin> [<record name>...]
// With --replay instead of an origin it sends nothing: it rewrites request.json and facts.json
// from the stream already captured, and refuses when the body differs from the one sent.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { Adoption, FixedModelRequest } from '@omne-harness/model-contract'
import {
  judgeFixedModelRequest,
  judgeReplayDeclaration,
} from '@omne-harness/model-contract/provider'
import { recordAdoption, recordProvider } from '@omne-harness/pi-ai-transport'
import { bindChatCompletions } from '@omne-harness/pi-ai-transport/chat-completions'
import { fixtureDirectory, replayStream } from '@omne-harness/pi-ai-transport/testing'
import { QWEN_OWNER } from '../../src/owner.ts'
import type { QwenRecord } from '../../src/record.ts'
import { QWEN_RECORDS } from '../../src/records.ts'
import { chatTextHooks, componentAdoption } from '@omne-harness/pi-ai-transport/family-kit'

const ROOT = fileURLToPath(new URL('../fixtures/records/', import.meta.url))
const TEST_ADOPTION = (name: string): Adoption => ({
  owner: 'pi-ai-qwen-tests',
  name,
  revision: '1',
  digest: 'a'.repeat(64),
})
const LIMITS = {
  toolArguments: {
    maxBytes: 65536,
    maxDepth: 32,
    maxItems: 1024,
    maxMembers: 256,
    maxStringLength: 65536,
    maxNumberLength: 64,
  },
  maxReasoningText: 1048576,
}
const text = (value: string) => ({ kind: 'string', value })
const WEATHER_SCHEMA = {
  kind: 'object',
  entries: [
    { key: 'type', value: text('object') },
    {
      key: 'properties',
      value: {
        kind: 'object',
        entries: [
          {
            key: 'city',
            value: { kind: 'object', entries: [{ key: 'type', value: text('string') }] },
          },
        ],
      },
    },
    { key: 'required', value: { kind: 'array', items: [text('city')] } },
  ],
}
const shown = { toHuman: true, toModel: true }

function requestOf(record: QwenRecord): Readonly<{
  plain: Record<string, unknown>
  request: FixedModelRequest
}> {
  const adoption = recordAdoption(QWEN_OWNER, record)
  const supplier = {
    adoption,
    provider: recordProvider(record),
    model: record.route.model,
    credential: { layer: 'official' },
  }
  const declared = judgeReplayDeclaration(
    { provider: supplier.provider, model: supplier.model, replay: record.replay.declaration },
    0,
  )
  if (!('ok' in declared)) throw new Error(`${record.name}: declaration`)
  const parameters = [
    { kind: 'max-output-tokens', value: '1024' },
    { kind: 'reasoning-effort', value: 'high' },
  ]
  const plain = {
    profile: TEST_ADOPTION('profile'),
    suppliers: [supplier],
    fallback: false,
    retryPolicy: TEST_ADOPTION('retry'),
    parameters,
    system: [
      {
        kind: 'text',
        id: 's1',
        visibility: shown,
        text: 'Answer briefly. Call tools one at a time.',
      },
    ],
    messages: [
      {
        id: 'msg_u100000000000000000000',
        role: 'user',
        blocks: [
          {
            kind: 'text',
            id: 'b1',
            visibility: shown,
            text: 'Work out how many positive integers below 100 are divisible by 3 or by 7 but not by both. If the count is even, get the weather of Oslo, otherwise of Lima. Use the tool.',
          },
        ],
      },
    ],
    tools: [
      {
        name: 'get_weather',
        description: 'Read the current weather of one city.',
        argumentsSchema: WEATHER_SCHEMA,
      },
    ],
    toolChoice: 'auto',
    declarations: [declared.ok],
    representation: componentAdoption(QWEN_OWNER, record, 'representation'),
    parameterAdoptions: parameters.map(parameter => ({
      supplier: adoption,
      applied: parameter,
      origin: { kind: 'explicit', requested: parameter, source: TEST_ADOPTION('source') },
    })),
    source: TEST_ADOPTION('source'),
  }
  const judged = judgeFixedModelRequest(plain)
  if (!('ok' in judged)) throw new Error(`${record.name}: ${JSON.stringify(judged.failure)}`)
  return { plain, request: judged.ok }
}

function bindingOf(record: QwenRecord, request: FixedModelRequest) {
  const supplier = request.suppliers[0]
  const unavailable = async () =>
    ({ failure: { kind: 'unavailable', dependency: 'capture', diagnostic: 'no meter' } }) as const
  return bindChatCompletions({
    record,
    hooks: chatTextHooks(QWEN_OWNER, record),
    supplier,
    meter: {
      instance: {
        basis: { supplier: { adoption: supplier.adoption } } as never,
        measure: unavailable,
        measureCalibrated: unavailable,
      },
      represent: () => ({
        adoption: componentAdoption(QWEN_OWNER, record, 'representation'),
        tokenInput: { kind: 'null' },
        units: [],
      }),
    },
    limits: LIMITS,
    release: async () => {},
  })
}

// Key order means nothing in JSON; the body sent and the body written are compared without it.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .toSorted()
      .map(key => `${JSON.stringify(key)}:${canonical(Reflect.get(value, key))}`)
      .join(',')}}`
  return JSON.stringify(value)
}

function plainJson(value: JsonValue): unknown {
  return JSON.parse(writeJsonText(value))
}

async function rewrite(record: QwenRecord) {
  const { plain, request } = requestOf(record)
  const binding = bindingOf(record, request)
  const encoded = binding.encode({
    request,
    media: [],
    declaration: request.declarations[0],
    resent: [],
  })
  if (!('ok' in encoded)) throw new Error(`${record.name}: ${JSON.stringify(encoded.failure)}`)
  const directory = join(ROOT, fixtureDirectory(record))
  const sent: unknown = Reflect.get(
    JSON.parse(readFileSync(join(directory, 'request.json'), 'utf8')),
    'body',
  )
  const body = plainJson(encoded.ok.body)
  if (canonical(sent) !== canonical(body))
    throw new Error(`${record.name}: the body differs from the one the stream answered`)
  const stream = new Uint8Array(readFileSync(join(directory, 'stream.sse')))
  const facts = await replayStream(binding, stream, request)
  writeFileSync(
    join(directory, 'request.json'),
    `${JSON.stringify({ request: plain, body }, null, 2)}\n`,
  )
  writeFileSync(join(directory, 'facts.json'), `${JSON.stringify(facts, null, 2)}\n`)
  console.log(`${record.name}/${record.revision}: rewritten from the captured stream`)
}

async function capture(origin: string, record: QwenRecord) {
  const { plain, request } = requestOf(record)
  const binding = bindingOf(record, request)
  const encoded = binding.encode({
    request,
    media: [],
    declaration: request.declarations[0],
    resent: [],
  })
  if (!('ok' in encoded)) throw new Error(`${record.name}: ${JSON.stringify(encoded.failure)}`)
  const body = writeJsonText(encoded.ok.body)
  const response = await fetch(new URL('/api/v1/chat/completions', origin), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body,
  })
  const stream = new Uint8Array(await response.arrayBuffer())
  if (response.status !== 200)
    throw new Error(
      `${record.name}: HTTP ${response.status}: ${new TextDecoder().decode(stream).slice(0, 400)}`,
    )
  const facts = await replayStream(binding, stream, request)
  const directory = join(ROOT, fixtureDirectory(record))
  rmSync(join(ROOT, encodeURIComponent(record.name)), { recursive: true, force: true })
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    join(directory, 'request.json'),
    `${JSON.stringify({ request: plain, body: plainJson(encoded.ok.body) }, null, 2)}\n`,
  )
  writeFileSync(join(directory, 'stream.sse'), stream)
  writeFileSync(join(directory, 'facts.json'), `${JSON.stringify(facts, null, 2)}\n`)
  const kinds = facts.flatMap(fact => (fact.kind === 'block-seal' ? [fact.block.kind] : []))
  const end = facts.at(-1)
  console.log(`${record.name}/${record.revision}: ${kinds.join(',')} ${JSON.stringify(end)}`)
}

const [origin, ...names] = process.argv.slice(2)
if (origin === undefined)
  throw new Error('usage: capture-records.ts <forwarder origin> [<record name>...]')
for (const record of QWEN_RECORDS)
  if (names.length === 0 || names.includes(record.name))
    await (origin === '--replay' ? rewrite(record) : capture(origin, record))
