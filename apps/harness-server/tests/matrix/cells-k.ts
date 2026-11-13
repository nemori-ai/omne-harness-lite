import { runsSettled } from '../support/matrix/session-log.ts'
import { TURN_MS, sameHistory, type Cell } from './cell.ts'

export const kCells: readonly Cell[] = [
  {
    id: 'K-0',
    block: 'K',
    layer: 'protocol',
    run: async ({ driver, stub, waitLog, check }) => {
      stub.push({ kind: 'reply', text: 'k0-first-reply' })
      const first = driver()
      check('registered', (await first.register()) === 'succeeded')
      const session = await first.createSession()
      check('input accepted', (await first.send(session, 'k0 one')) === 'succeeded')
      const ended = await waitLog(session, 'first run terminal', log => log.terminals.length === 1, TURN_MS)
      check('o3 first run completed', ended?.terminals[0] === 'completed', JSON.stringify(ended?.terminals))
      first.close()
      const back = driver(first.account)
      check('logged in again', (await back.login()) === 'succeeded')
      const listed = await back.listSessions()
      check('o1 session listed', listed.sessions.includes(session), JSON.stringify(listed))
      const history = await back.readHistory(session)
      const log = waitLog(session, 'log readable', () => true, 1000)
      const saved = await log
      check('o1 history equals the log', saved !== null && sameHistory(saved, history.entries).ok, saved === null ? 'no log' : sameHistory(saved, history.entries).detail)
      check('o1 reply in history', saved?.assistants[0] === 'k0-first-reply', JSON.stringify(saved?.assistants))
      stub.push({ kind: 'reply', text: 'k0-second-reply' })
      check('o5 next input accepted', (await back.send(session, 'k0 two')) === 'succeeded')
      const second = await waitLog(session, 'second run terminal', log => log.terminals.length === 2, TURN_MS)
      check('o5 second run completed', second?.terminals[1] === 'completed' && runsSettled(second), JSON.stringify(second?.terminals))
      check('o6 two replies, model called twice', second?.assistants.length === 2 && stub.arrivals().length === 2, `${String(second?.assistants.length)} replies, ${String(stub.arrivals().length)} calls`)
    },
  },
]
