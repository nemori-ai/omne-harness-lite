import { expect } from 'vitest'
import { historyOf, pollUntil, type ReleaseTree } from './release-tree.ts'

export async function command(tree: ReleaseTree, args: string[]) {
  const reply = await tree.cli(args)
  expect(reply.status, reply.stderr).toBe(0)
  return (JSON.parse(reply.stdout) as { body: Record<string, string> }).body
}

export async function registered(tree: ReleaseTree, root: string) {
  const { workspace, instance } = await command(tree, ['workspace', 'register', root])
  return ['--workspace', workspace!, '--instance', instance!]
}

export async function sessionIn(tree: ReleaseTree, root: string | string[]) {
  const selected = typeof root === 'string' ? await registered(tree, root) : root
  const { session } = await command(tree, ['create-session', '--definition', 'coding', ...selected])
  return session!
}

export async function run(tree: ReleaseTree, session: string, ordinal = 1) {
  await command(tree, ['send-input', '--session', session, '--text', 'Begin.'])
  return pollUntil(
    'the run ends',
    () => {
      for (const record of tree.records) {
        const text = (record['fields'] as { text?: string } | undefined)?.text
        if (text?.includes('owner=session-log-journal diagnostic=')) throw new Error(text)
      }
      return historyOf(tree, session)
    },
    seen => seen.filter(entry => entry.kind === 'run.terminal').length >= ordinal,
  )
}
