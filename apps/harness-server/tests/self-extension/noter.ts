// A delegated session of a small definition the test publishes, and a person acting on it by the command line.
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  agents,
  cliOk,
  extensions,
  files,
  plan,
  type PlannedCall,
} from '../support/planned-model.ts'
import { history, pollUntil, type ReleaseTree } from '../support/release-tree.ts'
import { write } from './support.ts'

export const definition = (mark: string, tools: readonly string[] = ['Files']) => `---
name: noter
summary: Says back what it is told.
references:
${tools.map(name => `  - { category: tool, name: ${name}, resident: true }`).join('\n')}
---
You say back what you are told. ${mark}
`

export const publish = (id: string) =>
  extensions('publish', { id, category: 'AgentDefinition', name: 'noter', dir: 'work/noter' })
export const replace = (path: string, text: string) =>
  files('write', { path, text, mode: 'replace' })

type Ask = (...steps: readonly (readonly PlannedCall[])[]) => Promise<string>
export type Entry = Awaited<ReturnType<typeof history>>[number]
export const of = (entries: readonly Entry[], kind: string) =>
  entries.filter(item => item.kind === kind)
export const adoptionOf = (item: Entry | undefined) =>
  (item?.payload as { adoption?: { digest?: string } } | undefined)?.adoption?.digest

/** Publishes the noter, delegates to it once and waits for that first run to end. */
export async function noterSession(
  ask: Ask,
  tree: ReleaseTree,
  text = definition('MARK-ONE'),
): Promise<string> {
  await ask([write('work/noter/AGENT.md', text)], [publish('op-1')])
  await ask([agents('dispatch', { mode: 'delegate', agent: 'noter', instruction: plan() })])
  const listed = await pollUntil(
    'the session of the noter to be listed',
    async () => (await cliOk(tree, ['list-sessions', '--definition', 'noter'])).body,
    body => JSON.stringify(body).includes('"definition":"noter"'),
  )
  const child = /"session":"([0-9a-f]{64})"/u.exec(JSON.stringify(listed))?.[1] ?? ''
  await pollUntil(
    'the first run of the noter to end',
    () => history(tree.port, tree.home, child),
    seen => of(seen, 'run.terminal').length >= 1,
  )
  return child
}

export const ownerOf = (tree: ReleaseTree): string => {
  const owner = tenantCodec.encode(tree.registrar().tenant)
  if (!owner.ok) throw new Error('the tenant of the tree has no text')
  return owner.value
}
export const reload = (tree: ReleaseTree, session: string, controlId: string) =>
  tree.cli([
    'reload-session',
    '--session',
    session,
    '--control-id',
    controlId,
    '--tenant',
    ownerOf(tree),
  ])
export const say = (tree: ReleaseTree, session: string, text: string) =>
  cliOk(tree, ['send-input', '--session', session, '--text', text, '--tenant', ownerOf(tree)])

type Sent = Readonly<{ messages?: readonly { role: string; tool_calls?: unknown }[] }>

/** A request with the call of the publish and its result after it: the new version is in force from then on. */
const publishedIn = (body: string, id: string): boolean => {
  if (!body.startsWith('{')) return false
  const messages = (JSON.parse(body) as Sent).messages ?? []
  const at = messages.findIndex(
    message =>
      message.role === 'assistant' && JSON.stringify(message.tool_calls ?? []).includes(id),
  )
  return at >= 0 && messages.slice(at + 1).some(message => message.role === 'tool')
}
export const published = (bodies: readonly string[], id: string) =>
  pollUntil(
    `the publish ${id} to be done`,
    async () => bodies.some(body => publishedIn(body, id)),
    Boolean,
  )
