// @module-tag slow
// Why slow: Session faces over the real SQLite provider and its Workers.
import { afterEach, expect, it } from 'vitest'
import { operationId, succeeded } from '@omne-harness/session-contract/testing'
import { harness, type Harness } from './fixtures/harness.ts'
import { sqlBackend } from './fixtures/sql.ts'

const opened: Harness[] = []
afterEach(async () => {
  for (const h of opened.splice(0)) await h.close()
})

it.each([20, 200])(
  'lists %i durable items through the public face and records five local latency samples',
  async count => {
    const h = await harness({ backend: sqlBackend })
    opened.push(h)
    await h.create()
    const work = h.faces('coordinator').work
    const access = h.access()
    for (let n = 0; n < count; n += 1)
      succeeded(
        await work.addTodo({
          ...access,
          operation: operationId(`item-${n}`),
          text: `${n}:${'x'.repeat(512)}`,
        }),
        'add',
      )
    const samples = []
    for (let n = 0; n < 5; n += 1) {
      const start = performance.now()
      const page = succeeded(await work.listTodos({ ...access, after: null, limit: 50 }), 'list')
      samples.push(performance.now() - start)
      expect(page.items).toHaveLength(Math.min(count, 50))
      expect(page.items[0]?.text.startsWith('0:')).toBe(true)
      expect(page.next === null).toBe(count <= 50)
    }
    console.info(
      JSON.stringify({
        sample: 'todo-list-real-sql',
        count,
        listMs: samples,
        failures: 0,
        cache: 'warm provider and Session read cache',
        pageLimit: 50,
      }),
    )
  },
  60_000,
)
