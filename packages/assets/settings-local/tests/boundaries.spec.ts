import { afterEach, expect, it } from 'vitest'
import { command, context, openWorld, secretDefinitionRef, type World } from './world.ts'
const worlds: World[] = []
async function open(options: Parameters<typeof openWorld>[0] = {}) {
  const world = await openWorld(options)
  worlds.push(world)
  return world
}
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})

it('rejects secret writes without retaining plaintext in transaction responses', async () => {
  let recorded: unknown
  const { backend } = await open({
    mode: 'secret',
    wrap: storage => ({
      ...storage,
      async commit(input) {
        const result = await storage.commit(input)
        recorded = result
        return result
      },
    }),
  })
  const secret = 'private-value-must-not-be-in-receipts'
  expect(
    await backend.commit(
      context,
      command({ definitionRef: secretDefinitionRef, action: { kind: 'set', value: secret } }),
    ),
  ).toEqual({ kind: 'rejected', reason: 'unsupported' })
  expect(JSON.stringify(recorded)).not.toContain(secret)
  expect(await backend.readState(context, command().target)).toEqual({ kind: 'absent' })
})

it('keeps a damaged missing-fact operation unsupported without automatically retrying it', async () => {
  const { backend, configure, counts } = await open({ mode: 'missing' })
  expect(await backend.commit(context, command())).toEqual({
    kind: 'rejected',
    reason: 'unsupported',
  })
  await configure('normal')
  expect(await backend.commit(context, command())).toEqual({
    kind: 'rejected',
    reason: 'unsupported',
  })
  expect(await backend.commit(context, command({ action: { kind: 'set', value: false } }))).toEqual(
    { kind: 'rejected', reason: 'unsupported' },
  )
  expect(counts()).toEqual([0, 0, 0])
})

