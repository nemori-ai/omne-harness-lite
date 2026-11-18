// @module-tag slow
// Opens a real SQLite storage with its worker threads for every case.
import { afterEach, describe, expect, it } from 'vitest'
import { storeConformanceCases } from '@omne-harness/notification/testing'
import { openSqlWorld, type SqlWorld } from './world.ts'

describe('the SQL store conforms to the repository contract', () => {
  const open: SqlWorld[] = []
  afterEach(async () => {
    await Promise.all(open.splice(0).map(world => world.close()))
  })

  it.each(storeConformanceCases)('$name', async conformance => {
    const run = conformance.run(async () => {
      const world = await openSqlWorld()
      open.push(world)
      return world.store
    })
    await expect(run).resolves.toBeUndefined()
  })
})
