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

export function faceOf(tree: ReleaseTree): TenantSettings<unknown> {
  const face = tree.scope.get('tenantSettings') as TenantSettings<unknown> | undefined
  if (face === undefined) throw new Error('no tenantSettings on the release tree')
  return face
}

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
  result: string
  started: boolean
  calls: readonly string[]
}>

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
