import { gate, type Gate } from '../support/matrix/provider-stub.ts'
import type { ProtocolDriver } from '../support/matrix/protocol-driver.ts'
import type { SessionLog } from '../support/matrix/session-log.ts'
import {
  TURN_MS,
  eachInputTakenOnce,
  sameHistory,
  signedIn,
  waitArrivals,
  type Cell,
  type CellTools,
} from './cell.ts'

type Queued = Readonly<{ client: ProtocolDriver; session: string; held: Gate }>

async function queued(tools: CellTools, words: readonly string[], answer: string): Promise<Queued> {
  const client = await signedIn(tools)
  const session = await client.createSession()
  const held = gate()
  tools.stub.push({
    kind: 'hold',
    gate: held,
    head: 'Q'.repeat(60),
    after: { kind: 'reply', text: 'q-first-reply' },
  })
  tools.stub.push({ kind: 'reply', text: answer })
  tools.check(
    'first input accepted',
    (await client.send(session, 'q write an essay')) === 'succeeded',
  )
  await waitArrivals(tools, 1, 'first model call')
  for (const word of words)
    tools.check(
      `appended ${word} accepted`,
      (await client.send(session, `appended ${word}: reply 收到${word}`)) === 'succeeded',
    )
  await tools.waitLog(
    session,
    'appended messages in the log',
    log => log.users.length === 1 + words.length,
    TURN_MS,
  )
  return { client, session, held }
}

function answered(words: readonly string[]) {
  return (log: SessionLog) =>
    log.started > 0 &&
    log.started === log.terminals.length &&
    words.every(word => log.assistants.some(text => text.includes(`收到${word}`)))
}

function o4(tools: CellTools, log: SessionLog | null, words: readonly string[]): void {
  tools.check(
    'o4 every appended message answered, every run ended',
    log !== null && answered(words)(log),
    `${JSON.stringify(log?.terminals)} ${JSON.stringify(log?.assistants).slice(0, 200)}`,
  )
  const positions = words.map(
    word => log?.users.findIndex(text => text.includes(`appended ${word}`)) ?? -1,
  )
  tools.check(
    'o4 appended messages after the first, in order, once each',
    positions.every((p, i) => p >= 1 && (i === 0 || p > (positions[i - 1] ?? 0))) &&
      words.every(
        word => log?.users.filter(text => text.includes(`appended ${word}`)).length === 1,
      ),
    JSON.stringify(positions),
  )
  eachInputTakenOnce(tools, log)
}

async function historyMatches(
  tools: CellTools,
  client: ProtocolDriver,
  session: string,
): Promise<void> {
  const history = await client.readHistory(session)
  const log = tools.log(session)
  const same = log === null ? { ok: false, detail: 'no log' } : sameHistory(log, history.entries)
  tools.check('o1 history read through the protocol equals the log', same.ok, same.detail)
}

async function chatAgain(tools: CellTools, client: ProtocolDriver, session: string): Promise<void> {
  const before = tools.log(session)?.terminals.length ?? 0
  tools.stub.push({ kind: 'reply', text: 'q-again' })
  tools.check('o5 next input accepted', (await client.send(session, 'q again')) === 'succeeded')
  const after = await tools.waitLog(
    session,
    'o5 run terminal',
    log => log.terminals.length > before && log.started === log.terminals.length,
    TURN_MS,
  )
  tools.check(
    'o5 next run completed',
    after?.terminals.at(-1) === 'completed',
    JSON.stringify(after?.terminals),
  )
}

const ONE = ['甲'] as const

