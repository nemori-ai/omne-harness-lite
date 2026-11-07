import { afterEach, expect, it, vi } from 'vitest'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { access } from '@omne-harness/legal-identity'
import { openRegistrarWorld } from './registrar-world.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close()
})
async function setup() {
  const world = await openRegistrarWorld()
  cleanups.push(world.close)
  return world
}

it('registers and withdraws through real admission, Standing and production SQL', async () => {
  const w = await setup()
  const { registrar, sql } = w.services()
  const first = await registrar.contribute(w.context, w.command('one'))
  expect(first).toMatchObject({ kind: 'registered', state: 'active' })
  if (first.kind !== 'registered') throw new Error(JSON.stringify(first))
  expect(await sql.observe(w.binding('one'))).toMatchObject({
    kind: 'found',
    record: {
      state: 'committed',
      execution: {
        authority: { protocol: 'governance-admission/1', principalRef: w.principalRef },
      },
    },
    standing: { kind: 'settled', outcome: 'committed' },
  })
  w.setSourceAvailable(false)
  const release = await registrar.withdraw(w.context, {
    operationId: 'release',
    contribution: first.contribution,
  })
  expect(release).toMatchObject({ kind: 'released', contribution: first.contribution })
  expect(
    await registrar.withdraw(w.context, {
      operationId: 'release',
      contribution: first.contribution,
    }),
  ).toEqual(release)
  expect(await registrar.contribute(w.context, w.command('one'))).toEqual({
    ...first,
    state: 'released',
  })
  expect(await sql.observe(w.binding('one'))).toMatchObject({
    record: { result: { state: 'active' } },
  })
  expect(w.sourceReads).toBe(1)
})

it('does not accept an operation when the original declaration cannot be verified', async () => {
  const w = await setup()
  const { registrar, sql } = w.services()
  w.setSourceAvailable(false)
  expect(await registrar.contribute(w.context, w.command('offline'))).toMatchObject({
    kind: 'unavailable',
  })
  expect(await sql.observe(w.binding('offline'))).toEqual({ kind: 'absent' })
  w.setSourceAvailable(true)
  const changed = w.command('changed')
  changed.declaration.reference.digest = 'b'.repeat(64)
  expect(await registrar.contribute(w.context, changed)).toEqual({
    kind: 'conflict',
    reason: 'definition',
  })
  expect(await sql.observe(w.binding('changed'))).toEqual({ kind: 'absent' })
})

it('recognizes simultaneous retries once and rejects a different command under the same key', async () => {
  const w = await setup()
  const { registrar } = w.services()
  const responses = await Promise.all([
    registrar.contribute(w.context, w.command('one')),
    registrar.contribute(w.context, w.command('one')),
  ])
  expect(responses[0]).toMatchObject({ kind: 'registered' })
  expect(responses[1]).toEqual(responses[0])
  const changed = w.command('one')
  changed.generation = 'different'
  expect(await registrar.contribute(w.context, changed)).toEqual({
    kind: 'conflict',
    reason: 'operation',
  })
})

it.each(['unavailable', 'different'] as const)(
  'preserves an original-operation conflict when the late source is %s',
  async sourceResult => {
    const w = await setup()
    const started = Promise.withResolvers<void>(),
      proceed = Promise.withResolvers<void>()
    const loser = w.services({
      source: {
        async resolve() {
          started.resolve()
          await proceed.promise
          if (sourceResult === 'unavailable') return { kind: 'unavailable' }
          const declaration = w.command('one').declaration
          declaration.reference.digest = 'b'.repeat(64)
          return { kind: 'definition', declaration }
        },
      },
    })
    const pending = loser.registrar.contribute(w.context, w.command('one'))
    await started.promise
    const competing = w.command('one')
    competing.generation = 'other-generation'
    const winner = await w.services().registrar.contribute(w.context, competing)
    proceed.resolve()
    expect(await pending).toEqual({ kind: 'conflict', reason: 'operation' })
    expect(winner).toMatchObject({
      kind: 'registered',
      contribution: { generation: 'other-generation' },
    })
  },
)

