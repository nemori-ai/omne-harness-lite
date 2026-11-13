import { gate } from '../support/matrix/provider-stub.ts'
import {
  TURN_MS,
  bystander,
  bystanderUnchanged,
  signedIn,
  waitArrivals,
  type Cell,
  type CellTools,
} from './cell.ts'
import {
  RECOVERY_MS,
  chatAgain,
  historyMatches,
  lines,
  settled,
  toolRunning,
  waitFile,
} from './cells-g.ts'

const IDLE_SECONDS = 10

async function idleHealth(tools: CellTools): Promise<void> {
  await tools.sleep(3000)
  const mark = tools.env.mark()
  const cpu = await tools.env.cpuPercent(IDLE_SECONDS)
  const records = tools.env.records().slice(mark)
  const warnings = tools.env.warnings(mark)
  const counts = new Map<string, number>()
  for (const line of warnings) counts.set(line, (counts.get(line) ?? 0) + 1)
  const repeated = [...counts.entries()].filter(([, count]) => count >= 3)
  tools.note(
    `idle ${String(IDLE_SECONDS)} s: cpu ${cpu.toFixed(1)}%, ${String(records.length)} records, ${String(warnings.length)} warnings`,
  )
  tools.check(
    'o7 the idle server does no work (at most a few records in the idle window)',
    records.length <= 5,
    `${String(records.length)} records`,
  )
  tools.check('o7 the idle server does not spin (cpu at most 3%)', cpu <= 3, `${cpu.toFixed(1)}%`)
  tools.check(
    'o7 no warning repeats in the idle window',
    repeated.length === 0,
    repeated
      .map(([line, count]) => `${String(count)}x ${line}`)
      .join(' | ')
      .slice(0, 300),
  )
}

export const xCells: readonly Cell[] = [
  {
    id: 'X-1',
    block: 'X',
    layer: 'protocol',
    run: async tools => {
      const client = await signedIn(tools)
      const by = await bystander(tools, client)
      const session = await client.createSession()
      const held = gate()
      tools.stub.push({
        kind: 'hold',
        gate: held,
        head: 'X'.repeat(139),
        after: { kind: 'reply', text: 'never' },
      })
      await client.send(session, 'x1 write')
      await waitArrivals(tools, 2, 'model call in flight')
      await tools.env.restart('kill')
      const log = await tools.waitLog(session, 'run terminal after the kill', settled, RECOVERY_MS)
      tools.check(
        'o3 the run ends truthfully within the limit',
        log !== null && settled(log),
        JSON.stringify(log?.terminals),
      )
      tools.check(
        'o6 the model call was not sent again',
        tools.stub.arrivals().length === 2,
        String(tools.stub.arrivals().length),
      )
      if (log !== null && settled(log))
        await chatAgain(tools, tools.driver(client.account), session)
      bystanderUnchanged(tools, by)
    },
  },
  {
    id: 'X-2',
    block: 'X',
    layer: 'protocol',
    run: async tools => {
      const setup = await toolRunning(tools, 8)
      await tools.env.restart('kill')
      await waitFile(tools, setup.finished, 30_000)
      const log = await tools.waitLog(
        setup.session,
        'run terminal after the kill',
        settled,
        RECOVERY_MS,
      )
      tools.check(
        'the run has a definite end',
        log !== null && settled(log),
        JSON.stringify(log?.terminals),
      )
      tools.check(
        'o6 the command ran once',
        lines(setup.counter) === 1 && lines(setup.finished) <= 1,
        `${String(lines(setup.counter))}/${String(lines(setup.finished))}`,
      )
      tools.note(
        `tool result taken back: ${String(log?.tools.some(text => text.includes(setup.marker)))}`,
      )
      bystanderUnchanged(tools, setup.by)
    },
  },
  {
    id: 'X-事实',
    block: 'X',
    layer: 'protocol',
    run: async tools => {
      const client = await signedIn(tools)
      const session = await client.createSession()
      tools.stub.push({ kind: 'reply', text: 'x-fact-reply' })
      await client.send(session, 'x fact')
      const before = await tools.waitLog(
        session,
        'first run terminal',
        entry => entry.terminals.length === 1,
        TURN_MS,
      )
      await tools.env.restart('kill')
      const after = tools.log(session)
      tools.check(
        'confirmed facts are all there after the kill',
        JSON.stringify(after?.kinds) === JSON.stringify(before?.kinds),
        `${String(before?.entries.length)} -> ${String(after?.entries.length)}`,
      )
      const back = tools.driver(client.account)
      tools.check('logged in again', (await back.login()) === 'succeeded')
      await historyMatches(tools, back, session)
      await chatAgain(tools, back, session)
    },
  },
  {
    id: 'X-健康',
    block: 'X',
    layer: 'protocol',
    run: async tools => {
      const client = await signedIn(tools)
      const session = await client.createSession()
      const held = gate()
      tools.stub.push({
        kind: 'hold',
        gate: held,
        head: 'H'.repeat(100),
        after: { kind: 'reply', text: 'never' },
      })
      await client.send(session, 'x health')
      await waitArrivals(tools, 1, 'model call in flight')
      await tools.env.restart('kill')
      await tools.sleep(5000)
      await idleHealth(tools)
    },
  },
]