export const qCells: readonly Cell[] = [
  {
    id: 'Q-1',
    block: 'Q',
    layer: 'protocol',
    run: async tools => {
      const { client, session, held } = await queued(tools, ONE, '收到甲')
      held.open()
      const log = await tools.waitLog(session, 'appended message answered', answered(ONE), TURN_MS)
      o4(tools, log, ONE)
      tools.check(
        'the run completed',
        log?.terminals[0] === 'completed',
        JSON.stringify(log?.terminals),
      )
      tools.check(
        'o6 two model calls',
        tools.stub.arrivals().length === 2,
        String(tools.stub.arrivals().length),
      )
      await historyMatches(tools, client, session)
    },
  },
  {
    id: 'Q-2',
    block: 'Q',
    layer: 'protocol',
    run: async tools => {
      const words = ['甲', '乙', '丙'] as const
      const { client, session, held } = await queued(tools, words, '收到甲 收到乙 收到丙')
      held.open()
      const log = await tools.waitLog(
        session,
        'appended messages answered',
        answered(words),
        TURN_MS,
      )
      o4(tools, log, words)
      tools.check(
        'the run completed',
        log?.terminals[0] === 'completed',
        JSON.stringify(log?.terminals),
      )
      await historyMatches(tools, client, session)
    },
  },
  {
    id: 'Q-K',
    block: 'Q',
    layer: 'protocol',
    run: async tools => {
      const { client, session, held } = await queued(tools, ONE, '收到甲')
      client.close()
      await tools.sleep(1000)
      const back = tools.driver(client.account)
      tools.check('logged in again', (await back.login()) === 'succeeded')
      const running = tools.log(session)
      tools.check(
        'the run is still going when the client is back',
        running !== null && running.terminals.length === 0,
        JSON.stringify(running?.terminals),
      )
      const history = await back.readHistory(session)
      const seen = history.entries.some(
        entry =>
          entry.kind === 'message.user' && JSON.stringify(entry.payload).includes('appended 甲'),
      )
      tools.check('the appended message is visible when the client is back', seen)
      held.open()
      const log = await tools.waitLog(session, 'appended message answered', answered(ONE), TURN_MS)
      o4(tools, log, ONE)
      await historyMatches(tools, back, session)
    },
  },
  {
    id: 'Q-K2',
    block: 'Q',
    layer: 'protocol',
    run: async tools => {
      const { client, session, held } = await queued(tools, ONE, '收到甲')
      client.close()
      held.open()
      const log = await tools.waitLog(
        session,
        'appended message answered with no client',
        answered(ONE),
        TURN_MS,
      )
      o4(tools, log, ONE)
      tools.check(
        'the first run completed',
        log?.terminals[0] === 'completed',
        JSON.stringify(log?.terminals),
      )
      const back = tools.driver(client.account)
      tools.check('logged in again', (await back.login()) === 'succeeded')
      await historyMatches(tools, back, session)
    },
  },
  {
    id: 'Q-取消',
    block: 'Q',
    layer: 'protocol',
    run: async tools => {
      const { client, session } = await queued(tools, ONE, '收到甲')
      const run = await client.currentRun(session, 10_000)
      tools.check('the current run is observable', run !== null)
      if (run !== null)
        tools.check('cancel accepted', (await client.cancelRun(session, run)) === 'succeeded')
      const log = await tools.waitLog(
        session,
        'appended message answered by the next run',
        answered(ONE),
        TURN_MS,
      )
      o4(tools, log, ONE)
      tools.check(
        'the first run was cancelled',
        log?.terminals[0] === 'cancelled',
        JSON.stringify(log?.terminals),
      )
      await historyMatches(tools, client, session)
    },
  },
  {
    id: 'Q-G',
    block: 'Q',
    layer: 'protocol',
    run: async tools => {
      const { client, session, held } = await queued(tools, ONE, '收到甲')
      client.close()
      const stopping = tools.env.stop()
      await tools.sleep(1000)
      held.open()
      const report = await stopping
      tools.note(`ordered stop took ${String(report.tookMs)} ms, code ${String(report.code)}`)
      await tools.env.start()
      const log = await tools.waitLog(
        session,
        'appended message answered after restart',
        answered(ONE),
        TURN_MS,
      )
      o4(tools, log, ONE)
      const back = tools.driver(client.account)
      tools.check('logged in again', (await back.login()) === 'succeeded')
      await historyMatches(tools, back, session)
      await chatAgain(tools, back, session)
    },
  },
  {
    id: 'Q-X',
    block: 'Q',
    layer: 'protocol',
    run: async tools => {
      const { client, session } = await queued(tools, ONE, '收到甲')
      client.close()
      const before = tools.log(session)
      tools.check(
        'the appended message was confirmed before the kill',
        before?.users.some(text => text.includes('appended 甲')) === true,
      )
      await tools.env.kill()
      const kept = tools.log(session)
      tools.check(
        'confirmed inputs are still there after the kill',
        kept?.users.length === 2,
        String(kept?.users.length),
      )
      await tools.env.start()
      const log = await tools.waitLog(
        session,
        'appended message answered after the kill',
        answered(ONE),
        TURN_MS,
      )
      o4(tools, log, ONE)
    },
  },
  {
    id: 'Q-R',
    block: 'Q',
    layer: 'protocol',
    untestable: 'no entry point unloads and reloads one row of a running server (record 5)',
  },
]
