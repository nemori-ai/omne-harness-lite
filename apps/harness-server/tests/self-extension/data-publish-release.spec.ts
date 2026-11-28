// @module-tag slow
// Starts the release tree: an agent publishes an asset of a category made from a body, through the real publishing.
import { mcpCategoryDisplay } from '@omne-harness/mcp-contract'
import { describe, expect, it } from 'vitest'
import { extensions } from '../support/planned-model.ts'
import { inWorkspace } from './support.ts'

const ENDPOINT = { name: 'deepwiki', transport: 'streamable-http', auth: 'none' }

describe('an agent publishes an asset made from a body, on the release tree', () => {
  it(
    'holds the MCP endpoint it published as data, lists it, and a second publish of the same body changes nothing',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      await inWorkspace(async ask => {
        const made = await ask([
          extensions('publish', { id: 'op-1', category: 'mcp', name: 'deepwiki', data: ENDPOINT }),
        ])
        expect(made).toContain('done OmneExtensions publish')
        expect(made).not.toContain('body-not-read')
        const listed = await ask([extensions('list', { category: 'mcp' })])
        expect(listed).toContain('deepwiki')
        const again = await ask([
          extensions('publish', { id: 'op-2', category: 'mcp', name: 'deepwiki', data: ENDPOINT }),
        ])
        expect(again).toContain('done OmneExtensions publish')
        expect(again).toContain('"changed":false')
      })
    },
  )

  it(
    'help for publishing an MCP endpoint prints how it is made and every line of how to write one',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      await inWorkspace(async ask => {
        const help = await ask([extensions('help', { name: 'publish', category: 'mcp' })])
        expect(help).toContain(`category mcp: from a body. ${String(mcpCategoryDisplay.creation)}`)
        for (const line of String(mcpCategoryDisplay.authoring).split('\n'))
          expect(help).toContain(line)
      })
    },
  )

  it(
    'the agent gives an endpoint its address, and is refused when it would write the key',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      await inWorkspace(async ask => {
        const data = { name: 'keyed', transport: 'streamable-http', auth: 'static' }
        expect(
          await ask([extensions('publish', { id: 'k-1', category: 'mcp', name: 'keyed', data })]),
        ).toContain('done OmneExtensions publish')
        const target = {
          id: 'k-2',
          category: 'mcp',
          name: 'keyed',
          item: 'target',
          value: 'https://keyed.example/mcp',
        }
        expect(await ask([extensions('configure', target)])).toContain(
          'done OmneExtensions configure',
        )
        const key = {
          id: 'k-3',
          category: 'mcp',
          name: 'keyed',
          item: 'credential',
          value: 'sk-never-written',
        }
        const refused = await ask([extensions('configure', key)])
        expect(refused).toContain(
          'credential is a secret. Its value is not written through this tool',
        )
        const settings = await ask([extensions('settings', { category: 'mcp', name: 'keyed' })])
        expect(settings).toMatch(/credential\s+secret\s+not set/u)
        expect(settings).not.toContain('sk-never-written')
      })
    },
  )
})
