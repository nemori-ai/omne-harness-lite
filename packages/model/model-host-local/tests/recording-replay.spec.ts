// @module-tag slow — starts openssl child processes and real local HTTPS servers, writes vault
// files, and drives Model calls through the assembled send path.
//
// The gate: the four real recordings replayed through the assembled local path, without network
// and without a key. For each recording the request is rebuilt (a continued round from the replay
// of its first round), sent through the vault, the send fence, the pi transport and the family to
// a local HTTPS server that answers with the recorded body, and the call is checked end to end:
// the facts, the dispatch with its receipt and the account that reached ModelCommands.
//
// The two tool-call cases have no real recording yet. Their replay pieces are synthetic
// (`fixtures/recordings/<case>/synthetic.jsonl`, written by hand) and go through the same path, and
// the recorder writes the same stream back. They show the request shape, the continuation with the
// tool result and the recorder's refusals; they are no evidence of what the real model sends.
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { payableAmount } from '@omne-harness/call-account'
import type { FixedModelRequest } from '@omne-harness/model-contract'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { createCertificate, startHttpsServer } from './support/https-server.ts'
import { assembleLocalHost, PLACEHOLDER, ROUTE_PATH } from './support/local-host.ts'
import { recordRound } from './support/recorder.ts'
import {
  continuedRequest,
  firstRoundRequest,
  readRecording,
  readReply,
  RECORD_CASE_NAMES,
  RECORD_CASES,
  replayRound,
  type RecordCaseName,
} from './support/recording-cases.ts'
import type { FamilyName } from './support/records.ts'
import { onlyDispatch, openReplay, recordedRequest, replayLabel } from './support/replay.ts'

/** The replay format of the receipt, per family. */
const FORMATS: Readonly<Record<FamilyName, string>> = {
  'pi-ai-openai': 'openai-responses-v1',
  'pi-ai-anthropic': 'anthropic-claude-v1',
}

describe('each real recording replays through the assembled local path', () => {
  it.each(RECORD_CASE_NAMES)(
    '%s: the call settles with one termination and a reasoning state, and the account reaches ModelCommands',
    async name => {
      const item = RECORD_CASES[name]
      const request = await recordedRequest(name)
      const opened = await openReplay({ request, name, label: replayLabel('gate', name) })
      try {
        const { local, note } = opened
        expect(note.model).toBe(item.model)
        expect(opened.driven).toEqual({ ok: undefined })

        // The request carried the credential the custodian resolved, inside the send fence.
        expect(opened.requests).toHaveLength(1)
        expect(opened.requests[0]?.headers.authorization).toBe(`Bearer ${PLACEHOLDER}`)

        // The facts end with exactly one termination, a completed one, and hold a reasoning state.
        const ended = local.facts.filter(
          (fact): fact is Extract<TransportFact, { kind: 'ended' }> => fact.kind === 'ended',
        )
        expect(ended).toHaveLength(1)
        expect(local.facts.at(-1)?.kind).toBe('ended')
        expect(ended[0]?.termination).toEqual({ kind: 'completed', reason: 'stop' })
        expect(
          local.facts.some(
            fact => fact.kind === 'block-seal' && fact.block.kind === 'reasoning_state',
          ),
        ).toBe(true)

        // The dispatch keeps the termination of the stream, the receipt and the account.
        const record = await onlyDispatch(local)
        expect(record.terminal).toEqual(ended[0]?.termination)
        const receipt = record.materialization?.receipt
        expect(receipt?.replayFormat).toBe(FORMATS[item.family])
        // The request is reproducible: this materialization sent the recorded request body.
        expect(receipt?.payloadDigest).toBe(note.payloadDigest)

        // The account came through the real path: ModelCommands completed it with this call
        // and the receipt. The cost is the gateway's, billable, with a known amount.
        const reported = local.facts.filter(fact => fact.kind === 'account')
        expect(reported).toHaveLength(1)
        expect(record.account).toEqual({
          ...reported[0]?.value,
          subject: { kind: 'model_call', id: local.call },
          receipt: 'received',
        })
        const billable = record.account?.cost.filter(cost => cost.source === 'billable') ?? []
        expect(billable).toHaveLength(1)
        expect(billable[0]).toMatchObject({ state: 'known', unit: 'openrouter-credit' })
        const payable = payableAmount(record.account)
        expect(payable).toMatchObject({ ok: { state: 'known', unit: 'openrouter-credit' } })
        expect(payable).toEqual({
          ok: {
            state: 'known',
            lexeme: Reflect.get(Object(billable[0]), 'lexeme'),
            unit: 'openrouter-credit',
          },
        })

        // The secret entered neither the facts nor the kept records.
        expect(JSON.stringify(local.facts)).not.toContain(PLACEHOLDER)
        expect(JSON.stringify(record)).not.toContain(PLACEHOLDER)
      } finally {
        await opened.close()
      }
    },
  )
})

