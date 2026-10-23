// @module-tag slow — starts openssl child processes and real local HTTPS servers, writes vault
// files, and drives Model calls through the assembled send path.
//
// The recorder of real requests, against a local HTTPS server that stands in for the gateway.
// The server writes its answer in several pieces, so the body arrives with chunked transfer
// coding. The recorder must write exactly the bytes the server sent, a note whose digest is the
// SHA-256 of the request body the server received, and nothing at all when a condition fails.
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ANTHROPIC_RECORDS } from '@omne-harness/pi-ai-anthropic'
import { OPENAI_RECORDS } from '@omne-harness/pi-ai-openai'
import { startTunnelProxy } from './support/connect-proxy.ts'
import { createCertificate, startHttpsServer, type HttpsFixture } from './support/https-server.ts'
import { PLACEHOLDER, ROUTE_PATH } from './support/local-host.ts'
import { recordRound, type RecordInput } from './support/recorder.ts'
import {
  continuedRequest,
  firstRoundRequest,
  RECORD_CASES,
  RECORDING_FILES,
  replayRound,
  REPLY_ID,
  type RecordCaseName,
} from './support/recording-cases.ts'
import { readCapturedStream, readRecordFixture, type FamilyName } from './support/records.ts'

/** The record body of the family model with a reasoning state reply: the server's answer. */
function recordedStream(family: FamilyName, model: string): string {
  const records = family === 'pi-ai-openai' ? OPENAI_RECORDS : ANTHROPIC_RECORDS
  const record = records.find(entry => entry.name === model)
  if (record === undefined) throw new Error(`no record ${model}`)
  return readRecordFixture(family, record).stream
}

const FIRST_ROUNDS = [
  'openai-reasoning',
  'anthropic-reasoning',
] as const satisfies readonly RecordCaseName[]
const NOW = new Date('2026-10-23T12:34:56.789Z')

const certificate = createCertificate()
let server: HttpsFixture
const PIECE_BYTES = 40
/** What the server answers next: a status and the body, written in pieces of `PIECE_BYTES`. */
let answer: Readonly<{ status: number; body: string | Buffer }>
let root: string
let output: string
let vault: string

beforeAll(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-recorder-')))
  server = await startHttpsServer(certificate, (res, request) => {
    if (request.path !== ROUTE_PATH) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(answer.status, { 'content-type': 'text/event-stream' })
    // One piece per timer turn: each reaches the client as its own chunk of the transfer coding.
    const bytes = typeof answer.body === 'string' ? Buffer.from(answer.body, 'utf8') : answer.body
    const writeFrom = (at: number): void => {
      if (at >= bytes.byteLength) {
        res.end()
        return
      }
      res.write(bytes.subarray(at, at + PIECE_BYTES))
      setTimeout(() => writeFrom(at + PIECE_BYTES), 2)
    }
    writeFrom(0)
  })
})
afterAll(async () => {
  await server.close()
  certificate.dispose()
  rmSync(root, { recursive: true, force: true })
})
let run = 0
beforeEach(() => {
  run += 1
  output = join(root, `out-${run}`)
  vault = realpathSync(mkdtempSync(join(root, `vault-${run}-`)))
})

function inputOf(name: RecordCaseName, overrides: Partial<RecordInput> = {}): RecordInput {
  const item = RECORD_CASES[name]
  return {
    name,
    request: firstRoundRequest(item),
    requiresReasoningState: item.requiresReasoningState,
    gateway: { url: server.url, ca: certificate.cert },
    output,
    vault,
    now: () => NOW,
    ...overrides,
  }
}

const sha256 = (text: string) =>
  createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex')

