// The child process of J5. It opens the joint world of wave 2 on the storage directory in argv[2],
// creates the session and lets the Agent run one round, collects every `agentMessageHandoff.prepare`
// the Agent asks for with its answer, prints one line when the Agent has had a reply admitted
// (the execution branch), and then waits to be killed. Run by plain `node`.
import { replyText, openW2World } from './w2-world.ts'

const root = process.argv[2]
if (root === undefined) throw new Error('usage: w2-handoff-child.ts <storage directory>')

const records: { input: unknown; answer: unknown }[] = []
const world = await openW2World({
  root,
  onHandoff: (input, answer) => records.push({ input, answer }),
  model: a => ({ parts: [replyText(`r${a.index}`, 'an answer')], reason: 'stop' }),
})
await world.createSession('j5')
await world.accept('j5-in', 'hello')
await world.until(() =>
  records.some(
    ({ input }) => (input as { kind?: string }).kind === 'execution' && records.length > 1,
  ),
)
process.stdout.write(`HANDOFF ${JSON.stringify(records)}\n`)
setInterval(() => undefined, 1000)