// --- the synthetic tool-call pieces ---------------------------------------------------------------

const SYNTHETIC_ROOT = fileURLToPath(new URL('./fixtures/recordings/', import.meta.url))
const syntheticDirectory = (name: RecordCaseName) => join(SYNTHETIC_ROOT, name)

/** A local HTTPS server that answers every request on the route with `stream`. */
async function serving(stream: Uint8Array) {
  const certificate = createCertificate()
  const server = await startHttpsServer(certificate, (res, received) => {
    if (received.path !== ROUTE_PATH) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(stream)
  })
  return {
    gateway: { url: server.url, ca: certificate.cert },
    requests: server.requests,
    async close() {
      try {
        await server.close()
      } finally {
        certificate.dispose()
      }
    },
  }
}

function privateDirectory(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-toolcall-')))
}

/**
 * Drives `request` through the assembled path against the synthetic piece of `name`. The caller
 * ends the run with `done`, which closes the host, the server and the vault directory.
 */
async function replaySynthetic(name: RecordCaseName, request: FixedModelRequest) {
  const { stream, note } = readRecording(syntheticDirectory(name))
  const served = await serving(stream)
  const vault = privateDirectory()
  const local = assembleLocalHost({
    request,
    label: replayLabel('synthetic', name),
    directory: vault,
    gateway: served.gateway,
  })
  const done = async () => {
    try {
      await local.close()
    } finally {
      await served.close()
      rmSync(vault, { recursive: true, force: true })
    }
  }
  try {
    const { driven, reference } = await local.drive()
    const body: unknown = JSON.parse(served.requests[0]?.body ?? 'null')
    return {
      local,
      note,
      driven,
      requests: served.requests,
      body,
      blocks: () => readReply(local, reference),
      done,
    }
  } catch (error) {
    await done()
    throw error
  }
}

/** The member `name` of a parsed JSON value, or undefined. */
function member(value: unknown, name: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, name) : undefined
}

describe('the synthetic tool-call pieces replay through the assembled local path', () => {
  it("openai-tool-call: the request declares the tool at a reasoning effort, the call completes with a tool suggestion, and the digest is the note's", async () => {
    const name = 'openai-tool-call'
    const request = firstRoundRequest(RECORD_CASES[name])
    const run = await replaySynthetic(name, request)
    try {
      expect(run.driven).toEqual({ ok: undefined })
      expect(run.requests).toHaveLength(1)
      // The wire shape of the request: a function tool with an object schema, `auto`, a reasoning
      // effort that is on, and the model of the record.
      expect(member(run.body, 'model')).toBe('openai/gpt-5.6-sol')
      expect(member(run.body, 'tools')).toEqual([
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Reads the current temperature of one city, in degrees Celsius.',
            parameters: {
              type: 'object',
              properties: { city: { type: 'string', description: 'The name of the city.' } },
              required: ['city'],
              additionalProperties: false,
            },
          },
        },
      ])
      expect(member(run.body, 'tool_choice')).toBe('auto')
      expect(member(run.body, 'reasoning')).toEqual({ effort: 'medium' })

      // The reply: one tool call with its arguments, a reasoning state, one termination.
      const facts = run.local.facts
      const ended = facts.flatMap(fact => (fact.kind === 'ended' ? [fact.termination] : []))
      expect(ended).toEqual([{ kind: 'completed', reason: 'tool-suggestions' }])
      const sealed = facts.flatMap(fact => (fact.kind === 'block-seal' ? [fact.block] : []))
      expect(sealed.some(block => block.kind === 'reasoning_state')).toBe(true)
      expect(sealed.filter(block => block.kind === 'tool_call')).toMatchObject([
        {
          callId: 'call_synthetic_0001',
          name: 'get_weather',
          arguments: {
            kind: 'object',
            entries: [{ key: 'city', value: { kind: 'string', value: 'Paris' } }],
          },
        },
      ])
      const record = await onlyDispatch(run.local)
      expect(record.terminal).toEqual({ kind: 'completed', reason: 'tool-suggestions' })
      expect(record.materialization?.receipt.replayFormat).toBe('openai-responses-v1')
      expect(record.materialization?.receipt.payloadDigest).toBe(run.note.payloadDigest)
      expect(JSON.stringify(facts)).not.toContain(PLACEHOLDER)
    } finally {
      await run.done()
    }
  })

  it('openai-tool-call-continued: the request carries the tool call with its reasoning state and then the tool result, and the call completes', async () => {
    const firstName = 'openai-tool-call'
    const name = 'openai-tool-call-continued'
    const first = firstRoundRequest(RECORD_CASES[firstName])
    const vault = privateDirectory()
    try {
      const replayed = await replayRound({
        request: first,
        recording: syntheticDirectory(firstName),
        label: replayLabel('synthetic-first', firstName),
        vault,
      })
      const request = continuedRequest({ first, replayed, next: 'tool-result' })
      const run = await replaySynthetic(name, request)
      try {
        expect(run.driven).toEqual({ ok: undefined })
        const messages = member(run.body, 'messages')
        if (!Array.isArray(messages)) throw new Error('the request has no messages')
        // The assistant message that holds the tool call is followed at once by its result.
        const assistant: unknown = messages.at(-2)
        const result: unknown = messages.at(-1)
        expect(member(assistant, 'role')).toBe('assistant')
        expect(member(assistant, 'tool_calls')).toEqual([
          {
            id: 'call_synthetic_0001',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
          },
        ])
        // The encrypted item goes back with the id and the bytes it came with.
        expect(member(assistant, 'reasoning_details')).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'reasoning.encrypted',
              id: 'rs_synthetic0000000000000000000000000000000000000001',
              format: 'openai-responses-v1',
            }),
          ]),
        )
        expect(member(result, 'role')).toBe('tool')
        expect(member(result, 'tool_call_id')).toBe('call_synthetic_0001')
        expect(JSON.stringify(result)).toContain('temperatureCelsius')

        const record = await onlyDispatch(run.local)
        expect(record.terminal).toEqual({ kind: 'completed', reason: 'stop' })
        expect(record.materialization?.receipt.payloadDigest).toBe(run.note.payloadDigest)
        const blocks = await run.blocks()
        expect(blocks.filter(block => block.kind === 'text')).toMatchObject([
          { text: 'It is 18 degrees Celsius in Paris right now.' },
        ])
      } finally {
        await run.done()
      }
    } finally {
      rmSync(vault, { recursive: true, force: true })
    }
  })
})