describe('a recording through the assembled path', () => {
  it.each(FIRST_ROUNDS)(
    '%s: the body is written byte for byte, and the note holds the model, the digest of the sent body and the time',
    async name => {
      const item = RECORD_CASES[name]
      const body = recordedStream(item.family, item.model)
      answer = { status: 200, body }
      const before = server.requests.length
      const outcome = await recordRound(inputOf(name))

      const received = server.requests.slice(before)
      expect(received).toHaveLength(1)
      // The request went out through the vault's placeholder, through the send fence.
      expect(received[0]?.headers.authorization).toBe(`Bearer ${PLACEHOLDER}`)
      const sent = received[0]?.body ?? ''
      const directory = join(output, name)
      expect(outcome).toEqual({
        kind: 'written',
        directory,
        note: { model: item.model, payloadDigest: sha256(sent), recordedAt: NOW.toISOString() },
        bytes: Buffer.byteLength(body),
        termination: expect.anything(),
        reasoningState: true,
      })
      // Two files and nothing else: no header, no request body.
      expect(readdirSync(output)).toEqual([name])
      expect(readdirSync(directory).sort()).toEqual([RECORDING_FILES.note, RECORDING_FILES.stream])
      expect(readFileSync(join(directory, RECORDING_FILES.stream)).equals(Buffer.from(body))).toBe(
        true,
      )
      expect(JSON.parse(readFileSync(join(directory, RECORDING_FILES.note), 'utf8'))).toEqual({
        model: item.model,
        payloadDigest: sha256(sent),
        recordedAt: NOW.toISOString(),
      })
      // The request is the case's own: its parameters and its one question.
      const json: unknown = JSON.parse(sent)
      expect(Reflect.get(Object(json), 'model')).toBe(item.model)
      const maxTokens = item.parameters.find(parameter => parameter.kind === 'max-output-tokens')
      expect(String(Reflect.get(Object(json), 'max_tokens'))).toBe(maxTokens?.value)
      expect(Reflect.get(Object(json), 'messages')).toHaveLength(1)
    },
  )

  it('through a CONNECT proxy, as the real run goes, the body is still written byte for byte', async () => {
    const proxy = await startTunnelProxy()
    try {
      const item = RECORD_CASES['anthropic-reasoning']
      const body = recordedStream(item.family, item.model)
      answer = { status: 200, body }
      const outcome = await recordRound(
        inputOf('anthropic-reasoning', {
          gateway: {
            url: server.url,
            ca: certificate.cert,
            proxy: { url: proxy.url.href, bypass: [] },
          },
        }),
      )
      expect(proxy.connects).toEqual([server.url.host])
      expect(outcome).toMatchObject({ kind: 'written', bytes: Buffer.byteLength(body) })
      const written = readFileSync(join(output, 'anthropic-reasoning', RECORDING_FILES.stream))
      expect(written.equals(Buffer.from(body))).toBe(true)
    } finally {
      await proxy.close()
    }
  })
})

describe('the recorder writes nothing', () => {
  const fakes = [
    ['openrouter-key', `${'sk-'}or-v1-${'0f'.repeat(32)}`],
    ['bearer-credential', `Bearer ${'k3y'.repeat(8)}`],
    ['private-key', `-----BEGIN ${'EC PRIVATE'} KEY-----`],
  ] as const

  it.each(fakes)(
    'when the body holds a key of pattern %s, and the refusal names the pattern only',
    async (pattern, fake) => {
      const item = RECORD_CASES['openai-reasoning']
      // An SSE comment line: the call still settles, so only the key check stops the write.
      answer = { status: 200, body: `: ${fake}\n\n${recordedStream(item.family, item.model)}` }
      const outcome = await recordRound(inputOf('openai-reasoning'))
      expect(outcome).toEqual({ kind: 'refused', refusal: { kind: 'secret', patterns: [pattern] } })
      expect(JSON.stringify(outcome)).not.toContain(fake)
      expect(existsSync(output)).toBe(false)
    },
  )

  it('when the gateway answers with an error status', async () => {
    answer = { status: 401, body: '{"error":{"message":"no auth"}}' }
    const outcome = await recordRound(inputOf('anthropic-reasoning'))
    expect(outcome).toEqual({ kind: 'refused', refusal: { kind: 'status', status: 401 } })
    expect(existsSync(output)).toBe(false)
  })

  it('when a case that requires a reasoning state gets a reply without one', async () => {
    const item = RECORD_CASES['openai-reasoning']
    const body = recordedStream(item.family, item.model).replace(
      /"reasoning_details":\[[^\]]*\],/u,
      '',
    )
    expect(body).not.toContain('reasoning_details')
    answer = { status: 200, body }
    const outcome = await recordRound(inputOf('openai-reasoning'))
    expect(outcome).toEqual({ kind: 'refused', refusal: { kind: 'reasoning-state-missing' } })
    expect(existsSync(output)).toBe(false)
  })

  it('and sends nothing when the recording exists already', async () => {
    const directory = join(output, 'openai-reasoning')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'keep'), 'kept')
    const before = server.requests.length
    const outcome = await recordRound(inputOf('openai-reasoning'))
    expect(outcome).toEqual({ kind: 'refused', refusal: { kind: 'recording-exists', directory } })
    expect(server.requests.length).toBe(before)
    expect(readdirSync(directory)).toEqual(['keep'])
  })
})

