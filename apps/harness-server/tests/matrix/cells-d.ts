import { gate } from '../support/matrix/provider-stub.ts'
import {
  TURN_MS,
  bystander,
  bystanderUnchanged,
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

const OUTAGE_MS = 120_000
const QUIET_MS = 5_000

function retryInServerLog(tools: CellTools, mark: number): void {
  const lines = tools.env
    .records()
    .slice(mark)
    .map(record => JSON.stringify(record))
    .filter(line => line.includes('agent run retries the model'))
  tools.check(
    'the retry and its cause are in the server log',
    lines.length > 0,
    lines.slice(0, 1).join('').slice(0, 300),
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

      const brief = await client.createSession()
      const briefMark = tools.env.mark()
      tools.stub.push({ kind: 'refuse' }, { kind: 'refuse' }, { kind: 'refuse' })
      tools.stub.push({ kind: 'reply', text: 'd1-after-retry' })
      tools.check('input accepted', (await client.send(brief, 'd1 hello')) === 'succeeded')
      const recovered = await tools.waitLog(
        brief,
        'run terminal after a short outage',
        entry => entry.terminals.length === 1,
        TURN_MS,
      )
      tools.check(
        'a short outage: the run completes by itself',
        recovered?.terminals[0] === 'completed',
        JSON.stringify(recovered?.terminals),
      )
      tools.check(
        'a short outage: the reply arrives without a new input',
        recovered?.assistants.includes('d1-after-retry') === true && recovered.users.length === 1,
        `${JSON.stringify(recovered?.assistants)}, ${String(recovered?.users.length)} user messages`,
      )
      retryInServerLog(tools, briefMark)

      const long = await client.createSession()
      const longMark = tools.env.mark()
      tools.stub.push(...Array.from({ length: 40 }, () => ({ kind: 'refuse' as const })))
      tools.check('input accepted', (await client.send(long, 'd1 hello again')) === 'succeeded')
      const failed = await tools.waitLog(
        long,
        'run terminal after an outage longer than the budget',
        entry => entry.terminals.length === 1,
        OUTAGE_MS,
      )
      tools.stub.clear()
      tools.check(
        'a long outage: the run ends as failed once the budget is used up',
        failed?.terminals.length === 1 && failed.terminals[0] === 'failed',
        JSON.stringify(failed?.terminals),
      )
      tools.check(
        'a long outage: no reply is invented',
        failed?.assistants.length === 0,
        JSON.stringify(failed?.assistants),
      )
      await causeInHistory(tools, client, long)
      causeInServerLog(tools, longMark)
      bystanderUnchanged(tools, by)
      await retryWorks(tools, client, long, 1)
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
      tools.stub.push({ kind: 'reply', text: 'd2-whole-reply' })
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
        'the run completes by itself after the cut',
        log?.terminals.length === 1 && log.terminals[0] === 'completed',
        JSON.stringify(log?.terminals),
      )
      tools.check(
        'the reply is the whole second answer and the half reply is dropped',
        log?.assistants.length === 1 && log.assistants[0] === 'd2-whole-reply',
        JSON.stringify(log?.assistants.map(text => text.slice(0, 40))),
      )
      tools.check(
        'the reply arrives without a new input',
        log?.users.length === 1,
        `${String(log?.users.length)} user messages`,
      )
      retryInServerLog(tools, mark)
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
      tools.stub.push({
        kind: 'hold',
        gate: held,
        head: 'D'.repeat(180),
        after: { kind: 'reply', text: 'qf-first-reply' },
      })
      tools.stub.push({ kind: 'status', code: 400 })
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
      const appended = failed?.inputs[1] ?? ''
      tools.check(
        'the run that took the appended input ends as failed',
        failed?.terminals[0] === 'failed' && failed.batches.some(batch => batch.includes(appended)),
        `${JSON.stringify(failed?.terminals)}, batches ${JSON.stringify(failed?.batches)}`,
      )
      await tools.sleep(QUIET_MS)
      const quiet = tools.log(session)
      tools.check(
        'no run starts by itself after the failure',
        quiet?.started === 1 && quiet.terminals.length === 1,
        `${String(quiet?.started)} started, ${String(quiet?.terminals.length)} ended`,
      )
      tools.stub.clear()
      tools.stub.push({ kind: 'reply', text: '收到甲，也收到新的' })
      tools.check(
        'a new input is accepted',
        (await client.send(session, 'qf new message')) === 'succeeded',
      )
      const handled = await tools.waitLog(
        session,
        'the run after the new input ends',
        log => log.started === 2 && log.terminals.length === 2,
        TURN_MS,
      )
      tools.check(
        'the next run completes and answers',
        handled?.terminals[1] === 'completed' &&
          handled.assistants.some(text => text.includes('收到甲')),
        `${JSON.stringify(handled?.terminals)} ${JSON.stringify(handled?.assistants)}`,
      )
      const fresh = handled?.inputs[2] ?? ''
      const later = handled?.batches.slice(failed?.batches.length ?? 0) ?? []
      const taken = later.flat()
      tools.check(
        'the next run takes the appended input again, before the new one, once each',
        taken.filter(input => input === appended).length === 1 &&
          taken.filter(input => input === fresh).length === 1 &&
          taken.indexOf(appended) < taken.indexOf(fresh),
        JSON.stringify(later),
      )
      tools.check(
        'nobody had to type the appended message again',
        handled?.users.filter(text => text.includes('qf appended')).length === 1,
        JSON.stringify(handled?.users),
      )
    },
  },
]
