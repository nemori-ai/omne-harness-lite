import { afterEach, expect, it, vi } from 'vitest'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import { administrator, boot, request, scope, tenant } from './support.ts'
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const close of cleanup.splice(0).reverse()) await close()
})
it.each([false, true])(
  'log and real governance mutation share commit and rollback: rollback=%s',
  async rollback => {
    const h = await boot()
    cleanup.push(h.close)
    const action = h.storage.atomic(async unit => {
      expect(await h.log.participant.appendIn(unit, h.access, request())).toHaveProperty(
        'kind',
        'staged',
      )
      expect(await h.governance.memberships.participate(unit).remove(administrator, tenant)).toBe(
        'ok',
      )
      if (rollback) throw Error('rollback both owners')
    })
    if (rollback) await expect(action).rejects.toThrow('rollback both owners')
    else await action
    const prefix = await h.log.readSince(scope.session, 0)
    expect(prefix).toHaveProperty('entries.length', rollback ? 0 : 1)
    expect(await h.governance.memberships.standing(tenant)).toEqual(
      rollback ? { standing: 'effective', role: 'member' } : { standing: 'ineffective' },
    )
  },
)
it('lost local acknowledgment is recognized by the original complete batch without another append', async () => {
  const h = await boot()
  cleanup.push(h.close)
  const write = h.storage.write.bind(h.storage)
  const lost = vi.spyOn(h.storage, 'write').mockImplementation(async callback => {
    await write(callback)
    throw new StorageUnavailable('lost local acknowledgment after commit')
  })
  const r = request()
  expect(await h.log.append(r.session, r.entries, r.fence, r.condition)).toEqual({
    positions: [1],
    tail: 1,
  })
  lost.mockRestore()
  expect(await h.log.readSince(scope.session, 0)).toHaveProperty('entries.length', 1)
})
it('a participating unknown retains dependencies until the original commit can be positively recognized', async () => {
  const h = await boot()
  cleanup.push(h.close)
  const write = h.storage.write.bind(h.storage),
    read = h.storage.read.bind(h.storage)
  const lost = vi.spyOn(h.storage, 'write').mockImplementation(async callback => {
    await write(callback)
    throw new StorageUnavailable('lost local acknowledgment')
  })
  await expect(
    h.storage.atomic(unit => h.log.participant.appendIn(unit, h.access, request())),
  ).rejects.toBeInstanceOf(StorageUnavailable)
  lost.mockRestore()
  const hidden = vi
    .spyOn(h.storage, 'read')
    .mockRejectedValue(new StorageUnavailable('recognition temporarily unavailable'))
  await expect(h.log.close()).rejects.toBeInstanceOf(StorageUnavailable)
  hidden.mockImplementation(read)
  await expect(h.log.close()).resolves.toBeUndefined()
  hidden.mockRestore()
})
