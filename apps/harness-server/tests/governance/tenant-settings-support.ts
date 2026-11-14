// Support of the tenant-settings scenarios on the release tree (#1265): the face on the tree, a
// model script that calls Shell once per session, and one Shell round with its outcome. No vitest
// import: the demonstration script uses this file too.
import type { TenantSettings } from '@omne-harness/settings'
import {
  historyOf,
  pollUntil,
  toolCalls,
  toolCallsThenText,
  toolResults,
  type ReleaseTree,
} from '../support/release-tree.ts'

export const SHELL = { category: 'tool', name: 'Shell' } as const

/** The `tenantSettings` service of the tree. */
export function faceOf(tree: ReleaseTree): TenantSettings<unknown> {
  const face = tree.scope.get('tenantSettings') as TenantSettings<unknown> | undefined
  if (face === undefined) throw new Error('no tenantSettings on the release tree')
  return face
}

/** A session whose input names `start: echo <label>` calls Shell once to echo `<label>-done`. */
export const shellScript = toolCallsThenText(body => {
  const label = /start: echo ([a-z0-9-]+)/.exec(body)?.[1]
  return label === undefined
    ? []
    : [
        {
          id: `call_${label}`,
          tool: 'Shell',
          arguments: JSON.stringify({
            command: 'execute',
            params: { script: `echo ${label}-done` },
          }),
        },
      ]
})

/**
 * Creates a session and waits until its Run has ended. The first session registers the transaction
 * domain of the tenant; the Governance runtime of the tenant, and so its Settings, opens only after
 * the directory publishes that domain. Before it, `tenantSettings` answers `unavailable`.
 */
export async function settledSession(tree: ReleaseTree, text: string): Promise<string> {
  const session = await tree.startSession(text)
  await pollUntil(
    `the Run of ${text} to end`,
    () => historyOf(tree, session),
    value => value.some(entry => entry.kind === 'run.terminal'),
  )
  return session
}

export type ShellRound = Readonly<{
  session: string
  /** The result text of the tool message of the round. */
  result: string
  /** Whether the Shell command ran: its output is in the result. */
  started: boolean
  /** The phases of the Shell calls of the round that reached the Tool runtime. */
  calls: readonly string[]
}>

/** One session that calls Shell once; answers when its Run has ended. */
export async function shellRound(tree: ReleaseTree, label: string): Promise<ShellRound> {
  const before = new Set(toolCalls(tree.storageRoot).map(row => row.call))
  const session = await tree.startSession(`start: echo ${label}`)
  const entries = await pollUntil(
    `the Run of ${label} to end`,
    () => historyOf(tree, session),
    value => value.some(entry => entry.kind === 'run.terminal'),
  )
  const calls = toolCalls(tree.storageRoot).filter(
    row => !before.has(row.call) && row.tool === 'Shell',
  )
  const result = toolResults(entries).join('\n')
  return {
    session,
    result,
    started: result.includes(`${label}-done`),
    calls: calls.map(row => row.phase),
  }
}
