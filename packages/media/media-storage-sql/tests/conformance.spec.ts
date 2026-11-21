// @module-tag slow
// Opens a real SQLite storage with its worker threads for every case.
import { afterEach, describe, expect, it } from 'vitest'
import { mediaIndexConformanceCases } from '@omne-harness/media-contract/testing'
import { openSqlWorld, type SqlWorld } from './world.ts'

describe('the SQL index conforms to the index contract', () => {
  const open: SqlWorld[] = []
  afterEach(async () => {
    await Promise.all(open.splice(0).map(world => world.close()))
  })

  it.each(mediaIndexConformanceCases)('$name', async conformance => {
    const run = conformance.run(async () => {
      const world = await openSqlWorld()
      open.push(world)
      return world.index
    })
    await expect(run).resolves.toBeUndefined()
  })
})
