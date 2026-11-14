import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gate } from '../support/matrix/provider-stub.ts'
import type { ProtocolDriver } from '../support/matrix/protocol-driver.ts'
import type { SessionLog } from '../support/matrix/session-log.ts'
import {
  TURN_MS,
  idleHealth,
  bystander,
  bystanderUnchanged,
  sameHistory,
  shellCommand,
  signedIn,
  waitArrivals,
  type Cell,
  type CellTools,
} from './cell.ts'

export const RECOVERY_MS = 60_000
const WAITING_TENANTS = 8

export function lines(file: string): number {
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).length : 0
}

export async function waitFile(
  tools: CellTools,
  file: string,
  timeoutMs: number,
): Promise<boolean> {
  const until = Date.now() + timeoutMs
  while (!existsSync(file)) {
    if (Date.now() > until) {
      tools.note(`timeout after ${String(timeoutMs)} ms waiting for: file ${file}`)
      return false
    }
    await tools.sleep(100)
  }
  return true
}

export async function chatAgain(
  tools: CellTools,
  client: ProtocolDriver,
  session: string,
): Promise<void> {
  const before = tools.log(session)?.terminals.length ?? 0
  tools.stub.push({ kind: 'reply', text: 'again' })
  tools.check('o5 next input accepted', (await client.send(session, 'again')) === 'succeeded')
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

export async function historyMatches(
  tools: CellTools,
  client: ProtocolDriver,
  session: string,
): Promise<void> {
  const history = await client.readHistory(session)
  const log = tools.log(session)
  const same = log === null ? { ok: false, detail: 'no log' } : sameHistory(log, history.entries)
  tools.check('o1 history read through the protocol equals the log', same.ok, same.detail)
}

export function settled(log: SessionLog): boolean {
  return log.started > 0 && log.started === log.terminals.length
}

export type ToolSetup = Readonly<{
  client: ProtocolDriver
  session: string
  counter: string
  finished: string
  marker: string
}>

export async function toolRunning(
  tools: CellTools,
  seconds: number,
): Promise<ToolSetup & { by: Awaited<ReturnType<typeof bystander>> }> {
  const client = await signedIn(tools)
  const by = await bystander(tools, client)
  const session = await client.createSession()
  const marker = `done-${String(Date.now())}`
  const counter = join(tools.env.workspace, `${marker}.count`)
  const finished = join(tools.env.workspace, `${marker}.end`)
  tools.stub.push(
    {
      kind: 'tool-call',
      name: 'Shell',
      arguments: shellCommand(
        `echo run >> ${counter}; sleep ${String(seconds)}; echo end >> ${finished}; echo ${marker}`,
      ),
    },
    { kind: 'reply', text: `the command said ${marker}` },
  )
  tools.check('input accepted', (await client.send(session, 'run the command')) === 'succeeded')
  tools.check('the command started before the stop', await waitFile(tools, counter, TURN_MS))
  return { client, session, counter, finished, marker, by }
}

export const gCells: readonly Cell[] = [
  {
    id: 'G-0',
    block: 'G',
    layer: 'protocol',
    run: async tools => {
      const client = await signedIn(tools)
      const session = await client.createSession()
      tools.stub.push({ kind: 'reply', text: 'g0-reply' })
      await client.send(session, 'g0 hello')
      const before = await tools.waitLog(
        session,
        'first run terminal',
        log => log.terminals.length === 1,
        TURN_MS,
      )
      const report = await tools.env.restart('stop')
      tools.note(`ordered stop ${String(report.tookMs)} ms`)
      const after = tools.log(session)
      tools.check(
        'o1 the log is the same after the restart',
        JSON.stringify(after?.kinds) === JSON.stringify(before?.kinds),
        `${String(before?.entries.length)} -> ${String(after?.entries.length)}`,
      )
      const back = tools.driver(client.account)
      tools.check('logged in again', (await back.login()) === 'succeeded')
      await historyMatches(tools, back, session)
      await chatAgain(tools, back, session)
      await idleHealth(tools)
    },
  },
  {
    id: 'G-1/单步',
    block: 'G',
    layer: 'protocol',
    run: async tools => {
      const client = await signedIn(tools)
      const by = await bystander(tools, client)
      const session = await client.createSession()
      const text = 'G'.repeat(600)
      tools.stub.push({ kind: 'reply', text, chunkChars: 20, chunkGapMs: 100 })
      await client.send(session, 'g1 write')
      await waitArrivals(tools, 2, 'model call in flight')
      await tools.sleep(500)
      const report = await tools.env.stop()
      tools.note(
        `ordered stop ${String(report.tookMs)} ms, overall ${JSON.stringify(report.shutdown?.['overall'])}`,
      )
      const atStop = tools.log(session)
      tools.check(
        'the stop waited for the reply: it is in the log',
        atStop?.assistants[0] === text,
        `${String(atStop?.assistants[0]?.length)} chars`,
      )
      await tools.env.start()
      const log = await tools.waitLog(
        session,
        'run terminal after restart',
        entry => entry.terminals.length === 1,
        RECOVERY_MS,
      )
      tools.check(
        'o3 the run completed',
        log?.terminals[0] === 'completed',
        JSON.stringify(log?.terminals),
      )
      tools.check(
        'o6 one reply, one model call for it',
        log?.assistants.length === 1 && tools.stub.arrivals().length === 2,
        `${String(log?.assistants.length)} replies, ${String(tools.stub.arrivals().length)} calls`,
      )
      bystanderUnchanged(tools, by)
    },
  },
  {
    id: 'G-1/多步',
    block: 'G',
    layer: 'protocol',
    run: async tools => {
      const client = await signedIn(tools)
      const by = await bystander(tools, client)
      const session = await client.createSession()
      const counter = join(tools.env.workspace, 'g1multi.count')
      const held = gate()
      tools.stub.push(
        {
          kind: 'hold',
          gate: held,
          head: 'M'.repeat(200),
          after: {
            kind: 'tool-call',
            name: 'Shell',
            arguments: shellCommand(`echo run >> ${counter}; echo g1-multi-done`),
          },
        },
        { kind: 'reply', text: 'the command said g1-multi-done' },
      )
      await client.send(session, 'g1 multi')
      await waitArrivals(tools, 2, 'model call in flight')
      const stopping = tools.env.stop()
      await tools.sleep(1000)
      held.open()
      const report = await stopping
      tools.note(`ordered stop ${String(report.tookMs)} ms`)
      const atStop = tools.log(session)
      tools.check(
        'the in-flight reply is not lost',
        (atStop?.assistants.length ?? 0) >= 1,
        `${String(atStop?.assistants.length)} replies`,
      )
      await tools.env.start()
      const log = await tools.waitLog(
        session,
        'run terminal after restart',
        entry => entry.terminals.length === 1,
        RECOVERY_MS,
      )
      tools.check(
        'o3 the run went on and completed',
        log?.terminals[0] === 'completed',
        JSON.stringify(log?.terminals),
      )
      tools.check('o6 the command ran once', lines(counter) === 1, String(lines(counter)))
      tools.check(
        'the tool result is in the log',
        log?.tools.length === 1 && log.tools[0]?.includes('g1-multi-done') === true,
        String(log?.tools.length),
      )
      bystanderUnchanged(tools, by)
    },
  },
  {
    id: 'G-1/超时',
    block: 'G',
    layer: 'protocol',
    run: async tools => {
      await tools.env.stop()
      await tools.env.start(['--drain-deadline-ms', '3000'])
      const client = await signedIn(tools)
      const session = await client.createSession()
      const held = gate()
      tools.stub.push({
        kind: 'hold',
        gate: held,
        head: 'T'.repeat(136),
        after: { kind: 'reply', text: 'never' },
      })
      await client.send(session, 'g1 timeout')
      await waitArrivals(tools, 1, 'model call in flight')
      const report = await tools.env.stop()
      tools.check(
        'the stop ends at the drain deadline',
        report.tookMs < 30_000,
        `${String(report.tookMs)} ms`,
      )
      tools.check(
        'the stop report says a call was still in flight',
        report.shutdown?.['overall'] === 'incomplete',
        JSON.stringify(report.shutdown?.['overall']),
      )
      await tools.env.start()
      const log = await tools.waitLog(session, 'run terminal after restart', settled, RECOVERY_MS)
      tools.check(
        'o3 the run ends truthfully after the restart',
        log !== null && settled(log),
        JSON.stringify(log?.terminals),
      )
      tools.check(
        'o6 the model call was not sent again',
        tools.stub.arrivals().length === 1,
        String(tools.stub.arrivals().length),
      )
    },
  },
  {
    id: 'G-2/t1',
    block: 'G',
    layer: 'protocol',
    run: async tools => {
      const setup = await toolRunning(tools, 4)
      const report = await tools.env.stop()
      tools.note(`ordered stop ${String(report.tookMs)} ms`)
      await waitFile(tools, setup.finished, 15_000)
      tools.note(
        `the command finished while the server was down: ${String(existsSync(setup.finished))}`,
      )
      await tools.env.start()
      const log = await tools.waitLog(
        setup.session,
        'run terminal after restart',
        settled,
        RECOVERY_MS,
      )
      tools.check(
        'the tool result is taken back',
        log?.tools.some(text => text.includes(setup.marker)) === true,
        String(log?.tools.length),
      )
      tools.check(
        'o3 the run completed',
        log?.terminals[0] === 'completed',
        JSON.stringify(log?.terminals),
      )
      tools.check(
        'o6 the command ran once',
        lines(setup.counter) === 1 && lines(setup.finished) <= 1,
        `${String(lines(setup.counter))}/${String(lines(setup.finished))}`,
      )
      bystanderUnchanged(tools, setup.by)
    },
  },
  {
    id: 'G-2/t2',
    block: 'G',
    layer: 'protocol',
    run: async tools => {
      const setup = await toolRunning(tools, 15)
      const report = await tools.env.restart('stop')
      tools.note(`ordered stop ${String(report.tookMs)} ms`)
      tools.check('the command was still running at the restart', !existsSync(setup.finished))
      tools.check(
        'the command was not stopped: it finished',
        await waitFile(tools, setup.finished, 30_000),
      )
      const log = await tools.waitLog(
        setup.session,
        'run terminal after restart',
        settled,
        RECOVERY_MS,
      )
      tools.check(
        'the tool result is taken back',
        log?.tools.some(text => text.includes(setup.marker)) === true,
        String(log?.tools.length),
      )
      tools.check(
        'o3 the run completed',
        log?.terminals[0] === 'completed',
        JSON.stringify(log?.terminals),
      )
      tools.check(
        'o6 the command ran once',
        lines(setup.counter) === 1 && lines(setup.finished) <= 1,
        `${String(lines(setup.counter))}/${String(lines(setup.finished))}`,
      )
      bystanderUnchanged(tools, setup.by)
    },
  },
  { id: 'G-开页', block: 'G', layer: 'page', probe: 'gx-block.mjs <cell> closed' },
  {
    id: 'G-开页/协议',
    block: 'G',
    layer: 'protocol',
    run: async tools => {
      const reader = await signedIn(tools)
      const own = await reader.createSession()
      const held = Array.from({ length: WAITING_TENANTS }, () => gate())
      for (const one of held) {
        const other = await signedIn(tools)
        const session = await other.createSession()
        tools.stub.push({ kind: 'hold', gate: one, after: { kind: 'drop' } })
        tools.check('input accepted', (await other.send(session, 'g-open hold')) === 'succeeded')
      }
      await waitArrivals(tools, WAITING_TENANTS, 'every run reached the provider')
      await tools.env.restart('kill')
      const started = Date.now()
      const raw = await reader.rawOutcome('list-sessions')
      tools.note(
        `one plain ask right after the restart: ${raw} at ${String(Date.now() - started)} ms`,
      )
      const listed = await reader.listSessionsAsShipped()
      tools.note(
        `as shipped: ${listed.outcome} at ${String(Date.now() - started)} ms after ${String(listed.reasks)} more asks`,
      )
      tools.check(
        'the session list is read without a manual retry',
        listed.outcome === 'succeeded',
        listed.outcome,
      )
      tools.check(
        'the own session is in the list',
        listed.sessions.includes(own),
        `${String(listed.sessions.length)} listed`,
      )
      for (const one of held) one.open()
    },
  },
  {
    id: 'G-多租户/协议',
    block: 'G',
    layer: 'protocol',
    run: async tools => {
      const from = Date.now()
      const held = Array.from({ length: CROWD_TENANTS }, () => gate())
      const sessions: string[] = []
      let quietFrom = 0
      try {
        for (const one of held) {
          const other = await signedIn(tools)
          const session = await other.createSession()
          tools.stub.push({ kind: 'hold', gate: one, after: { kind: 'reply', text: 'crowd' } })
          const sent = await other.send(session, 'g-crowd hold')
          tools.check('input accepted', sent === 'succeeded', sent)
          if (sent === 'succeeded') sessions.push(session)
        }
        // The Model holds at most a set number of sends in flight and queues the rest in its own
        // records, so only some of the calls reach the provider while the runs are held.
        const arrived = await waitArrivals(tools, 1, 'a run reached the provider')
        tools.check('calls reached the provider', arrived, String(tools.stub.arrivals().length))
        quietFrom = Date.now()
        await tools.sleep(CROWD_QUIET_MS)
        tools.note(`${String(tools.stub.arrivals().length)} calls at the provider while held`)
        tools.note(`readWork per 5 s up to the newcomer: ${readsPerWindow(tools, from).join(' ')}`)
        const newcomer = tools.driver()
        const registered = await newcomer.register()
        tools.check('the newcomer registers', registered === 'succeeded', registered)
        const own = await newcomer.createSession()
        tools.check('the newcomer creates a session', own.length > 0)
        tools.stub.push({ kind: 'reply', text: 'newcomer' })
        tools.check('the newcomer input accepted', (await newcomer.send(own, 'hi')) === 'succeeded')
        const listed = await newcomer.listSessions()
        tools.check('the newcomer lists its session', listed.sessions.includes(own), listed.outcome)
        const released = tools.env.mark()
        for (const one of held) one.open()
        for (const session of [own, ...sessions]) {
          const log = await tools.waitLog(session, 'run terminal', settled, TURN_MS)
          tools.check('the run completed', log?.terminals[0] === 'completed', session)
          if (log?.terminals[0] !== 'completed')
            tools.note(
              `${session.slice(0, 8)} started ${String(log?.started)} ended ${JSON.stringify(log?.terminals)}: ${warningsSince(tools, released)}`,
            )
        }
      } finally {
        for (const one of held) one.open()
        tools.note(`${String(sessions.length)} of ${String(CROWD_TENANTS)} tenants waiting`)
        if (quietFrom > 0)
          tools.note(`quiet from window ${String(Math.floor((quietFrom - from) / WINDOW_MS))}`)
        tools.note(`omne.session.readWork per 5 s: ${readsPerWindow(tools, from).join(' ')}`)
      }
    },
  },
]

const CROWD_TENANTS = 24
const CROWD_QUIET_MS = 40_000
const WINDOW_MS = 5000

/** The warnings of the server since `mark`, the most frequent first, with their counts. */
function warningsSince(tools: CellTools, mark: number): string {
  const counts = new Map<string, number>()
  for (const line of tools.env.warnings(mark)) counts.set(line, (counts.get(line) ?? 0) + 1)
  return [...counts.entries()]
    .sort((one, other) => other[1] - one[1])
    .slice(0, 4)
    .map(([line, count]) => `${String(count)}x ${line.slice(0, 160)}`)
    .join(' | ')
}

/** The snapshot reads of the session per 5 s window since `from`. */
function readsPerWindow(tools: CellTools, from: number): number[] {
  const counts: number[] = []
  for (const record of tools.env.records()) {
    if (record.name !== 'omne.session.readWork' || typeof record['time'] !== 'string') continue
    const slot = Math.floor((Date.parse(record['time']) - from) / WINDOW_MS)
    if (slot >= 0) counts[slot] = (counts[slot] ?? 0) + 1
  }
  return Array.from(counts, count => count ?? 0)
}
