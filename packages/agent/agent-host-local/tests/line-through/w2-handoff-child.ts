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
