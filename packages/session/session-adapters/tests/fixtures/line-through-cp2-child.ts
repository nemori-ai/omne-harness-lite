// The child process of the CP2 kill case. It opens the CP2 world on the root in argv[2], creates the
// session and starts its Run, opens the execution through the `agentJournal` plugin, commits one
// assistant message, prints one line with the commit request, its answer and the common root after
// it, and then waits to be killed. Run by plain `node`.
import { messageCommit, openCp2, own, seedCp2 } from './line-through-cp2.ts'
import { ok } from './common-journal.ts'

const root = process.argv[2]
if (root === undefined) throw new Error('usage: line-through-cp2-child.ts <root>')
const world = await openCp2(root)
const { execution, open } = await seedCp2(world)
const opened = ok(await world.journal().open(open))
const loaded = ok(await world.journal().load({ ...own, execution }))
const request = messageCommit(execution, opened.authority, loaded)
const receipt = ok(await world.journal().commit(request))
const line = {
  execution,
  request,
  receipt,
  published: await world.published(),
  sessionRevision: await world.sessionRevision(),
}
process.stdout.write(`CP2 ${JSON.stringify(line)}\n`)
setInterval(() => undefined, 1000)
