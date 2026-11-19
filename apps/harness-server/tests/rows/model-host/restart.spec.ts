// @module-tag slow
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
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
  createSession,
  modelCallsOf,
  registerAndLogin,
  sendInput,
  startScenarioGateway,
  structuredCauseOf,
  until,
  untilRunEnded,
  type Cli,
  type ScenarioGateway,
  type ScenarioScript,
} from '../session-diagnostics/support.ts'

const CREDENTIAL = 'dave-pw-RESTART-7c2e'
const RUN_END_TIMEOUT_MS = 120_000

const sse = (events: readonly unknown[]): string =>
  events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')

const modelOf = (body: string): string =>
  (JSON.parse(body) as { model?: string }).model ?? 'unknown'

/** The first frames of an answer: some content, no finish. */
const half = (body: string, text: string): string =>
  sse([{ model: modelOf(body), provider: 'OpenAI', choices: [{ delta: { content: text } }] }])

/** A whole streamed answer: the text, then the finish. */
const whole = (body: string, text: string) =>
  ({
    kind: 'answer',
    status: 200,
    contentType: 'text/event-stream',
    body: `${sse([
      { model: modelOf(body), provider: 'OpenAI', choices: [{ delta: { content: text } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ])}data: [DONE]\n\n`,
  }) as const

const dispatchesOf = (call: Record<string, unknown> | undefined): Record<string, unknown>[] =>
  (call?.['dispatches'] as Record<string, unknown>[] | undefined) ?? []

type World = Readonly<{
  scratch: Scratch
  gateway: ScenarioGateway
  cli: Cli
  server(): ServerHandle
  restart(): Promise<void>
  stop(): Promise<void>
}>

const worlds: World[] = []

async function world(script: ScenarioScript): Promise<World> {
  const scratch = newScratch('model-restart-')
  const port = await freePort()
  const gateway = await startScenarioGateway(script)
  const operatorPath = join(scratch.base, 'operator.json')
  writeOperator(
    operatorPath,
    operatorLayer({ storageRoot: scratch.storageRoot, port, modelRoute: gateway.url }),
  )
  const start = () =>
    startServer({ stateRoot: scratch.stateRoot, operatorPath, port, extraCaPath: gateway.certPath })
  let server = await start()
  const home = join(scratch.base, 'home-dave')
  const cli: Cli = (args, credential) =>
    runOmne({
      args: [...args],
      home,
      server: `http://127.0.0.1:${String(port)}`,
      cwd: scratch.base,
      ...(credential === undefined ? {} : { credential }),
    })
  await registerAndLogin(cli, 'dave', CREDENTIAL)
  const made: World = {
    scratch,
    gateway,
    cli,
    server: () => server,
    async restart() {
      await server.kill()
      server = await start()
    },
    async stop() {
      await server.kill()
      await gateway.close()
      scratch.remove()
    },
  }
  worlds.push(made)
  return made
}

afterEach(async () => {
  for (const made of worlds.splice(0)) await made.stop()
})

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** Waits until the first dispatch of the session's run shows its first content. */
async function untilFirstContent(cli: Cli, session: string): Promise<void> {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const read = await cli(['read-session-diagnostics', '--session', session, '--json'])
    const text = read.stdout
    if (read.status === 0 && /"firstContent":\{"kind":"known"/u.test(text)) return
    await sleep(300)
  }
  throw new Error('the first content was not saved in time')
}

describe('a Model call whose server is killed and started again (real processes)', () => {
  it(
    'C5: killed while generating, the call ends as runtime-lost, keeps its content, and the gateway saw one request',
    { timeout: 300_000 },
    async () => {
      const w = await world(request =>
        request.body.includes('RESTART-HALF')
          ? {
              kind: 'partial',
              body: half(request.body, 'half an answer that '),
              more: sse([{ choices: [{ delta: { content: 'goes on ' } }] }]),
              everyMs: 150,
            }
          : { kind: 'hold' },
      )
      const session = await createSession(w.cli)
      await sendInput(w.cli, session, 'RESTART-HALF please answer at length')
      await untilFirstContent(w.cli, session)
      await w.restart()
      const { run } = await untilRunEnded(w.cli, session, RUN_END_TIMEOUT_MS)
      const [call] = modelCallsOf(run)
      const [dispatch, ...more] = dispatchesOf(call)
      expect(more).toEqual([])
      expect(dispatch?.['firstContent']).toBe('observed')
      expect(dispatch?.['outcome']).toEqual({
        kind: 'failed',
        cause: 'runtime-lost',
        upstreamStatus: null,
      })
      expect(call?.['call']).toMatchObject({ phase: 'settled' })
      expect(structuredCauseOf(run)).toEqual({
        kind: 'no-reply',
        cause: 'runtime-lost',
        upstreamStatus: null,
      })
      expect(w.gateway.received()).toBe(1)
    },
  )

  it(
    'C6: killed after the request went out and before any content, the call ends as runtime-lost and nothing is sent again',
    { timeout: 300_000 },
    async () => {
      const w = await world(() => ({ kind: 'hold' }))
      const session = await createSession(w.cli)
      await sendInput(w.cli, session, 'RESTART-SILENT say something')
      await until(() => w.gateway.held() === 1, 'the request at the gateway', 60_000)
      await w.restart()
      const { run } = await untilRunEnded(w.cli, session, RUN_END_TIMEOUT_MS)
      const [call] = modelCallsOf(run)
      const [dispatch, ...more] = dispatchesOf(call)
      expect(more).toEqual([])
      expect(dispatch?.['send']).toBe('sent')
      expect(dispatch?.['outcome']).toEqual({
        kind: 'failed',
        cause: 'runtime-lost',
        upstreamStatus: null,
      })
      expect(structuredCauseOf(run)).toMatchObject({ cause: 'runtime-lost' })
      expect(w.gateway.received()).toBe(1)
    },
  )

  it(
    'C4: killed right after the whole reply went out, the reply reaches the session and the gateway saw one request',
    { timeout: 300_000 },
    async () => {
      let killed: Promise<void> | undefined
      const w = await world(request => {
        killed ??= sleep(30).then(() => w.server().kill())
        return whole(request.body, 'the whole reply')
      })
      const session = await createSession(w.cli)
      await sendInput(w.cli, session, 'RESTART-WHOLE answer briefly')
      await until(() => killed !== undefined, 'the reply at the gateway', 60_000)
      await killed
      await w.restart()
      const { run } = await untilRunEnded(w.cli, session, RUN_END_TIMEOUT_MS)
      const history = await w.cli(['read-history', '--session', session, '--json'])
      const [dispatch, ...more] = dispatchesOf(modelCallsOf(run)[0])
      expect(more).toEqual([])
      // The kill lands either after the reply was saved, and then the reply reaches the session,
      // or before, and then the call ends as runtime-lost; never a second request.
      const completed = { kind: 'completed', reason: 'stop' }
      const lost = { kind: 'failed', cause: 'runtime-lost', upstreamStatus: null }
      expect([completed, lost]).toContainEqual(dispatch?.['outcome'])
      if (JSON.stringify(dispatch?.['outcome']) === JSON.stringify(completed))
        expect(history.stdout).toContain('the whole reply')
      expect(w.gateway.received()).toBe(1)
    },
  )
})