it('preserves unknown when a late source failure cannot observe a concurrent commit', async () => {
  const w = await setup()
  const storage = w.activation.storage
  const started = Promise.withResolvers<void>(),
    proceed = Promise.withResolvers<void>()
  let blind = false
  const waiting = w.services({
    storage: {
      ...storage,
      async read(request) {
        if (blind && request.handler === 'governance.operation')
          throw new Error('original-operation observation offline')
        return storage.read(request)
      },
    },
    source: {
      async resolve() {
        started.resolve()
        await proceed.promise
        return { kind: 'unavailable' }
      },
    },
  })
  const pending = waiting.registrar.contribute(w.context, w.command('one'))
  await started.promise
  const winner = await w.services().registrar.contribute(w.context, w.command('one'))
  blind = true
  proceed.resolve()
  expect(await pending).toEqual({ kind: 'unknown', operation: w.binding('one').ref })
  expect(winner).toMatchObject({ kind: 'registered' })
  expect(await w.services().sql.observe(w.binding('one'))).toMatchObject({
    record: { state: 'committed' },
  })
})

it.each(['accepted', 'submitted'] as const)(
  'preserves unknown when a late source failure observes a concurrent %s operation',
  async phase => {
    const w = await setup()
    const sourceStarted = Promise.withResolvers<void>(),
      sourceProceed = Promise.withResolvers<void>(),
      writeStarted = Promise.withResolvers<void>(),
      writeProceed = Promise.withResolvers<void>()
    const waiting = w.services({
      source: {
        async resolve() {
          sourceStarted.resolve()
          await sourceProceed.promise
          return { kind: 'unavailable' }
        },
      },
    })
    const storage = w.activation.storage
    const writing = w.services({
      storage: {
        ...storage,
        async commit(envelope) {
          const result = await storage.commit(envelope)
          const stage = phase === 'accepted' ? 'accept' : 'submit'
          if (envelope.identity.operation === 'governance.meta.' + stage) {
            writeStarted.resolve()
            await writeProceed.promise
          }
          return result
        },
      },
    })
    const pending = waiting.registrar.contribute(w.context, w.command('one'))
    await sourceStarted.promise
    const winner = writing.registrar.contribute(w.context, w.command('one'))
    await writeStarted.promise
    const observation = await waiting.sql.observe(w.binding('one'))
    sourceProceed.resolve()
    const reply = await pending
    writeProceed.resolve()
    const committed = await winner
    expect(observation).toMatchObject({ kind: 'found', record: { state: phase } })
    expect(reply).toEqual({ kind: 'unknown', operation: w.binding('one').ref })
    expect(committed).toMatchObject({ kind: 'registered' })
  },
)

it('keeps sibling leases independent and rejects a stale exact reference', async () => {
  const w = await setup()
  const { registrar, sql } = w.services()
  const first = await registrar.contribute(w.context, w.command('one'))
  const second = await registrar.contribute(w.context, w.command('two'))
  if (first.kind !== 'registered' || second.kind !== 'registered')
    throw new Error('fixture registrations')
  expect(first.contribution.registrationId).not.toBe(second.contribution.registrationId)
  expect(
    await registrar.withdraw(w.context, {
      operationId: 'wrong',
      contribution: { ...first.contribution, generation: 'wrong' },
    }),
  ).toEqual({ kind: 'denied' })
  expect(
    await registrar.withdraw(w.context, {
      operationId: 'release',
      contribution: first.contribution,
    }),
  ).toMatchObject({ kind: 'released' })
  expect(await sql.contribution(first.contribution, w.principalRef)).toMatchObject({
    state: 'released',
  })
  expect(await sql.contribution(second.contribution, w.principalRef)).toMatchObject({
    state: 'active',
  })
  expect(await sql.contribution(second.contribution, 'someone-else')).toEqual({ kind: 'denied' })
  expect(
    await sql.contribution({ ...second.contribution, registrationId: 'missing' }, w.principalRef),
  ).toEqual({ kind: 'denied' })
})

it('reauthorizes original-result disclosure after real membership revocation', async () => {
  const w = await setup()
  const { registrar, sql } = w.services()
  expect(await registrar.contribute(w.context, w.command('one'))).toMatchObject({
    kind: 'registered',
  })
  expect(await w.remove()).toMatchObject({ kind: 'succeeded' })
  expect(await registrar.contribute(w.context, w.command('one'))).toEqual({ kind: 'denied' })
  expect(await sql.observe(w.binding('one'))).toMatchObject({ record: { state: 'committed' } })
})

it('retains original success across Worker reopen and projects old epochs as released', async () => {
  const w = await setup()
  const first = await w.services().registrar.contribute(w.context, w.command('one'))
  expect(first).toMatchObject({ kind: 'registered', state: 'active' })
  await w.reopen()
  w.setSourceAvailable(false)
  expect(await w.services().registrar.contribute(w.context, w.command('one'))).toEqual(first)
  expect(
    await w.activation.control({
      kind: 'bootstrap',
      input: { scope: w.scope, epoch: 'second', previousEpoch: 'first' },
    }),
  ).toMatchObject({ kind: 'opened' })
  const current = w.services({ epoch: 'second' })
  expect(await current.registrar.contribute(w.context, w.command('one'))).toEqual({
    ...first,
    state: 'released',
  })
  expect(await current.sql.observe(w.binding('one'))).toMatchObject({
    record: { result: { state: 'active' } },
  })
})

