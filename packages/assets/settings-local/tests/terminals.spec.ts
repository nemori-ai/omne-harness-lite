import { afterEach, expect, it } from 'vitest'
import { createSettingsSqlTerminals, type SettingsSqlOperationBinding } from '../src/index.ts'
import { commandDigest } from '../src/encoding.ts'
import { command, context, openWorld, type World } from './world.ts'
const worlds: World[] = []
async function open(options: Parameters<typeof openWorld>[0] = {}) {
  const world = await openWorld(options)
  worlds.push(world)
  const terminals = createSettingsSqlTerminals({
    storage: world.storage,
    domain: {
      scope: world.combination.scope,
      transactionDomain: world.combination.transactionDomain,
    },
    ...world.combination,
  })
  const binding: SettingsSqlOperationBinding = {
    domain: {
      scope: world.combination.scope,
      transactionDomain: world.combination.transactionDomain,
    },
    principalRef: context.principalRef,
    target: command().target,
    operationId: command().operationId,
    commandDigest: commandDigest(command()),
  }
  return { ...world, terminals, binding }
}
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})

it('seals an unsubmitted operation permanently and reports its public terminal', async () => {
  const w = await open()
  expect(await w.terminals.seal(w.binding)).toMatchObject({
    kind: 'terminal',
    terminal: { state: 'aborted' },
  })
  expect(await w.backend.commit(context, command())).toEqual({
    kind: 'rejected',
    reason: 'basis_changed',
  })
  expect(
    await w.backend.getOperation(context, {
      target: command().target,
      operationId: command().operationId,
    }),
  ).toEqual({ kind: 'rejected', reason: 'basis_changed' })
  expect(
    await w.backend.commit(context, command({ action: { kind: 'set', value: false } })),
  ).toEqual({ kind: 'rejected', reason: 'operation_conflict' })
  expect(w.counts()).toEqual([0, 0, 0])
})
it('a delayed write cannot pass a seal that committed after its pre-read', async () => {
  const reached = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const w = await open({
    wrap: storage => ({
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
  const pending = w.backend.commit(context, command())
  await reached.promise
  expect(await w.terminals.seal(w.binding)).toMatchObject({
    kind: 'terminal',
    terminal: { state: 'aborted' },
  })
  release.resolve()
  expect(await pending).toEqual({ kind: 'rejected', reason: 'basis_changed' })
  expect(w.counts()).toEqual([0, 0, 0])
})
it('seal returns a prior committed operation and survives reopening', async () => {
  const w = await open()
  const original = await w.backend.commit(context, command())
  expect(original.kind).toBe('committed')
  expect(await w.terminals.seal(w.binding)).toMatchObject({
    kind: 'terminal',
    terminal: { state: 'committed' },
  })
  await w.close()
  const reopened = await open({ root: w.root })
  expect(await reopened.terminals.seal(w.binding)).toMatchObject({
    kind: 'terminal',
    terminal: { state: 'committed' },
  })
  expect(await reopened.backend.commit(context, command())).toEqual(original)
  expect(reopened.counts()).toEqual([1, 1, 1])
})
it('a rejected transaction rolls consumption back before the operation is sealed', async () => {
  const w = await open({ mode: 'deny' })
  expect(await w.backend.commit(context, command())).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
  expect(await w.terminals.inspect(w.binding)).toEqual({ kind: 'absent' })
  expect(await w.terminals.seal(w.binding)).toMatchObject({
    kind: 'terminal',
    terminal: { state: 'aborted' },
  })
  expect(
    await w.backend.getOperation(context, {
      target: command().target,
      operationId: command().operationId,
    }),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
  expect(await w.terminals.seal({ ...w.binding, commandDigest: '0'.repeat(64) })).toEqual({
    kind: 'conflict',
  })
  expect(w.counts()).toEqual([0, 0, 0])
})
