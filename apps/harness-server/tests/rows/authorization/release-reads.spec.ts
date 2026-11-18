// @module-tag slow
// The admission of a batch reads each transaction domain as often for eight actions as for one.
import { expect, it } from 'vitest'
import { onReleaseTree, toolCallsByRequest, type ReleaseTree } from '../../support/release-tree.ts'
import { endedRuns } from './release-flow-support.ts'

// One user message asks for that many Shell calls in one reply.
const many = toolCallsByRequest(body => {
  const messages = (JSON.parse(body) as { messages?: { role: string; content: unknown }[] })
    .messages
  const last = messages?.at(-1)
  const size =
    last?.role === 'user'
      ? /start: many ([0-9]+)/.exec(JSON.stringify(last.content))?.[1]
      : undefined
  return Array.from({ length: Number(size ?? 0) }, (_, index) => ({
    id: `call_${String(size)}_${String(index)}`,
    tool: 'Shell',
    arguments: JSON.stringify({
      command: 'execute',
      intent: 'test call',
      params: { script: `echo many-${String(index)}` },
    }),
  }))
})

type Storage = { read(input: { handler: string }): Promise<unknown> }

// The storage is a trusted service of the tree; a test reads it through the entry environment.
function storageOf(tree: ReleaseTree): Promise<Storage> {
  return new Promise(resolve => {
    tree.env
      .readTrusted('storage')
      .inject(['storage'], ctx => resolve(ctx.get('storage') as unknown as Storage))
  })
}

it(
  'a batch that admission refuses reads the permission rows of the session and of the gate once, for 1, 3 and 8 actions',
  { timeout: 300_000 },
  async () => {
    const reads: Record<string, Record<string, number>> = {}
    // `never` refuses every asking action at admission, so no start adds its own reads.
    const exit = await onReleaseTree({ script: many, permission: 'never' }, async tree => {
      const storage = await storageOf(tree)
      const read = storage.read.bind(storage)
      let counts: Record<string, number> = {}
      Object.assign(storage, {
        read: (input: { handler: string }) => {
          counts[input.handler] = (counts[input.handler] ?? 0) + 1
          return read(input)
        },
      })
      for (const size of [1, 3, 8]) {
        counts = {}
        const session = await tree.startSession(`start: many ${String(size)}`)
        await endedRuns(tree, session, 1)
        reads[String(size)] = counts
      }
    })
    expect(exit).toBe(0)
    console.log('READS', JSON.stringify(reads))
    // The session's permission rows, the gate's layers and the organization's source: once per pass.
    for (const size of ['1', '3', '8'])
      expect(reads[size]?.['session.permission-current'], size).toBe(1)
    for (const handler of ['harness.governance-projection-read', 'settings.source-snapshot-read'])
      expect(reads['8']?.[handler], handler).toBe(reads['3']?.[handler])
  },
)
