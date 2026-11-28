// @module-tag slow
// A plugin's tool reaches outside through the web port, on the release tree (C23).
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  toolEntrySourcesKey,
  type ToolEntrySourcesService,
} from '@omne-harness/tool-cordis-contract/cordis'
import { describe, expect, it } from 'vitest'
import { entrySourceScope } from '../../../src/entry/tool-entry-sources.ts'
import { inWorkspace, points, write } from '../../self-extension/support.ts'
import { pollUntil } from '../../support/release-tree.ts'
import { extensions } from '../../support/planned-model.ts'

const MANIFEST = {
  schema: 1,
  name: 'reader',
  summary: 'Reads a page.',
  server: {
    needs: ['web'],
    members: [
      { point: 'tool.entry-sources', key: 'reader__', module: 'tools.js', export: 'tools' },
    ],
  },
}

const TOOLS = `export function tools() {
  return {
    tools: {
      page: {
        summary: 'Reads the page at an address.',
        params: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
        effect: 'read',
        run: async (input, { ports }) => ports.web.fetch({ url: input.url }),
      },
    },
  }
}
`

const page = (url: string) => ({
  tool: 'Tools',
  arguments: {
    command: 'execute',
    params: { name: 'reader__page', command: 'run', arguments: { url } },
  },
})

type Ask = Parameters<Parameters<typeof inWorkspace>[0]>[0]

/** Asks once, then reads on while Tools answers pending, as a model copies the read it names. */
async function settled(ask: Ask, call: ReturnType<typeof page>): Promise<string> {
  let said = await ask([call])
  for (let reads = 0; reads < 20; reads += 1) {
    let next: unknown
    try {
      const read = JSON.parse(said) as { state?: string; next?: unknown }
      next = read.state === 'pending' ? read.next : undefined
    } catch {
      next = undefined
    }
    if (next === undefined) return said
    said = await ask([{ tool: 'Tools', arguments: next as Record<string, unknown> }])
  }
  return said
}

describe("a plugin's tool and the web port, on the release tree", () => {
  it(
    'show lists web with what fetch takes and answers; the tool gets the page through the port, and a refusal carries the reason of Web',
    { tags: ['slow'], timeout: 240_000 },
    async () => {
      const outside = createServer((_request, response) => {
        response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
        response.end('the forecast from the test server')
      })
      await new Promise<void>(resolve => outside.listen(0, '127.0.0.1', resolve))
      const origin = `http://127.0.0.1:${String((outside.address() as AddressInfo).port)}`
      try {
        await inWorkspace(async (ask, tree) => {
          const lent = await ask([points('show', { name: 'plugin.ports' })])
          expect(lent).toContain('web')
          expect(lent).toContain('only GET is sent')

          const published = await ask(
            [
              write('work/reader/plugin.json', JSON.stringify(MANIFEST)),
              write('work/reader/tools.js', TOOLS),
            ],
            [
              extensions('publish', {
                id: 'op-reader',
                category: 'plugin',
                name: 'reader',
                dir: 'work/reader',
              }),
            ],
          )
          expect(published).toContain('done OmneExtensions publish')
          const sources = tree.scope.get(toolEntrySourcesKey) as ToolEntrySourcesService<
            unknown,
            ContentBlock
          >
          const scope = entrySourceScope({ principal: null, tenant: tree.registrar().tenant })
          await pollUntil(
            'the tools of reader to be in service',
            () => Promise.resolve(sources.sources(scope).map(source => source.prefix)),
            prefixes => prefixes.includes('reader__'),
          )

          const read = await settled(ask, page(`${origin}/today`))
          expect(read).toContain('done reader__page')
          expect(read).toContain('the forecast from the test server')
          expect(read).toContain('"outcome":"done"')

          const refused = await settled(ask, page('file:///etc/hosts'))
          expect(refused).toContain('"outcome":"refused","reason":"invalid-url"')
        })
      } finally {
        await new Promise<void>(resolve => outside.close(() => resolve()))
      }
    },
  )
})