it('uses a saved submit recipe despite an offline source and changed current combination', async () => {
  const w = await setup()
  const storage = w.activation.storage
  let block = true
  const wrapped: SqlStorage = {
    ...storage,
    commit: async envelope =>
      block && envelope.identity.operation === 'governance.meta.submit'
        ? { kind: 'unknown', identity: envelope.identity, diagnostic: null }
        : storage.commit(envelope),
  }
  const initial = w.services({ storage: wrapped })
  expect(await initial.registrar.contribute(w.context, w.command('one'))).toMatchObject({
    kind: 'unknown',
  })
  expect(await initial.sql.readStage(w.binding('one'), 'submit')).toMatchObject({ kind: 'stored' })
  expect(await initial.sql.observe(w.binding('one'))).toMatchObject({
    record: { state: 'accepted', execution: null },
    standing: { kind: 'held' },
  })
  block = false
  w.setSourceAvailable(false)
  const resumed = w.services({
    storage: wrapped,
    mutation: { combinationVersion: 'different-current/2', manifestDigest: '0'.repeat(64) },
  })
  expect(await resumed.registrar.contribute(w.context, w.command('one'))).toMatchObject({
    kind: 'registered',
  })
  expect(w.sourceReads).toBe(1)
})

it('recognizes a committed operation after losing both apply reply and immediate observation', async () => {
  const w = await setup()
  const storage = w.activation.storage
  let blind = false
  const wrapped: SqlStorage = {
    ...storage,
    async commit(envelope) {
      const result = await storage.commit(envelope)
      if (envelope.identity.operation === 'governance.apply.contribute') {
        blind = true
        throw new Error('lost committed reply')
      }
      return result
    },
    async read(request) {
      if (blind && request.handler === 'governance.operation')
        throw new Error('observation offline')
      return storage.read(request)
    },
  }
  const first = w.services({ storage: wrapped })
  expect(await first.registrar.contribute(w.context, w.command('one'))).toMatchObject({
    kind: 'unknown',
  })
  expect(await w.services().sql.observe(w.binding('one'))).toMatchObject({
    record: { state: 'committed' },
  })
  blind = false
  w.setSourceAvailable(false)
  expect(await first.registrar.contribute(w.context, w.command('one'))).toMatchObject({
    kind: 'registered',
  })
  expect(w.sourceReads).toBe(1)
})

it('stops before acceptance while a declaration source is pending and does not close shared storage', async () => {
  const w = await setup()
  const started = Promise.withResolvers<void>(),
    proceed = Promise.withResolvers<void>()
  const service = w.services({
    source: {
      async resolve() {
        started.resolve()
        await proceed.promise
        return { kind: 'definition', declaration: w.command('one').declaration }
      },
    },
  })
  const pending = service.registrar.contribute(w.context, w.command('one'))
  await started.promise
  service.registrar.stopAccepting()
  proceed.resolve()
  expect(await pending).toEqual({ kind: 'unavailable', owner: 'governance-provider' })
  expect(await service.sql.observe(w.binding('one'))).toEqual({ kind: 'absent' })
  expect(await service.registrar.contribute(w.context, w.command('two'))).toEqual({
    kind: 'unavailable',
    owner: 'governance-provider',
  })
  expect(await w.services().registrar.contribute(w.context, w.command('two'))).toMatchObject({
    kind: 'registered',
  })
})

it('seals an accepted operation if ingress stops while acceptance is in flight', async () => {
  const w = await setup()
  const storage = w.activation.storage
  let stop: () => void = () => {
    throw new Error('fixture not installed')
  }
  const wrapped: SqlStorage = {
    ...storage,
    async commit(envelope) {
      const result = await storage.commit(envelope)
      if (envelope.identity.operation === 'governance.meta.accept') stop()
      return result
    },
  }
  const service = w.services({ storage: wrapped })
  stop = () => service.registrar.stopAccepting()
  expect(await service.registrar.contribute(w.context, w.command('one'))).toEqual({
    kind: 'conflict',
    reason: 'basis',
  })
  expect(await service.sql.observe(w.binding('one'))).toMatchObject({
    record: { state: 'aborted', execution: null },
    standing: null,
  })
})

