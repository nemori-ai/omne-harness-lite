// @module-tag slow
// Starts the release tree: a category and its point that arrive while it runs are told to the tenant once.
import { request } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { heldPoint } from '@omne-harness/assets'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import { describe, expect, it } from 'vitest'
import { savedLoginProof, savedTenant } from '../../r9/support.ts'
import { until } from '../../support/listening.ts'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from '../../support/release-tree.ts'

function call(tree: ReleaseTree, path: string, body: unknown) {
  const text = JSON.stringify(body)
  return new Promise<{ status: number; json: any }>((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: tree.port,
        method: 'POST',
        path,
        headers: {
          host: `127.0.0.1:${tree.port}`,
          authorization: `Bearer ${savedLoginProof(tree.home)}`,
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(text)),
          'omne-message-id': `m-${Math.random()}`,
        },
      },
      res => {
        let reply = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => (reply += chunk))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, json: JSON.parse(reply) }))
      },
    )
    req.on('error', reject)
    req.end(text)
  })
}

/** A category that comes while the tree runs, with its point. */
const noteCategory = {
  name: 'late-notes',
  inject: [assetCategoriesKey],
  apply(ctx: Context) {
    ctx[assetCategoriesKey].contribute(
      {
        display: { title: 'Note', summary: 'A note that came later.' },
        contract: {
          category: 'note',
          schema: { kind: 'null' },
          judge: () => ({ ok: true }),
          deriveDeclarations: () => ({ entries: [] }),
          references: () => [],
        },
      },
      heldPoint({ name: 'note.notes', key: 'the name of a note', summary: 'The notes held.' }),
    )
  },
}

describe('what arrives on the extension tree, on the release tree', () => {
  it(
    'a category and its point that arrive after the start are told to the tenant once each, as the extensions themselves; arriving again is recalled, not told twice',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      const exitCode = await onReleaseTree({ script: toolCallsThenText(() => []) }, async tree => {
        await tree.startSession('hello')
        const tenant = savedTenant(tree.home)
        const arrivals = async () => {
          const read = await call(tree, '/api/notification/v2/list-inbox', {
            tenant,
            recipient: { kind: 'person' },
            filter: 'all',
            after: null,
            limit: 50,
          })
          const items: any[] = read.json.body?.entries ?? []
          return items
            .filter(item => JSON.stringify(item).includes('extensions.changes'))
            .map(item => JSON.stringify(item))
        }
        expect(await arrivals()).toEqual([])

        const late = tree.scope.plugin(noteCategory)
        await late.await()
        await until(
          async () => (await arrivals()).length >= 2,
          'the two arrivals to be told',
          20_000,
        )
        const told = await arrivals()
        expect(told).toHaveLength(2)
        expect(told.some(item => item.includes('category-added') && item.includes('note'))).toBe(
          true,
        )
        expect(told.some(item => item.includes('point-added') && item.includes('note.notes'))).toBe(
          true,
        )

        await late.dispose()
        const again = tree.scope.plugin(noteCategory)
        await again.await()
        await new Promise(resolve => setTimeout(resolve, 1500))
        expect(await arrivals()).toHaveLength(2)
        await again.dispose()
      })
      expect(exitCode).toBe(0)
    },
  )
})
