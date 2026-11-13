import { TURN_MS, signedIn, type Cell } from './cell.ts'
import { chatAgain, historyMatches } from './cells-g.ts'

const INSTANCE_IDLE_MS = 60_000
const NO_ROW_RELOAD =
  'no entry point unloads and reloads one row of a running server; ways b and c cannot be triggered (record 5)'

export const rCells: readonly Cell[] = [
  {
    id: 'R-0',
    block: 'R',
    layer: 'protocol',
    run: async tools => {
      const client = await signedIn(tools)
      const session = await client.createSession()
      tools.stub.push({ kind: 'reply', text: 'r0-reply' })
      await client.send(session, 'r0 hello')
      await tools.waitLog(session, 'first run terminal', log => log.terminals.length === 1, TURN_MS)
      const mark = tools.env.mark()
      await tools.sleep(INSTANCE_IDLE_MS + 10_000)
      const reclaimed = tools.env.output().includes('reclaimed after')
      tools.note(
        `instance reclaimed while idle: ${String(reclaimed)}, ${String(tools.env.records().length - mark)} records`,
      )
      tools.check('way a: the idle Agent instance was reclaimed', reclaimed)
      await chatAgain(tools, client, session)
      await historyMatches(tools, client, session)
    },
  },
  { id: 'R-1/t2', block: 'R', layer: 'protocol', untestable: NO_ROW_RELOAD },
  { id: 'R-1/t1', block: 'R', layer: 'protocol', untestable: NO_ROW_RELOAD },
  { id: 'R-2/t2', block: 'R', layer: 'protocol', untestable: NO_ROW_RELOAD },
  { id: 'R-2/t1', block: 'R', layer: 'protocol', untestable: NO_ROW_RELOAD },
]
