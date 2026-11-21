// @module-tag slow
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  freePort,
  newScratch,
  operatorLayer,
  runOmne,
  startServer,
  writeOperator,
  type Scratch,
  type ServerHandle,
} from '../../r9/support.ts'
import {
  answer504,
  createSession,
  diagnosticsBodyOf,
  modelCallsOf,
  registerAndLogin,
  sendInput,
  startScenarioGateway,
  until,
  untilRunEnded,
  type Cli,
  type GatewayReply,
  type ScenarioAnswer,
  type ScenarioGateway,
} from './support.ts'

const CREDENTIAL = 'carol-pw-MOMENTS-4b1d'
const RUN_END_TIMEOUT_MS = 90_000
const RETRIED_TEXT = 'the first connection is refused and the first answer is 504'
const REQUEST_ID = 'gen-MOMENTS-REQUEST-0042'
const STALLED_TEXT = 'the upstream writes a first part and then says nothing'
const STALL_READ_TIMEOUT_MS = 30_000

const sse = (events: readonly unknown[]): string =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`

const answerText = (body: string): GatewayReply => ({
  kind: 'answer',
  status: 200,
  contentType: 'text/event-stream',
  headers: { 'x-generation-id': REQUEST_ID },
  body: sse([
    {
      model: (JSON.parse(body) as { model?: string }).model ?? 'unknown',
      provider: 'OpenAI',
      choices: [{ delta: { content: 'done' } }],
    },
    { choices: [{ delta: {}, finish_reason: 'stop' }] },
  ]),
})

const frames = (events: readonly unknown[]): string =>
  events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')

const stallAfterFirstPart = (body: string): ScenarioAnswer => ({
  kind: 'stall',
  body: frames([
    {
      model: (JSON.parse(body) as { model?: string }).model ?? 'unknown',
      provider: 'OpenAI',
      choices: [{ delta: { content: 'a first part' } }],
    },
  ]),
  rest: `${frames([{ choices: [{ delta: {}, finish_reason: 'stop' }] }])}data: [DONE]\n\n`,
})

/** The answer to a cost lookup: the upstream has no cost for the request. */
const lookupMissed: GatewayReply = {
  kind: 'answer',
  status: 404,
  contentType: 'application/json',
  body: '{"error":{"message":"Generation not found","code":404}}',
}

type Moment = Readonly<{ kind: 'known'; instant: string } | { kind: 'unknown' }>
type Dispatch = Readonly<{
  instants: Readonly<
    Record<'prepared' | 'sent' | 'responseStarted' | 'firstContent' | 'ended', Moment>
  >
  timing: Readonly<Record<string, Readonly<{ kind: string; milliseconds?: string }>>>
  connectRetries: readonly string[]
  outcome: Readonly<{ kind: string }>
}>

const dispatchesOf = (run: Record<string, unknown>): readonly Dispatch[] =>
  (modelCallsOf(run)[0]?.['dispatches'] as readonly Dispatch[] | undefined) ?? []

const at = (moment: Moment): number =>
  moment.kind === 'known' ? Date.parse(moment.instant) : Number.NaN

describe('the moments and the connect retries of a dispatch, read over real processes', () => {
  let scratch: Scratch
  let gateway: ScenarioGateway
  let server: ServerHandle
  let carol: Cli
  let retriedIndex = -1

  beforeAll(async () => {
    scratch = newScratch('diagnostics-moments-')
    const port = await freePort()
    gateway = await startScenarioGateway(request => {
      if (request.method === 'GET') return lookupMissed
      if (request.body.includes(RETRIED_TEXT) && retriedIndex === -1) {
        retriedIndex = request.index
        return answer504
      }
      if (request.body.includes(STALLED_TEXT)) return stallAfterFirstPart(request.body)
      return answerText(request.body)
    })
    const operatorPath = join(scratch.base, 'operator.json')
    writeOperator(
      operatorPath,
      operatorLayer({ storageRoot: scratch.storageRoot, port, modelRoute: gateway.url }),
    )
    server = await startServer({
      stateRoot: scratch.stateRoot,
      operatorPath,
      port,
      extraCaPath: gateway.certPath,
    })
    const home = join(scratch.base, 'home-carol')
    carol = (args, credential) =>
      runOmne({
        args: [...args],
        home,
        server: `http://127.0.0.1:${String(port)}`,
        cwd: scratch.base,
        ...(credential === undefined ? {} : { credential }),
      })
    await registerAndLogin(carol, 'carol', CREDENTIAL)
  }, 120_000)

  afterAll(async () => {
    await server?.kill()
    await gateway?.close()
    scratch?.remove()
  })

  it(
    'C3: the connect retry, the dispatches made and allowed, and the cause of the last failure',
    { timeout: 180_000 },
    async () => {
      const session = await createSession(carol)
      gateway.refuseConnections(1)
      await sendInput(carol, session, RETRIED_TEXT)
      const { run } = await untilRunEnded(carol, session, RUN_END_TIMEOUT_MS)
      expect(gateway.refused()).toBe(1)
      expect(run['terminal'], JSON.stringify(run)).toMatchObject({ outcome: 'completed' })
      expect(modelCallsOf(run)[0]?.['call']).toEqual({
        kind: 'found',
        call: expect.any(String),
        phase: 'settled',
        progress: {
          allowed: '2',
          made: '2',
          last: { cause: 'upstream-unavailable', upstreamStatus: '504' },
        },
      })
      const [failed, answered] = dispatchesOf(run)
      expect(failed?.outcome).toMatchObject({ kind: 'failed' })
      expect(failed?.connectRetries).toEqual(['connect-failed'])
      expect(answered?.outcome).toMatchObject({ kind: 'completed' })
      expect(answered?.connectRetries).toEqual([])
      const text = await carol(['read-session-diagnostics', '--session', session])
      expect(text.status, text.stderr).toBe(0)
      expect(text.stdout).toContain('sent 2 of 2 allowed, last failure upstream-unavailable 504')
      expect(text.stdout).toContain('connect retries: 1 (connect-failed)')
    },
  )

  it(
    'C1: a successful call shows its four moments in order and its spans as known values',
    { timeout: 180_000 },
    async () => {
      const session = await createSession(carol)
      await sendInput(carol, session, 'answer at once')
      const { run } = await untilRunEnded(carol, session, RUN_END_TIMEOUT_MS)
      expect(run['terminal'], JSON.stringify(run)).toMatchObject({ outcome: 'completed' })
      const [dispatch] = dispatchesOf(run)
      if (dispatch === undefined) throw new Error(`no dispatch: ${JSON.stringify(run)}`)
      const { prepared, sent, responseStarted, firstContent, ended } = dispatch.instants
      const order = [prepared, sent, responseStarted, firstContent, ended].map(at)
      expect(order.every(Number.isFinite), JSON.stringify(dispatch.instants)).toBe(true)
      expect([...order].sort((a, b) => a - b)).toEqual(order)
      for (const span of ['materialize', 'sendToResponse', 'sendToFirstContent', 'execution'])
        expect(dispatch.timing[span], span).toMatchObject({ kind: 'known' })
      expect(dispatch.timing['execution']?.milliseconds).toBe(String(at(ended) - at(sent)))
      expect(JSON.stringify(run)).not.toContain(REQUEST_ID)
      const text = await carol(['read-session-diagnostics', '--session', session])
      expect(text.status, text.stderr).toBe(0)
      expect(text.stdout).toMatch(
        /timing: materialize \d+ ms, send to response \d+ ms, send to first content \d+ ms, execution \d+ ms/,
      )
      expect(text.stdout).toMatch(/moments: prepared \S+Z, sent \S+Z, response \S+Z/)
    },
  )

  it(
    'C4 (#1428): the upstream writes a first part and stalls: the response and first-content moments are read while the Run still runs',
    { timeout: 180_000 },
    async () => {
      const session = await createSession(carol)
      await sendInput(carol, session, STALLED_TEXT)
      await until(() => gateway.stalled() === 1, 'the stalled answer', RUN_END_TIMEOUT_MS)
      const deadline = Date.now() + STALL_READ_TIMEOUT_MS
      let run: Record<string, unknown> | undefined
      for (;;) {
        const read = await carol(['read-session-diagnostics', '--session', session, '--json'])
        run = diagnosticsBodyOf(read)?.runs[0]
        const instants = run === undefined ? undefined : dispatchesOf(run)[0]?.instants
        if (instants?.responseStarted.kind === 'known' && instants.firstContent.kind === 'known')
          break
        if (Date.now() > deadline)
          throw new Error(`the stalled part was not saved: ${JSON.stringify(run)}`)
        await new Promise(resolve => setTimeout(resolve, 250))
      }
      expect(run?.['terminal']).toBeNull()
      expect(gateway.stalled()).toBe(1)
      gateway.finishStalled()
      const ended = await untilRunEnded(carol, session, RUN_END_TIMEOUT_MS)
      expect(ended.run['terminal'], JSON.stringify(ended.run)).toMatchObject({
        outcome: 'completed',
      })
    },
  )
})