it('replays the same semantic operation and rejects changed payload even after a later revision', async () => {
  const { backend } = await open()
  const original = await backend.commit(context, command())
  await backend.commit(
    context,
    command({ operationId: 'later', expectedRevision: 1, action: { kind: 'set', value: false } }),
  )
  expect(await backend.commit(context, command({ requestId: 'retry' }))).toEqual(original)
  expect(await backend.commit(context, command({ action: { kind: 'set', value: false } }))).toEqual(
    { kind: 'rejected', reason: 'operation_conflict' },
  )
  expect(
    await backend.readChanges(context, { target: command().target, afterRevision: 0, limit: 10 }),
  ).toMatchObject({ changes: [{ revision: 1 }, { revision: 2 }] })
})
it('admits one competing expected revision and preserves the winner', async () => {
  const { backend } = await open()
  const results = await Promise.all([
    backend.commit(context, command()),
    backend.commit(
      context,
      command({ operationId: 'competitor', action: { kind: 'set', value: false } }),
    ),
  ])
  expect(results.filter(result => result.kind === 'committed')).toHaveLength(1)
  expect(results.filter(result => result.kind === 'rejected')).toEqual([
    { kind: 'rejected', reason: 'revision_conflict' },
  ])
  expect(await backend.readState(context, command().target)).toMatchObject({
    kind: 'state',
    state: { revision: 1 },
  })
})
it.each(['deny', 'missing', 'boolean', 'misbound', 'definition', 'no-grants'])(
  'rejects the %s same-transaction guard fixture without durable values',
  async mode => {
    const { backend } = await open({ mode })
    expect(await backend.commit(context, command())).toMatchObject({ kind: 'rejected' })
    expect(await backend.readState(context, command().target)).toEqual({ kind: 'absent' })
    expect(
      await backend.readChanges(context, { target: command().target, afterRevision: 0, limit: 10 }),
    ).toEqual({ kind: 'changes', changes: [], nextRevision: null })
  },
)
it('counts a masked raw change but records a genuine no-op without another change', async () => {
  const { backend } = await open()
  expect(
    await backend.commit(context, command({ action: { kind: 'set', value: false } })),
  ).toMatchObject({ changed: true, revision: 1 })
  expect(
    await backend.commit(
      context,
      command({ operationId: 'masked', expectedRevision: 1, sourceId: 'organization' }),
    ),
  ).toMatchObject({ changed: true, revision: 2 })
  expect(
    await backend.commit(
      context,
      command({ operationId: 'noop', expectedRevision: 2, sourceId: 'organization' }),
    ),
  ).toMatchObject({ changed: false, revision: 2 })
  expect(
    await backend.getOperation(context, { target: command().target, operationId: 'noop' }),
  ).toMatchObject({ kind: 'committed', changed: false, revision: 2 })
  const page = await backend.readChanges(context, {
    target: command().target,
    afterRevision: 0,
    limit: 1,
  })
  expect(page).toMatchObject({ nextRevision: 1, changes: [{ operationId: 'operation-1' }] })
  expect(
    await backend.readChanges(context, { target: command().target, afterRevision: 1, limit: 1 }),
  ).toEqual({
    kind: 'changes',
    changes: [{ revision: 2, operationId: 'masked', itemId: 'enabled', sourceId: 'organization' }],
    nextRevision: null,
  })
})
it('rejects changed source layout and enforces persisted locks at the write boundary', async () => {
  const world = await open()
  expect(
    await world.backend.commit(
      context,
      command({ sourceId: 'organization', action: { kind: 'lock' } }),
    ),
  ).toMatchObject({ kind: 'committed' })
  expect(
    await world.backend.commit(context, command({ operationId: 'blocked', expectedRevision: 1 })),
  ).toEqual({ kind: 'rejected', reason: 'locked' })
  await world.configure('layout')
  expect(
    await world.backend.commit(
      context,
      command({ operationId: 'new-layout', expectedRevision: 1 }),
    ),
  ).toEqual({ kind: 'rejected', reason: 'basis_changed' })
})
it('rechecks access for each storage read and never exposes another operation target', async () => {
  const { backend } = await open()
  await backend.commit(context, command())
  const denied = { ...context, allowed: false }
  expect(await backend.readState(denied, command().target)).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
  expect(
    await backend.getOperation(denied, { target: command().target, operationId: 'operation-1' }),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
  expect(
    await backend.readChanges(denied, { target: command().target, afterRevision: 0, limit: 10 }),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
  expect(
    await backend.getOperation(context, {
      target: { ...command().target, targetRef: 'other' },
      operationId: 'operation-1',
    }),
  ).toEqual({ kind: 'not_found' })
  expect(
    await backend.getOperation(
      { ...context, principalRef: 'bob' },
      { target: command().target, operationId: 'operation-1' },
    ),
  ).toEqual({ kind: 'not_found' })
})
it.each(['scope', 'target'])('rejects a mismatched %s access grant', async mismatch => {
  const { backend } = await open({
    access: {
      async authorize(_caller, request) {
        return {
          kind: 'authorized',
          principalRef: 'alice',
          scope: { kind: 'tenant', tenant: mismatch === 'scope' ? 'tenant-b' : 'tenant-a' },
          target:
            mismatch === 'target' ? { ...request.target, targetRef: 'other' } : request.target,
        }
      },
    },
  })
  expect(await backend.commit(context, command())).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
  expect(await backend.readState(context, command().target)).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
  expect(
    await backend.getOperation(context, { target: command().target, operationId: 'operation-1' }),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
  expect(
    await backend.readChanges(context, { target: command().target, afterRevision: 0, limit: 10 }),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
})
it('rolls state, operation and changes back together when a later transaction participant rejects', async () => {
  const { backend } = await open({
    wrap: storage => ({
      ...storage,
      commit: input =>
        storage.commit({
          ...input,
          commands: [...input.commands, { participant: 'fixture.settings.after', facts: {} }],
        }),
    }),
  })
  expect(await backend.commit(context, command())).toMatchObject({ kind: 'rejected' })
  expect(await backend.readState(context, command().target)).toEqual({ kind: 'absent' })
  expect(
    await backend.readChanges(context, { target: command().target, afterRevision: 0, limit: 10 }),
  ).toEqual({ kind: 'changes', changes: [], nextRevision: null })
  expect(
    await backend.getOperation(context, { target: command().target, operationId: 'operation-1' }),
  ).toMatchObject({ kind: 'rejected' })
})
it('recovers an acknowledged durable operation after response loss', async () => {
  const { backend } = await open({
    wrap: storage => ({
      ...storage,
      async commit(input) {
        await storage.commit(input)
        return { kind: 'unknown', identity: input.identity, diagnostic: null }
      },
    }),
  })
  expect(await backend.commit(context, command())).toEqual({
    kind: 'unknown',
    operationId: 'operation-1',
  })
  expect(
    await backend.getOperation(context, { target: command().target, operationId: 'operation-1' }),
  ).toMatchObject({ kind: 'committed', revision: 1 })
  expect(await backend.commit(context, command())).toMatchObject({ kind: 'committed', revision: 1 })
})
it('drains an accepted call before close settles and rejects admission through old references', async () => {
  let release = () => {}
  let entered = () => {}
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const started = new Promise<void>(resolve => {
    entered = resolve
  })
  const { backend } = await open({
    wrap: storage => ({
      ...storage,
      async query(input) {
        entered()
        await gate
        return storage.query(input)
      },
    }),
  })
  const accepted = backend.commit(context, command())
  await started
  const close = backend.close()
  expect(backend.close()).toBe(close)
  let settled = false
  void close.then(() => {
    settled = true
  })
  await Promise.resolve()
  expect(settled).toBe(false)
  expect(await backend.commit(context, command())).toEqual({ kind: 'rejected', reason: 'closing' })
  release()
  expect(await accepted).toMatchObject({ kind: 'committed' })
  await close
  expect(await backend.readState(context, command().target)).toEqual({
    kind: 'rejected',
    reason: 'closing',
  })
})
