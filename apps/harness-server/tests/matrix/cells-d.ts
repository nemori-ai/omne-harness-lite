import { gate } from '../support/matrix/provider-stub.ts'
import {
  TURN_MS,
  bystander,
  bystanderUnchanged,
  eachInputTakenOnce,
  plain,
  signedIn,
  waitArrivals,
  type Cell,
  type CellTools,
} from './cell.ts'
import type { ProtocolDriver } from '../support/matrix/protocol-driver.ts'

const ESSAY = 'D'.repeat(1500)

const CAUSE =
  /connect-failed|connect retry|fault=upstream|upstream-un|no-reply|stream ended|interrupted/i

async function causeInHistory(
  tools: CellTools,
  client: ProtocolDriver,
  session: string,
): Promise<void> {
  const history = await client.readHistory(session)
  const telling = history.entries
    .filter(entry => entry.kind !== 'message.user')
    .filter(entry => CAUSE.test(JSON.stringify(plain(entry.payload))))
    .map(entry => entry.kind)
  tools.note(`history kinds ${JSON.stringify(history.entries.map(entry => entry.kind))}`)
  tools.check(
    'the cause is readable through the protocol',
    telling.length > 0,
    JSON.stringify(telling),
  )
}

function causeInServerLog(tools: CellTools, mark: number): void {
  const lines = tools.env
    .records()
    .slice(mark)
    .map(record => JSON.stringify(record))
    .filter(line => CAUSE.test(line))
  tools.check(
    'the cause is in the server log',
    lines.length > 0,
    lines.slice(0, 2).join(' | ').slice(0, 300),
  )
}

async function retryWorks(
  tools: CellTools,
  client: ProtocolDriver,
  session: string,
  terminalsBefore: number,
): Promise<void> {
  tools.stub.push({ kind: 'reply', text: 'd-after-recovery' })
  tools.check(
    'provider back: next input accepted',
    (await client.send(session, 'd retry')) === 'succeeded',
  )
  const after = await tools.waitLog(
    session,
    'run after recovery terminal',
    log => log.terminals.length > terminalsBefore,
    TURN_MS,
  )
  tools.check(
    'provider back: next run completed',
    after?.terminals.at(-1) === 'completed',
    JSON.stringify(after?.terminals),
  )
}

export const dCells: readonly Cell[] = [
  {
    id: 'D-1',
    block: 'D',
    layer: 'protocol',
    run: async tools => {
      const client = await signedIn(tools)
      const by = await bystander(tools, client)
      const session = await client.createSession()
      const mark = tools.env.mark()
      tools.stub.push({ kind: 'refuse' }, { kind: 'refuse' }, { kind: 'refuse' })
      tools.check('input accepted', (await client.send(session, 'd1 hello')) === 'succeeded')
      const log = await tools.waitLog(
        session,
        'run terminal while the provider refuses',
        entry => entry.terminals.length === 1,
        TURN_MS,
      )
      tools.check(
        'the run has a definite end while the provider is down',
        log?.terminals.length === 1,
        JSON.stringify(log?.terminals),
      )
      tools.check(
        'the run is not written as completed',
        log?.terminals[0] !== 'completed',
        JSON.stringify(log?.terminals),
      )
      await causeInHistory(tools, client, session)
      causeInServerLog(tools, mark)
      bystanderUnchanged(tools, by)
      await retryWorks(tools, client, session, 1)
    },
  },
  {
    id: 'D-2',
    block: 'D',
    layer: 'protocol',
    run: async tools => {
      const client = await signedIn(tools)
      const by = await bystander(tools, client)
      const session = await client.createSession()
      const mark = tools.env.mark()
      tools.stub.push({ kind: 'cut', text: ESSAY, afterChars: 135, chunkGapMs: 20 })
      tools.check(
        'input accepted',
        (await client.send(session, 'd2 write an essay')) === 'succeeded',
      )
      const log = await tools.waitLog(
        session,
        'run terminal after the cut',
        entry => entry.terminals.length === 1,
        TURN_MS,
      )
      tools.check(
        'the run has a definite end',
        log?.terminals.length === 1,
        JSON.stringify(log?.terminals),
      )
      tools.check(
        'the run is not written as completed',
        log !== null && log.terminals[0] !== 'completed',
        JSON.stringify(log?.terminals),
      )
      tools.check(
        'what was already streamed is accounted for (a reply or a stated failure)',
        log !== null && (log.assistants.length > 0 || log.terminals[0] !== 'completed'),
        `${String(log?.assistants.length)} replies, ${JSON.stringify(log?.terminals)}`,
      )
      causeInServerLog(tools, mark)
      bystanderUnchanged(tools, by)
      await retryWorks(tools, client, session, 1)
    },
  },
  {
    id: 'Q-失败',
    block: 'Q',
    layer: 'protocol',
    run: async tools => {
      const client = await signedIn(tools)
      const session = await client.createSession()
      const held = gate()
      tools.stub.push({ kind: 'hold', gate: held, head: 'D'.repeat(180), after: { kind: 'drop' } })
      tools.stub.push({ kind: 'refuse' }, { kind: 'refuse' }, { kind: 'refuse' })
      tools.check(
        'input accepted',
        (await client.send(session, 'qf write an essay')) === 'succeeded',
      )
      await waitArrivals(tools, 1, 'first model call')
      tools.check(
        'appended input accepted',
        (await client.send(session, 'qf appended: reply 收到甲')) === 'succeeded',
      )
      await tools.waitLog(
        session,
        'appended message in the log',
        log => log.users.length === 2,
        TURN_MS,
      )
      held.open()
      const failed = await tools.waitLog(
        session,
        'failing run terminal',
        log => log.terminals.length >= 1,
        TURN_MS,
      )
      tools.note(
        `after the outage: ${JSON.stringify(failed?.terminals)}, batches ${JSON.stringify(failed?.batches)}`,
      )
      tools.stub.push({ kind: 'reply', text: '收到甲' })
      const handled = await tools.waitLog(
        session,
        'the appended message answered without a new input',
        log =>
          log.started === log.terminals.length &&
          log.assistants.some(text => text.includes('收到甲')),
        TURN_MS,
      )
      tools.check(
        'o4 the appended message is answered without a new input',
        handled?.assistants.some(text => text.includes('收到甲')) === true,
        JSON.stringify(handled?.assistants),
      )
      eachInputTakenOnce(tools, handled)
    },
  },
]
