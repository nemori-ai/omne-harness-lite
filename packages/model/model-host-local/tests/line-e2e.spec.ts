// @module-tag slow — starts an openssl child process and a real local HTTPS server, writes a vault
// file and a SQLite file, drives Model calls through the assembled send path over the pi transport,
// and holds a streamed response open until the client stops it.
//
// The line-through case of the Model line: one process, one real Cordis 4.0.4 root Context, the
// five members assembled by `support/line-assembly.ts`. Five steps, each with what a user sees:
// 1. Preparation: the profile plugin and the preparation plugin give the fixed request; no request
//    reaches the gateway while it is prepared.
// 2. Send (replay): call A goes through the send stage to the local HTTPS gateway, which answers
//    with the synthetic recording of `openai-tool-call`; one termination; the digest of the request
//    the gateway received is the digest the recording notes; the placeholder credential is in the
//    sent header only.
// 3. Durability: the facts and the result of A are in the SQLite file. The connection is closed and
//    reopened, and fresh commands over the reopened file (no runtime, no in-process state) read the
//    terminal state and the result page of A.
// 4. Push: the receiver stand-in registers, A is pushed, the receiver answers `saved` and only then
//    the producer acknowledges; after the ACK the cleanup of A advances to `released`.
// 5. Cancel: call B streams and the gateway holds its response; `calls.cancel` stops the supplier
//    stream (the transport's `exchange-stopped`), the settlement comes after the physical stop, and
//    B ends interrupted by that cancel.
// With `OMNE_EVIDENCE_OUT=<directory>` the case writes `line-e2e.json` there: the conclusion of each
// step, the call identities, the termination kinds, which ModelCommands and SQL provider ran and the
// Cordis version. No request body, no reply text, no header and no credential.
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type {
  AssembledModelInput,
  FixedModelRequest,
  Termination,
} from '@omne-harness/model-contract'
import { createCertificate, startHttpsServer, type HttpsFixture } from './support/https-server.ts'
import {
  ACCESS,
  CAPACITY,
  CONSUMER,
  REQUIRED,
  TENANT,
  assembleLine,
  callOf,
  cordisVersion,
  durableCommands,
  op,
  openFileStorage,
  readResult,
  scriptedReceiver,
  textOf,
  type FileStorage,
  type LineTree,
} from './support/line-assembly.ts'
import { PLACEHOLDER, ROUTE_PATH, decoded } from './support/local-host.ts'
import { RECORD_CASES, firstRoundRequest, readRecording } from './support/recording-cases.ts'

const CASE = 'openai-tool-call'
const RECORDING = readRecording(
  fileURLToPath(new URL(`./fixtures/recordings/${CASE}/`, import.meta.url)),
)

const sse = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`
/** The answer of call B that is on its way when the cancel comes: content, no finish yet. */
const HEAD = sse({
  model: 'openai/gpt-5.6-sol',
  provider: 'OpenAI',
  choices: [{ delta: { content: 'partial answer' } }],
})
/** The rest of a natural completion of B, written only to release a held response at the end. */
const TAIL =
  sse({
    choices: [{ delta: {}, finish_reason: 'stop' }],
    usage: { prompt_tokens: 12, completion_tokens: 3, cost: 0.000042 },
  }) + 'data: [DONE]\n\n'

/** One streamed response that the gateway holds open until the test finishes it. */
type Held = Readonly<{
  closed: Promise<void>
  finish(): void
}>

const certificate = createCertificate()
let server: HttpsFixture
let directory: string
let storage: FileStorage
/** What the gateway does with the next request: replay the recording, or stream a head and hold. */
let gateway: 'replay' | 'hold' = 'replay'
const held: Held[] = []

beforeAll(async () => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-line-')))
  storage = await openFileStorage(join(directory, 'line.sqlite'))
  server = await startHttpsServer(certificate, (res: ServerResponse, received) => {
    if (received.path !== ROUTE_PATH) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    if (gateway === 'replay') {
      res.end(RECORDING.stream)
      return
    }
    const closed = new Promise<void>(resolve => res.once('close', () => resolve()))
    res.write(HEAD)
    held.push({
      closed,
      finish: () => {
        if (!res.writableEnded && !res.destroyed) res.end(TAIL)
      },
    })
  })
})
afterAll(async () => {
  for (const response of held) response.finish()
  await server.close()
  certificate.dispose()
  storage.close()
  rmSync(directory, { recursive: true, force: true })
})

async function eventually(check: () => boolean | Promise<boolean>, label: string): Promise<void> {
  for (let tries = 0; tries < 1000; tries += 1) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error(`timed out waiting for ${label}`)
}

/** Resolves with the value, or rejects after `ms` with `label`: a stream that never stops is red. */
function within<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} did not happen within ${ms} ms`)), ms),
    ),
  ])
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

/** The assembled input of the recorded request: what a consumer hands to `prepare`. */
function assembledOf(fixed: FixedModelRequest): AssembledModelInput {
  return {
    system: fixed.system,
    messages: fixed.messages,
    tools: fixed.tools,
    toolChoice: fixed.toolChoice,
    parameters: fixed.parameters,
    representation: fixed.representation,
    source: fixed.source,
  }
}

