import { afterEach, expect, it } from 'vitest'
import { z } from 'zod'
import { openIdentityWorld } from './identity-world.ts'
const opened: Awaited<ReturnType<typeof openIdentityWorld>>[] = []
async function open(options: Parameters<typeof openIdentityWorld>[0] = {}) {
  const w = await openIdentityWorld(options)
  opened.push(w)
  return w
}
afterEach(async () => {
  for (const w of opened.splice(0)) await w.close()
})
it('revocation first rejects a later Settings command through real Identity standing', async () => {
  const w = await open()
  expect(await w.remove()).toEqual({ kind: 'succeeded' })
  expect(await w.backend.commit(w.principal, w.change)).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
  expect(w.world.counts()).toEqual([0, 0, 0])
})
it('Settings first retains its durable result after later revocation while readback reauthorizes', async () => {
  const w = await open()
  expect(await w.backend.commit(w.principal, w.change)).toMatchObject({
    kind: 'committed',
    revision: 1,
  })
  expect(await w.remove()).toEqual({ kind: 'succeeded' })
  expect(
    await w.backend.getOperation(w.principal, {
      target: w.change.target,
      operationId: w.change.operationId,
    }),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
  expect(await w.terminal.inspect(w.binding)).toMatchObject({
    kind: 'terminal',
    terminal: { state: 'committed' },
  })
  expect(w.world.counts()).toEqual([1, 1, 1])
})
it('revocation seals a held reservation before a delayed Settings SQL request arrives', async () => {
  const reached = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const w = await open({
    wrapSettings: storage => ({
      ...storage,
      async commit(input) {
        if (input.identity.operation === 'settings.change') {
          reached.resolve()
          await release.promise
        }
        return storage.commit(input)
      },
    }),
  })
  const pending = w.backend.commit(w.principal, w.change)
  try {
    await reached.promise
    expect(await w.remove()).toEqual({ kind: 'succeeded' })
    expect(await w.terminal.inspect(w.binding)).toMatchObject({
      kind: 'terminal',
      terminal: { state: 'aborted' },
    })
  } finally {
    release.resolve()
  }
  expect((await pending).kind).toBe('rejected')
  expect(w.world.counts()).toEqual([0, 0, 0])
})
it('an unavailable destination keeps revocation pending and blocks new reservations until recovery', async () => {
  const reached = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const w = await open({
    wrapSettings: storage => ({
      ...storage,
      async commit(input) {
        if (input.identity.operation === 'settings.change') {
          reached.resolve()
          await release.promise
        }
        return storage.commit(input)
      },
    }),
  })
  const pending = w.backend.commit(w.principal, w.change)
  try {
    await reached.promise
    w.setAvailable(false)
    let failed: unknown
    try {
      await w.remove()
    } catch (error) {
      failed = error
    }
    expect(failed).toBeInstanceOf(Error)
    const failure = z.object({ operation: z.object({ operationId: z.string() }) }).parse(failed)
    expect(
      await w.backend.commit(w.principal, { ...w.change, operationId: 'new-operation' }),
    ).toEqual({ kind: 'rejected', reason: 'basis_changed' })
    w.setAvailable(true)
    expect(
      await w.identity.governanceRecovery.resume({
        login: w.loginA.login,
        operation: failure.operation,
      }),
    ).toMatchObject({ kind: 'finished', outcome: { kind: 'succeeded' } })
  } finally {
    w.setAvailable(true)
    release.resolve()
  }
  expect((await pending).kind).toBe('rejected')
  expect(w.world.counts()).toEqual([0, 0, 0])
})
