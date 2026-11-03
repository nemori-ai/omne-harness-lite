// The child process of the handoff kill case. It opens the CP2 world on the root in argv[2],
// creates the session and starts its Run, prepares the admission of the initial input through
// `agentMessageHandoff` (invoke branch), prints one line with the prepare input and its outcome,
// and then waits to be killed. Run by plain `node`.
import { ok } from './common-journal.ts'
import { invokePrepare, openCp2, seedCp2 } from './line-through-cp2.ts'

const root = process.argv[2]
if (root === undefined) throw new Error('usage: message-handoff-child.ts <root>')
const world = await openCp2(root)
const seeded = await seedCp2(world)
const handoff = await world.handoff()
const input = invokePrepare(seeded)
const outcome = ok(await handoff.prepare(input))
process.stdout.write(`HANDOFF ${JSON.stringify({ input, outcome })}\n`)
setInterval(() => undefined, 1000)
