// @module-tag slow
import { afterEach, describe, expect, it } from 'vitest'
import { inputId, ordinaryInput } from '@omne-harness/session-contract/testing'
import { ok } from './fixtures/common-journal.ts'
import { sqlScene, takeInputs, type SqlScene } from './fixtures/sql-scene.ts'

const scenes: SqlScene[] = []
afterEach(async () => {
  for (const scene of scenes.splice(0)) await scene.close()
})

// An input identity as long as the ones Session mints, so a list of them weighs what it does in production.
const waitingInput = (at: number, bytes: number) => ({
  ...ordinaryInput(`w${String(at)}`, `waiting ${String(at)} ${'x'.repeat(bytes)}`),
  input: inputId(`${'waiting-input-'.padEnd(60, '0')}${String(at).padStart(4, '0')}`),
})

describe('a Run that starts from every input that waits', () => {
  it.each([
    ['as many inputs as intake lets wait', 64, 100],
    ['inputs that together weigh more than one storage command holds', 12, 120_000],
  ])(
    'opens with its whole batch, takes it in one step and delivers it: %s',
    async (_case, count, bytes) => {
      const waiting = Array.from({ length: count - 1 }, (_, at) => waitingInput(at, bytes))
      const s = await sqlScene(`opening-batch-${String(count)}`, { storage: 'real', waiting })
      scenes.push(s)
      ok(await s.view.journal.open(s.openInput))
      await takeInputs(s, s.view.journal)

      const work = ok(await s.port.readWork(s.sessionAccess))
      const batch = [ordinaryInput('input-1'), ...waiting]
      expect(work.deliveredTail).toEqual(batch.map(input => input.input))
      const view = ok(
        await s.port.history.readModelView({
          ...s.sessionAccess,
          basis: null,
          after: null,
          pageBytes: 4_000_000,
        }),
      )
      if (view.kind !== 'page') throw new Error('a page of the model view is expected')
      expect(view.rows.map(row => row.message)).toEqual(batch.map(input => input.message))
    },
  )
})
