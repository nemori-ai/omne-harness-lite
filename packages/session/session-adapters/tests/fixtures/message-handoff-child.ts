// The child process of the handoff kill case. It opens the CP2 world on the root in argv[2],
// creates the session and starts its Run, prepares the admission of the initial input through
// `agentMessageHandoff` (invoke branch), prints one line with the prepare input and its outcome,
// and then waits to be killed. Run by plain `node`.
import { readFileSync, writeFileSync } from 'node:fs'
import { decodePreadmissionReply } from '@omne-harness/session-storage-sql/participants'
import { assistantMessage } from '@omne-harness/session-contract/testing'
import { ok } from './common-journal.ts'
import { invokePrepare, openCp2, seedCp2 } from './line-through-cp2.ts'

const root = process.argv[2]
if (root === undefined) throw new Error('usage: message-handoff-child.ts <root>')
const world = await openCp2(root)
const seeded = await seedCp2(world)
const handoff = await world.handoff()
const prepared = invokePrepare(seeded)
if (prepared.kind !== 'invoke' || prepared.request.entry.kind !== 'invoke')
  throw new Error('an invoke input is expected')
const textFile = process.argv[3]
const input =
  textFile === undefined
    ? prepared
    : {
        ...prepared,
        request: {
          ...prepared.request,
          entry: {
            ...prepared.request.entry,
            initial: {
              ...prepared.request.entry.initial,
              content: assistantMessage(readFileSync(textFile, 'utf8')),
            },
          },
        },
      }
if (process.argv[4] === 'intent') {
  const push = world.commits.push.bind(world.commits)
  world.commits.push = (...items) => {
    for (const item of items) {
      if (
        item.participants.length !== 1 ||
        item.participants[0] !== 'execution-record' ||
        item.result.kind !== 'committed'
      )
        continue
      const response = item.result.responses.find(value => value.participant === 'execution-record')
      if (response === undefined) continue
      const reply = decodePreadmissionReply(response.reply)
      if (reply.kind !== 'saved' || reply.record.outcome !== null) continue
      writeFileSync(1, `HANDOFF ${JSON.stringify({ input, outcome: null })}\n`)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
    }
    return push(...items)
  }
}
const outcome = ok(await handoff.prepare(input))
process.stdout.write(`HANDOFF ${JSON.stringify({ input, outcome })}\n`)
setInterval(() => undefined, 1000)