describe('a continued round', () => {
  it.each([
    ['openai-reasoning-continued', 'reasoning_details'],
    ['anthropic-reasoning-continued', 'reasoning_details'],
  ] as const)(
    '%s: carries the first round’s replayed reply and the next question, and is recorded the same way',
    async (name, carried) => {
      const item = RECORD_CASES[name]
      if (item.round.kind !== 'continued') throw new Error('not a continued case')
      const firstName = item.round.first
      const first = RECORD_CASES[firstName]
      const body = recordedStream(first.family, first.model)
      answer = { status: 200, body }
      const firstRequest = firstRoundRequest(first)
      expect(await recordRound(inputOf(firstName))).toMatchObject({ kind: 'written' })

      // The first round's reply comes from its recording, replayed through the same path.
      const replayed = await replayRound({
        request: firstRequest,
        recording: join(output, firstName),
        label: `replay-${firstName}`,
        vault,
      })
      expect(replayed.blocks.some(block => block.kind === 'reasoning_state')).toBe(true)
      const request = continuedRequest({ first: firstRequest, replayed })
      expect(request.messages.map(message => message.id)).toEqual([
        firstRequest.messages[0]?.id,
        REPLY_ID,
        'msg_q200000000000000000000',
      ])

      const before = server.requests.length
      const outcome = await recordRound(inputOf(name, { request }))
      const sent = server.requests.slice(before)
      expect(sent).toHaveLength(1)
      const messages: unknown = Reflect.get(Object(JSON.parse(sent[0]?.body ?? '')), 'messages')
      expect(messages).toHaveLength(3)
      expect(JSON.stringify(Reflect.get(Object(messages), 1))).toContain(carried)
      expect(outcome).toMatchObject({
        kind: 'written',
        note: { model: item.model, payloadDigest: sha256(sent[0]?.body ?? '') },
      })
    },
  )

  it('is refused when the first round’s note names another request body', async () => {
    const first = RECORD_CASES['openai-reasoning']
    answer = { status: 200, body: recordedStream(first.family, first.model) }
    expect(await recordRound(inputOf('openai-reasoning'))).toMatchObject({ kind: 'written' })
    const note = join(output, 'openai-reasoning', RECORDING_FILES.note)
    const parsed: unknown = JSON.parse(readFileSync(note, 'utf8'))
    writeFileSync(note, JSON.stringify({ ...Object(parsed), payloadDigest: '0'.repeat(64) }))
    await expect(
      replayRound({
        request: firstRoundRequest(first),
        recording: join(output, 'openai-reasoning'),
        label: 'replay-tampered',
        vault,
      }),
    ).rejects.toThrow('the replayed request body is not the recorded one')
  })
})

describe('a real reply captured from the gateway', () => {
  // openai/gpt-5.6-sol at medium effort, the request of the openai-reasoning case: 92 summary
  // pieces, one encrypted item and the answer, about a hundred facts. Each fact used to be saved
  // on its own, and the confirmed snapshots of all of them did not fit the call's capacity.
  it('openai-reasoning: the first round is written with its reasoning state, and the continued round carries it', async () => {
    const first = RECORD_CASES['openai-reasoning']
    const record = OPENAI_RECORDS.find(entry => entry.name === first.model)
    if (record === undefined) throw new Error(`no record ${first.model}`)
    const body = readCapturedStream(first.family, record)
    answer = { status: 200, body }
    const firstRequest = firstRoundRequest(first)
    expect(await recordRound(inputOf('openai-reasoning'))).toMatchObject({
      kind: 'written',
      bytes: body.byteLength,
      reasoningState: true,
    })
    const written = readFileSync(join(output, 'openai-reasoning', RECORDING_FILES.stream))
    expect(written.equals(body)).toBe(true)

    const replayed = await replayRound({
      request: firstRequest,
      recording: join(output, 'openai-reasoning'),
      label: 'replay-captured',
      vault,
    })
    expect(replayed.blocks.map(block => block.kind)).toEqual([
      'thinking',
      'text',
      'reasoning_state',
    ])
    const request = continuedRequest({ first: firstRequest, replayed })
    const before = server.requests.length
    const outcome = await recordRound(inputOf('openai-reasoning-continued', { request }))
    const sent = server.requests.slice(before)
    expect(sent).toHaveLength(1)
    const messages: unknown = Reflect.get(Object(JSON.parse(sent[0]?.body ?? '')), 'messages')
    const reply = JSON.stringify(Reflect.get(Object(messages), 1))
    // The encrypted item goes back with its real id.
    expect(reply).toContain('rs_0d68cbc2f79b1f96016adb17346bd887d196f9c22bc3fc528a')
    expect(outcome).toMatchObject({ kind: 'written', reasoningState: true })
  })
})