it('rejects a membership revoked during source verification and leaves recoverable custody', async () => {
  const w = await setup()
  const started = Promise.withResolvers<void>(),
    proceed = Promise.withResolvers<void>()
  const service = w.services({
    source: {
      async resolve() {
        started.resolve()
        await proceed.promise
        return { kind: 'definition', declaration: w.command('one').declaration }
      },
    },
  })
  const pending = service.registrar.contribute(w.context, w.command('one'))
  await started.promise
  expect(await w.remove()).toMatchObject({ kind: 'succeeded' })
  proceed.resolve()
  expect(await pending).toEqual({ kind: 'denied' })
  expect(await service.sql.observe(w.binding('one'))).toMatchObject({
    record: { state: 'accepted' },
    standing: { kind: 'requested' },
  })
  expect(await service.standing.settle(w.binding('one'))).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
})

it('does not erase known business success when settlement temporarily throws', async () => {
  const w = await setup()
  const service = w.services()
  const settle = vi
    .spyOn(service.standing, 'settle')
    .mockRejectedValueOnce(new Error('source offline'))
  expect(await service.registrar.contribute(w.context, w.command('one'))).toMatchObject({
    kind: 'registered',
  })
  expect(await service.sql.observe(w.binding('one'))).toMatchObject({
    record: { state: 'committed' },
    standing: { kind: 'held' },
  })
  settle.mockRestore()
  expect(await service.standing.settle(w.binding('one'))).toMatchObject({
    kind: 'settled',
    outcome: 'committed',
  })
})

it('freezes the complete command before an asynchronous source call', async () => {
  const w = await setup()
  const command = w.command('one')
  const started = Promise.withResolvers<void>(),
    proceed = Promise.withResolvers<void>()
  const service = w.services({
    source: {
      async resolve() {
        started.resolve()
        await proceed.promise
        return { kind: 'definition', declaration: w.command('one').declaration }
      },
    },
  })
  const result = service.registrar.contribute(w.context, command)
  await started.promise
  command.generation = 'changed'
  command.declaration.reference.digest = 'f'.repeat(64)
  proceed.resolve()
  expect(await result).toMatchObject({
    kind: 'registered',
    contribution: { generation: 'generation-1' },
  })
  expect(await service.sql.observe(w.binding('one'))).toMatchObject({
    record: { state: 'committed' },
  })
})

it('denies copied principals and foreign scopes before saving an operation', async () => {
  const w = await setup()
  const { registrar, sql } = w.services()
  expect(
    await registrar.contribute(access({ ...w.principal }, w.principal.tenant), w.command('one')),
  ).toEqual({ kind: 'denied' })
  const foreign = w.command('one')
  foreign.scope = { ...foreign.scope, logicalServiceId: 'foreign' }
  expect(await registrar.contribute(w.context, foreign)).toEqual({ kind: 'denied' })
  expect(await sql.observe(w.binding('one'))).toEqual({ kind: 'absent' })
})

it('seals old pending work after an epoch change instead of rebuilding it under the new authority', async () => {
  const w = await setup()
  const storage = w.activation.storage
  let blocked = true
  const wrapped: SqlStorage = {
    ...storage,
    commit: async envelope =>
      blocked && envelope.identity.operation === 'governance.meta.submit'
        ? { kind: 'unknown', identity: envelope.identity, diagnostic: null }
        : storage.commit(envelope),
  }
  const old = w.services({ storage: wrapped })
  expect(await old.registrar.contribute(w.context, w.command('one'))).toMatchObject({
    kind: 'unknown',
  })
  expect(
    await w.activation.control({
      kind: 'bootstrap',
      input: { scope: w.scope, epoch: 'second', previousEpoch: 'first' },
    }),
  ).toMatchObject({ kind: 'opened' })
  blocked = false
  w.setSourceAvailable(false)
  const replacement = w.services({ epoch: 'second' })
  expect(await replacement.registrar.contribute(w.context, w.command('one'))).toEqual({
    kind: 'conflict',
    reason: 'basis',
  })
  expect(await replacement.sql.observe(w.binding('one'))).toMatchObject({
    record: { state: 'aborted', epoch: 'first', execution: null },
    standing: { kind: 'settled', outcome: 'aborted' },
  })
  await old.sql.send(w.binding('one'), 'submit')
  expect(await replacement.sql.observe(w.binding('one'))).toMatchObject({
    record: { state: 'aborted', execution: null },
  })
  expect(w.sourceReads).toBe(1)
})
