import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { openStorage } from '@omne-harness-lite/storage-sql'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})
async function storage() {
  const dir = mkdtempSync(join(tmpdir(), 'omne-completion-'))
  const owner = await openStorage({
    dialect: 'sqlite',
    file: join(dir, 'db.sqlite'),
    synchronous: 'full',
  })
  cleanup.push(async () => {
    await owner.close()
    rmSync(dir, { recursive: true, force: true })
  })
  return owner
}
test('completion stays pending until the outer transaction commits; repeat observation has one identity', async () => {
  const db = await storage()
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let ended = false
  let completion:
    ReturnType<import('@omne-harness-lite/storage').StorageUnit['observeCompletion']> | undefined
  const write = db.atomic(async unit => {
    completion = unit.observeCompletion()
    expect(unit.observeCompletion()).toBe(completion)
    void completion.then(() => {
      ended = true
    })
    entered.resolve()
    await release.promise
    expect(ended).toBe(false)
  })
  await entered.promise
  expect(ended).toBe(false)
  release.resolve()
  await write
  expect(await completion).toBe('committed')
})
test.each([new Error('rollback'), false, undefined])(
  'callback rollback is observed without carrying its thrown value: %s',
  async failure => {
    const db = await storage()
    let completion:
      ReturnType<import('@omne-harness-lite/storage').StorageUnit['observeCompletion']> | undefined
    try {
      await db.atomic(async unit => {
        completion = unit.observeCompletion()
        throw failure
      })
      throw new Error('expected rollback')
    } catch (error) {
      expect(error).toBe(failure)
    }
    expect(await completion).toBe('rolledBack')
  },
)
