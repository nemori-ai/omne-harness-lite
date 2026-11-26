// @module-tag slow
import { statSync } from 'node:fs'
import { request } from 'node:http'
import { dynamisKey, type DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { describe, expect, it } from 'vitest'
import { controlPath } from '../src/control-port.ts'
import { officialLayer } from './support/official-layer.ts'
import { settledSession } from './governance/tenant-settings-support.ts'
import { savedLoginProof, savedTenant } from './r9/support.ts'
import {
  onReleaseTree,
  toolCallsThenText,
  type ReleaseTree,
  type ScriptedToolCall,
} from './support/release-tree.ts'

type Declared = Readonly<{
  function: Readonly<{
    name: string
    parameters?: Readonly<{ properties?: Readonly<Record<string, { enum?: readonly string[] }>> }>
  }>
}>

/** One call for every command of every tool the model was offered; a tool without commands is called once. */
function everyTool(body: string): ScriptedToolCall[] {
  const { tools } = JSON.parse(body) as { tools?: readonly Declared[] }
  return (tools ?? []).flatMap(({ function: tool }, at) => {
    const properties = tool.parameters?.properties ?? {}
    const commands = properties['command']?.enum
    if (commands === undefined) return [{ id: `call-${at}`, tool: tool.name, arguments: '{}' }]
    const wrapped = 'params' in properties
    return commands.map((command, index) => ({
      id: `call-${at}-${index}`,
      tool: tool.name,
      arguments: JSON.stringify(wrapped ? { command, params: {} } : { command }),
    }))
  })
}

function post(tree: ReleaseTree, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: tree.port,
        method: 'POST',
        path,
        headers: {
          host: `127.0.0.1:${tree.port}`,
          'content-type': 'application/json',
          'content-length': '2',
          'omne-message-id': `m-${Math.random()}`,
          authorization: `Bearer ${savedLoginProof(tree.home)}`,
          'omne-acting-tenant': savedTenant(tree.home),
        },
      },
      res => {
        res.resume()
        res.on('end', () => resolve(res.statusCode ?? 0))
      },
    )
    req.on('error', reject)
    req.end('{}')
  })
}

/** Every operation of every protocol the entry serves now, read from the registry, not listed by hand. */
function openOperations(tree: ReleaseTree): string[] {
  const dynamis = tree.scope.root.get(dynamisKey) as DynamisService
  return dynamis
    .registry()
    .placed.filter(placed => placed.point === 'access.protocols')
    .flatMap(placed => {
      const { protocol } = (placed.item as { contribution: { protocol: Protocol } }).contribution
      return Object.keys(protocol.operations).map(
        operation => `/api/${protocol.name}/v${String(protocol.major)}/${operation}`,
      )
    })
}
type Protocol = Readonly<{
  name: string
  major: number
  operations: Readonly<Record<string, unknown>>
}>

describe('发行树：租户与 agent 够不着官方层装着什么（C13、AS-10、HS-58）', () => {
  it('以租户的登录调每一个开放的操作、以 agent 的身份调每一个工具的每一条命令：官方的每一行还是原来那一代', async () => {
    const offered: string[] = []
    const script = toolCallsThenText(body => {
      const calls = everyTool(body)
      offered.push(...calls.map(call => `${call.tool} ${call.arguments}`))
      return calls
    })
    const modes = { permission: 'bypass-permissions', collaboration: 'auto-drive' } as const
    await onReleaseTree({ script, ...modes }, async tree => {
      const before = officialLayer(tree)
      expect(before.size).toBeGreaterThan(100)

      const operations = openOperations(tree)
      const statuses = await Promise.all(operations.map(path => post(tree, path)))
      // The protocol of this deployment that could change the assembly would be mounted like the others: none is.
      expect(operations.filter(path => /assembl|swap|control/iu.test(path))).toEqual([])
      expect(await post(tree, '/api/assembly/v1/swap')).toBe(404)
      const answered = Object.fromEntries(
        [...new Set(statuses)]
          .sort()
          .map(status => [status, statuses.filter(s => s === status).length]),
      )

      await settledSession(tree, 'do everything you can')
      expect(offered.length).toBeGreaterThan(20)
      expect(offered.filter(call => /swap|assembl/iu.test(call))).toEqual([])

      console.log(
        `official layer: ${String(before.size)} rows; ${String(operations.length)} operations called (answers by status ${JSON.stringify(answered)}); ${String(offered.length)} tool commands called`,
      )
      const after = officialLayer(tree)
      expect([...after.keys()]).toEqual([...before.keys()])
      for (const [row, held] of before) {
        expect([row, after.get(row)?.fiber === held.fiber]).toEqual([row, true])
        expect([row, after.get(row)?.state]).toEqual([row, held.state])
      }
      expect(
        tree.records.filter(r => r.kind === 'row-swap' || r.kind === 'row-supervision'),
      ).toEqual([])
      // The one entry that changes the official layer is a file only this user can connect to.
      expect(tree.records.filter(r => r.kind === 'control-port')).toHaveLength(1)
      expect(statSync(controlPath(tree.env.stateRoot)).mode & 0o777).toBe(0o600)
    })
  }, 120_000)
})