async function admit(line: LineTree, name: string, request: FixedModelRequest) {
  const call = callOf(name)
  const admitted = decoded(
    await line.runtime.calls.admit({
      ...ACCESS,
      call,
      operation: op(`admit-${name}`),
      request,
      consumer: { owner: CONSUMER, work: 'work', position: 'answer', purpose: 'line-e2e' },
      capacity: CAPACITY,
    }),
  )
  return { call, reference: admitted.reference }
}

type StepName = 'prepare' | 'send' | 'persist' | 'push' | 'cancel'
type Evidence = {
  steps: Record<StepName, string>
  calls: Record<'a' | 'b', { call: string; termination: Termination['kind'] | null }>
  implementations: {
    modelCommands: string
    sqlProvider: string
    resultReceiver: string
    cordis: string
  }
}

function writeEvidence(evidence: Evidence): void {
  const out = process.env['OMNE_EVIDENCE_OUT']
  if (out === undefined || out === '') return
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'line-e2e.json'), `${JSON.stringify(evidence, null, 2)}\n`)
}

describe('the Model line in one process', () => {
  it('prepares, sends a replay, persists, pushes to the receiver and cancels another call', async () => {
    const line = await assembleLine({
      directory,
      storage,
      gateway: { url: server.url, ca: certificate.cert },
    })
    const steps: Partial<Record<StepName, string>> = {}
    const terminations: Record<'a' | 'b', Termination['kind'] | null> = { a: null, b: null }
    try {
      // --- 1. preparation: the profile and the preparation plugin, no network ----------------------
      const recorded = firstRoundRequest(RECORD_CASES[CASE])
      const requestsBefore = server.requests.length
      const request = decoded(
        await line.preparation.prepare({
          ...ACCESS,
          profile: line.profile,
          required: REQUIRED,
          assembled: assembledOf(recorded),
        }),
      )
      expect(server.requests).toHaveLength(requestsBefore)
      expect(line.log).not.toContain('exchange-stopped')
      expect(request.profile).toEqual(line.profile.adoption)
      expect(request.suppliers.map(supplier => supplier.model)).toEqual([RECORD_CASES[CASE].model])
      expect(request.messages).toEqual(recorded.messages)
      expect(request.tools).toEqual(recorded.tools)
      expect(request.parameters).toEqual(recorded.parameters)
      steps.prepare =
        'the fixed request came from the profile and the preparation plugin; no request reached the gateway'

      // --- 2. send: call A through the send stage to the local gateway, which replays -----------------
      gateway = 'replay'
      const a = await admit(line, 'a', request)
      await eventually(
        async () => (await line.stateOf(a.call)).phase === 'settled',
        'the settlement of call A',
      )
      const stateA = await line.stateOf(a.call)
      if (stateA.phase !== 'settled') throw new Error('call A is not settled')
      terminations.a = stateA.settlement.termination.kind
      expect(stateA.settlement.termination).toEqual({
        kind: 'completed',
        reason: 'tool-suggestions',
      })
      expect(line.log.filter(entry => entry === `settle:${a.call}`)).toHaveLength(1)
      const sentA = server.requests.slice(requestsBefore)
      expect(sentA).toHaveLength(1)
      const [wireA] = sentA
      if (wireA === undefined) throw new Error('call A did not reach the gateway')
      expect(sha256(wireA.body)).toBe(RECORDING.note.payloadDigest)
      expect(wireA.headers.authorization).toBe(`Bearer ${PLACEHOLDER}`)
      const [dispatchA] = await line.dispatchesOf(a.call)
      expect(dispatchA?.terminal).toEqual(stateA.settlement.termination)
      expect(dispatchA?.materialization?.receipt.payloadDigest).toBe(RECORDING.note.payloadDigest)
      expect(line.facts.filter(fact => fact.kind === 'ended')).toHaveLength(1)
      expect(JSON.stringify(line.facts)).not.toContain(PLACEHOLDER)
      expect(JSON.stringify(dispatchA)).not.toContain(PLACEHOLDER)
      expect(JSON.stringify(stateA)).not.toContain(PLACEHOLDER)
      expect(line.messages.join('\n')).not.toContain(PLACEHOLDER)
      steps.send = `call A completed once by replay; the gateway received the recorded request (digest ${RECORDING.note.payloadDigest.slice(0, 12)}…); the placeholder is in the sent header only`

      // --- 3. durability: close and reopen the file; fresh commands read A from it -------------------
      storage.reopen()
      const fresh = durableCommands(storage.storage).commands
      const reread = await readResult(fresh, a.call)
      expect(reread.state.settlement).toEqual(stateA.settlement)
      expect(reread.state.custody).toEqual({ kind: 'producer' })
      const sealed = reread.parts.flatMap(part => (part.kind === 'sealed' ? [part.block] : []))
      expect(sealed.some(block => block.kind === 'tool_call')).toBe(true)
      expect(sealed.some(block => block.kind === 'reasoning_state')).toBe(true)
      const [dispatchAgain] = decoded(await fresh.dispatches({ ...ACCESS, call: a.call }))
      expect(dispatchAgain).toEqual(dispatchA)
      expect(JSON.stringify(reread)).not.toContain(PLACEHOLDER)
      steps.persist = `after closing and reopening ${basename(storage.file)}, fresh commands read the settled state, ${reread.parts.length} result parts and the dispatch of call A`

      // --- 4. push: the receiver registers; saved first, then the producer's ACK, then cleanup --------
      const scripted = scriptedReceiver(line.log)
      await line.register(scripted.receiver)
      await eventually(
        () => line.ledger.read({ tenant: TENANT, call: a.call })?.cleanup === 'released',
        'the push, ACK and cleanup of call A',
      )
      const savedAt = line.log.indexOf(`saved:${a.reference}`)
      const ackAt = line.log.indexOf(`handoff:${a.call}`)
      expect(savedAt).toBeGreaterThanOrEqual(0)
      expect(ackAt).toBeGreaterThan(savedAt)
      expect(line.log.filter(entry => entry === `handoff:${a.call}`)).toHaveLength(1)
      expect(scripted.pushes).toHaveLength(1)
      expect(scripted.pushes[0]).toMatchObject({
        kind: 'result',
        key: { kind: 'result', reference: a.reference },
        consumer: { owner: CONSUMER },
        settlement: stateA.settlement,
      })
      expect((await line.stateOf(a.call)).custody).toMatchObject({
        kind: 'acknowledged',
        cleanup: 'released',
      })
      expect(JSON.stringify(scripted.pushes)).not.toContain(PLACEHOLDER)
      steps.push =
        'call A was pushed once to the receiver stand-in; the receiver saved it before the producer acknowledged; after the ACK the cleanup is released'

      // --- 5. cancel: call B streams, the gateway holds; cancel stops the stream first ----------------
      gateway = 'hold'
      const mark = line.log.length
      const firstHeld = held.length
      const b = await admit(line, 'b', request)
      await eventually(async () => {
        const state = await line.stateOf(b.call)
        return state.phase === 'running' && state.firstContent === 'observed'
      }, 'the first content of call B')
      const response = held[firstHeld]
      if (response === undefined) throw new Error('call B did not reach the gateway')
      const cancelled = decoded(
        await line.runtime.calls.cancel({ ...ACCESS, call: b.call, operation: op('cancel-b') }),
      )
      expect(cancelled).toMatchObject({ kind: 'requested', operation: op('cancel-b') })
      // The response ends only because the client stopped it: the gateway never finishes this answer.
      await within(response.closed, 5_000, 'the close of the response of call B at the gateway')
      await eventually(
        async () => (await line.stateOf(b.call)).phase === 'settled',
        'the settlement of call B',
      )
      const stateB = await line.stateOf(b.call)
      if (stateB.phase !== 'settled') throw new Error('call B is not settled')
      terminations.b = stateB.settlement.termination.kind
      expect(stateB.settlement.termination).toEqual({
        kind: 'interrupted',
        control: op('cancel-b'),
      })
      const since = line.log.slice(mark)
      const stopped = since.indexOf('exchange-stopped')
      const settled = since.indexOf(`settle:${b.call}`)
      expect(stopped).toBeGreaterThanOrEqual(0)
      expect(settled).toBeGreaterThan(stopped)
      const [dispatchB] = await line.dispatchesOf(b.call)
      expect(dispatchB?.terminal).toEqual({ kind: 'interrupted', control: op('cancel-b') })
      expect(dispatchB?.account).toBeNull()
      // The content delivered before the cancel stays in the result: the receiver gets it.
      await eventually(() => scripted.pushes.length >= 2, 'the push of call B')
      const pushedB = scripted.pushes.find(delivery => delivery.key.reference === b.reference)
      if (pushedB?.kind !== 'result') throw new Error('call B was not pushed as a result')
      expect(textOf(pushedB.parts)).toBe('partial answer')
      expect(pushedB.settlement.termination).toEqual(stateB.settlement.termination)
      steps.cancel =
        'call B was streaming; calls.cancel stopped the supplier stream (exchange-stopped) before the settlement; B ended interrupted by that cancel with its content kept'
    } finally {
      writeEvidence({
        steps: {
          prepare: steps.prepare ?? 'not reached',
          send: steps.send ?? 'not reached',
          persist: steps.persist ?? 'not reached',
          push: steps.push ?? 'not reached',
          cancel: steps.cancel ?? 'not reached',
        },
        calls: {
          a: { call: callOf('a'), termination: terminations.a },
          b: { call: callOf('b'), termination: terminations.b },
        },
        implementations: {
          modelCommands:
            '@omne-harness/model-storage-sql createSqlModelCommands (with send: shared core and coordinator)',
          sqlProvider:
            'node:sqlite file provider of tests/support/line-assembly.ts (stand-in for @omne-harness/sqlite-provider)',
          resultReceiver:
            'scripted receiver of tests/line-e2e.spec.ts (stand-in for agent-host-local createLocalModelReceiver)',
          cordis: `@deepseek-ai/cordis ${cordisVersion()}`,
        },
      })
      for (const response of held) response.finish()
      await line.close()
    }
  })
})