describe('the recorder over the synthetic tool-call stream', () => {
  const NAME = 'openai-tool-call'
  const now = () => new Date('2026-11-02T00:00:00.000Z')

  async function recordWith(
    stream: Uint8Array,
    over: { requiresReasoningState?: boolean; requiresToolCall?: boolean } = {},
  ) {
    const served = await serving(stream)
    const output = privateDirectory()
    const vault = privateDirectory()
    try {
      const outcome = await recordRound({
        name: NAME,
        request: firstRoundRequest(RECORD_CASES[NAME]),
        requiresReasoningState: over.requiresReasoningState ?? true,
        requiresToolCall: over.requiresToolCall ?? true,
        gateway: served.gateway,
        output,
        vault,
        now,
      })
      return { outcome, output, sent: served.requests }
    } finally {
      await served.close()
      rmSync(vault, { recursive: true, force: true })
    }
  }

  it("writes the stream byte for byte, and the note digest is the SHA-256 of the sent body and the fixture note's", async () => {
    const { stream, note } = readRecording(syntheticDirectory(NAME))
    const { outcome, output, sent } = await recordWith(stream)
    try {
      expect(outcome).toMatchObject({ kind: 'written', bytes: stream.byteLength })
      const directory = join(output, NAME)
      expect(readFileSync(join(directory, 'stream.sse')).equals(stream)).toBe(true)
      const written: unknown = JSON.parse(readFileSync(join(directory, 'recording.json'), 'utf8'))
      const digest = createHash('sha256')
        .update(sent[0]?.body ?? '')
        .digest('hex')
      expect(sent).toHaveLength(1)
      expect(written).toEqual({
        model: 'openai/gpt-5.6-sol',
        payloadDigest: digest,
        recordedAt: '2026-11-02T00:00:00.000Z',
      })
      expect(digest).toBe(note.payloadDigest)
    } finally {
      rmSync(output, { recursive: true, force: true })
    }
  })

  it('writes nothing when a key pattern occurs in the stream', async () => {
    const { stream } = readRecording(syntheticDirectory(NAME))
    // Built at run time, so that this source holds no complete key pattern.
    const leaked = Buffer.from(`: ${'sk-'}${'or-v1-'}${'a'.repeat(24)}\n\n`, 'utf8')
    const { outcome, output } = await recordWith(Buffer.concat([leaked, stream]))
    try {
      expect(outcome).toEqual({
        kind: 'refused',
        refusal: { kind: 'secret', patterns: ['openrouter-key'] },
      })
      expect(existsSync(join(output, NAME))).toBe(false)
      expect(readdirSync(output)).toEqual([])
    } finally {
      rmSync(output, { recursive: true, force: true })
    }
  })

  it('writes nothing for a case that asks for a tool call and gets a reply without one', async () => {
    const { stream } = readRecording(syntheticDirectory('openai-tool-call-continued'))
    const { outcome, output } = await recordWith(stream, { requiresReasoningState: false })
    try {
      expect(outcome).toEqual({ kind: 'refused', refusal: { kind: 'tool-call-missing' } })
      expect(readdirSync(output)).toEqual([])
    } finally {
      rmSync(output, { recursive: true, force: true })
    }
  })
})
