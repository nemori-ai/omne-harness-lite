import { afterEach, expect, it } from 'vitest'
import { z } from 'zod'
import { openSourceWorld, sourceRequest, sourceSnapshot } from './source-retention-world.ts'
const worlds: Awaited<ReturnType<typeof openSourceWorld>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
it('bounds recovery metadata bytes without skipping long valid request identities', async () => {
  const world = await openSourceWorld()
  worlds.push(world)
  for (let batch = 0; batch < 10; batch++) {
    const result = await world.write(
      Array.from({ length: 10 }, (_, index) => ({
        kind: 'reserve' as const,
        request: {
          ...sourceRequest(`long-${batch * 10 + index}`),
          destination: {
            ...sourceRequest(`long-${batch * 10 + index}`).destination,
            route: '界'.repeat(4096),
          },
        },
        snapshot: sourceSnapshot(),
      })),
    )
    expect(result.kind).toBe('committed')
  }
  const schema = z.object({
    items: z.array(z.object({ reservationId: z.string(), request: z.unknown() })),
    after: z.string().nullable(),
  })
  const ids = new Set<string>()
  let after: string | null = null
  let pages = 0
  do {
    const result = await world.read({ kind: 'holds', page: { after, limit: 100 } })
    if (result.kind !== 'read') throw new Error(JSON.stringify(result))
    const page = schema.parse(result.output)
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(1024 * 1024 + 512)
    if (pages === 0) expect(page.items.length).toBeLessThan(100)
    for (const item of page.items) {
      expect(ids.has(item.reservationId)).toBe(false)
      ids.add(item.reservationId)
    }
    after = page.after
    expect(++pages).toBeLessThan(5)
  } while (after !== null)
  expect(ids.size).toBe(100)
})
