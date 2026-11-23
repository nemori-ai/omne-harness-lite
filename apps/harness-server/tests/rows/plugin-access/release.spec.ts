import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pluginProtocol } from '@omne-harness/plugin-protocol'
import { createClient } from '@omne-harness/sdk/core'
import { describe, expect, it } from 'vitest'
import { pluginAccessRow } from '../../../src/rows/plugin-access/index.ts'
import { savedTenant } from '../../r9/support.ts'
import { onReleaseTree, toolCallsThenText } from '../../support/release-tree.ts'
import {
  originOf,
  protocolTransport,
  savedCredentials,
  tenantOf,
} from '../../support/protocol-clients.ts'

const MAIN = 'export const page = () => "notes"\n'.repeat(40)
const MANIFEST = JSON.stringify({
  schema: 1,
  name: 'notes',
  summary: 'Notes beside a session',
  client: { members: [{ point: 'page', key: 'notes', module: 'main.js', export: 'page' }] },
})

function devDirectory(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'plugin-release-')))
  mkdirSync(join(root, 'notes'))
  writeFileSync(join(root, 'notes', 'plugin.json'), MANIFEST)
  writeFileSync(join(root, 'notes', 'main.js'), MAIN)
  return root
}

describe('plugin/v1 on the release tree', () => {
  it(
    'lists the plugin of the dev directory to a login, reads its file back byte for byte, and refuses no login',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const root = devDirectory()
      try {
        const options = {
          script: toolCallsThenText(() => []),
          withoutRows: ['plugin-access'],
          addedRows: [
            {
              id: 'plugin-access',
              plugin: 'pluginAccessRow',
              config: { devDirectory: root },
              definition: pluginAccessRow,
            },
          ],
        }
        const exitCode = await onReleaseTree(options, async tree => {
          const origin = originOf(tree.port)
          const client = createClient(
            pluginProtocol,
            protocolTransport(origin, savedCredentials(tree.home)),
          )
          const tenant = tenantOf(savedTenant(tree.home))
          const listed = await client['list-wanted']({ tenant, side: 'client' })
          if (listed.outcome !== 'succeeded') throw new Error(JSON.stringify(listed))
          expect(listed.body.plugins.map(each => [each.name, each.manifest])).toEqual([
            ['notes', MANIFEST],
          ])
          expect(await client['list-wanted']({ tenant, side: 'server' })).toEqual({
            outcome: 'succeeded',
            body: { plugins: [] },
          })
          const [notes] = listed.body.plugins
          const parts: Uint8Array[] = []
          for (let offset: number | null = 0; offset !== null;) {
            const read = await client['read-file']({
              tenant,
              name: 'notes',
              version: notes!.version,
              path: 'main.js',
              offset,
              limit: 500,
            })
            if (read.outcome !== 'succeeded') throw new Error(JSON.stringify(read))
            parts.push(read.body.part)
            offset = read.body.next
          }
          expect(parts.length).toBeGreaterThan(1)
          expect(Buffer.concat(parts).toString()).toBe(MAIN)
          expect(
            await client['read-file']({
              tenant,
              name: 'notes',
              version: notes!.version,
              path: '../notes/main.js',
              offset: 0,
              limit: 10,
            }),
          ).toEqual({ outcome: 'not-found', body: { reason: 'file' } })

          const anonymous = await fetch(`${origin}/api/plugin/v1/list-wanted`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'omne-message-id': 'm-1' },
            body: JSON.stringify({ tenant: savedTenant(tree.home), side: 'client' }),
          })
          expect(anonymous.status).toBe(403)
        })
        expect(exitCode).toBe(0)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
})
