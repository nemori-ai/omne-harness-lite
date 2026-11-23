import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'vitest'
import { cliOk, files, planner, plannedModel, type PlannedCall } from '../support/planned-model.ts'
import { onReleaseTree, type ReleaseTree } from '../support/release-tree.ts'

export const points = (name: string, params: Record<string, unknown>): PlannedCall => ({
  tool: 'OmneExtensionPoints',
  arguments: { command: name, params },
})
export const write = (path: string, text: string): PlannedCall =>
  files('write', { path, text, mode: 'create', parents: true })

export type Ask = (...steps: readonly (readonly PlannedCall[])[]) => Promise<string>

/** One coding session in a fresh workspace on the release tree; `ask` sends it one plan and gives the tool results. */
export async function inWorkspace(
  body: (ask: Ask, tree: ReleaseTree, project: string) => Promise<void>,
): Promise<void> {
  const project = realpathSync(mkdtempSync(join(tmpdir(), 'self-extension-')))
  const exitCode = await onReleaseTree(
    { script: plannedModel, permission: 'bypass-permissions' },
    async tree => {
      const { workspace, instance } = (await cliOk(tree, ['workspace', 'register', project])).body
      const at = ['--workspace', String(workspace), '--instance', String(instance)]
      const created = await cliOk(tree, ['create-session', '--definition', 'coding', ...at])
      const session = String(created.body['session'])
      const send = planner(tree)
      await body((...steps) => send(session, ...steps), tree, project)
    },
  )
  expect(exitCode).toBe(0)
}
