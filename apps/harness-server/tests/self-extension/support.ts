import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'vitest'
import { cliOk, files, planner, plannedModel, type PlannedCall } from '../support/planned-model.ts'
import type { GatewayScript } from '../fixtures/model-gateway.ts'
import { runOmne } from '../r9/support.ts'
import {
  onReleaseTree,
  type ReleaseTree,
  type ReleaseTreeOptions,
} from '../support/release-tree.ts'

export const points = (name: string, params: Record<string, unknown>): PlannedCall => ({
  tool: 'OmneExtensionPoints',
  arguments: { command: name, params },
})
export const write = (path: string, text: string): PlannedCall =>
  files('write', { path, text, mode: 'create', parents: true })

/** A second account with its own tenant on the same server: its commands run with a home of their own. */
export async function otherTenant(tree: ReleaseTree, name = 'frank') {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'self-extension-home-')))
  const cli = (args: readonly string[], credential?: string) =>
    runOmne({
      args: [...args],
      home,
      server: `http://127.0.0.1:${String(tree.port)}`,
      cwd: home,
      ...(credential === undefined ? {} : { credential }),
    })
  const credential = `${name}-pw-self-extension-4c1d`
  expect((await cli(['register', '--login-identifier', name], credential)).status).toBe(0)
  expect((await cli(['login', '--login-identifier', name], credential)).status).toBe(0)
  return { cli, home }
}

/** The system text of each request the scripted model was sent, in order. */
export function recordingModel(): Readonly<{
  script: GatewayScript
  systems: string[]
  bodies: string[]
}> {
  const systems: string[] = []
  const bodies: string[] = []
  return {
    systems,
    bodies,
    script: input => {
      bodies.push(input.body)
      const { messages } = JSON.parse(input.body) as {
        messages: readonly { role: string; content: unknown }[]
      }
      systems.push(
        messages
          .filter(message => message.role === 'system')
          .map(message => JSON.stringify(message.content))
          .join('\n'),
      )
      return plannedModel(input)
    },
  }
}

export type Ask = (...steps: readonly (readonly PlannedCall[])[]) => Promise<string>

/** One coding session in a fresh workspace on the release tree; `ask` sends it one plan and gives the tool results. */
export async function inWorkspace(
  body: (ask: Ask, tree: ReleaseTree, project: string) => Promise<void>,
  options: Partial<ReleaseTreeOptions> = {},
): Promise<void> {
  const project = realpathSync(mkdtempSync(join(tmpdir(), 'self-extension-')))
  const exitCode = await onReleaseTree(
    { script: plannedModel, permission: 'bypass-permissions', ...options },
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
