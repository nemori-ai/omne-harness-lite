import { UNSCRIPTED_REPLY, gate } from '../support/matrix/provider-stub.ts'
import {
  TURN_MS,
  idleHealth,
  bystander,
  bystanderUnchanged,
  interruptedCallNotResent,
  signedIn,
  waitArrivals,
  type Cell,
} from './cell.ts'
import {
  RECOVERY_MS,
  chatAgain,
  historyMatches,
  interruptedCommand,
  settled,
  toolRunning,
} from './cells-g.ts'

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
      const before = tools.stub.arrivals().length
      await tools.env.restart('kill')
      const log = await tools.waitLog(session, 'run terminal after the kill', settled, RECOVERY_MS)
      tools.check(
        'o3 the run ends truthfully within the limit: a new call completes it',
        log?.terminals[0] === 'completed' && log.assistants.at(-1) === UNSCRIPTED_REPLY,
        JSON.stringify([log?.terminals, log?.assistants]),
      )
      interruptedCallNotResent(tools, before)
      if (log !== null && settled(log)) {
        const back = tools.driver(client.account)
        tools.check('logged in again', (await back.login()) === 'succeeded')
        await chatAgain(tools, back, session)
      }
      bystanderUnchanged(tools, by)
    },
  },
  {
    id: 'X-2',
    block: 'X',
    layer: 'protocol',
    leavesNoUnits: true,
    run: async tools => {
      const setup = await toolRunning(tools, 8)
      await tools.env.restart('kill')
      await interruptedCommand(tools, setup, 'run terminal after the kill')
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
      await idleHealth(tools)
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
      const log = await tools.waitLog(session, 'run terminal after the kill', settled, RECOVERY_MS)
      tools.check(
        'o3 the run ended after the kill',
        log !== null && settled(log),
        JSON.stringify(log?.terminals),
      )
      await idleHealth(tools)
    },
  },
]
