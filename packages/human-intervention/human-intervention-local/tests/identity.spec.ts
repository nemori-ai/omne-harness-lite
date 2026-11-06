import { z } from 'zod'
// Real IdentitySql and SQLite exercise revocation against the HITL destination.
import { OperationRefSchema } from '@omne-harness/human-intervention'
import { afterEach, expect, it } from 'vitest'
import {
  createIdentityQualifiedHitl,
  IndependentCommandSchema,
} from '@omne-harness/human-intervention-local'
import { openIdentityWorld } from './identity-world.ts'

const opened: Awaited<ReturnType<typeof openIdentityWorld>>[] = []
async function open(options: Parameters<typeof openIdentityWorld>[0] = {}) {
  const world = await openIdentityWorld(options)
  opened.push(world)
  return world
}
afterEach(async () => {
  for (const world of opened.splice(0)) await world.close()
})

it('rejects a new HITL write after membership is revoked', async () => {
  const w = await open()
  expect(await w.remove()).toEqual({ kind: 'succeeded' })
  expect(await w.backend.execute(w.principal, w.command)).toEqual({
    kind: 'denied',
    reason: 'qualification',
  })
  expect(await w.terminal.inspect(w.binding)).toEqual({ kind: 'absent' })
})

it('retains a committed request after revocation but refuses replay and receipt disclosure', async () => {
  const w = await open()
  const registered = await w.backend.execute(w.principal, w.command)
  expect(registered).toMatchObject({ kind: 'registered' })
  expect(await w.backend.inspect(w.principal, w.binding)).toMatchObject({
    kind: 'committed',
    result: registered,
  })
  expect(await w.remove()).toEqual({ kind: 'succeeded' })
  expect(await w.backend.execute(w.principal, w.command)).toEqual({
    kind: 'denied',
    reason: 'qualification',
  })
  expect(await w.backend.inspect(w.principal, w.binding)).toEqual({
    kind: 'denied',
    reason: 'qualification',
  })
  expect(await w.terminal.inspect(w.binding)).toMatchObject({
    kind: 'terminal',
    terminal: { state: 'committed' },
  })
})

it('lets revocation seal a held reservation before a delayed registration arrives', async () => {
  const reached = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const w = await open({
    wrapHitl: storage => ({
      ...storage,
      async commit(input) {
        if (input.identity.operation === 'hitl.command') {
          reached.resolve()
          await release.promise
        }
        return storage.commit(input)
      },
    }),
  })
  const pending = w.backend.execute(w.principal, w.command)
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
  expect(await pending).toMatchObject({ kind: 'conflict', reason: 'operation-sealed' })
})

it('recovers a lost write response through the original authenticated operation', async () => {
  const w = await open({
    wrapHitl: storage => ({
      ...storage,
      async commit(input) {
        await storage.commit(input)
        throw new Error('lost response')
      },
    }),
  })
  expect(await w.backend.execute(w.principal, w.command)).toMatchObject({
    kind: 'unknown',
    operationRef: w.binding.operationRef,
  })
  const original = await w.backend.inspect(w.principal, w.binding)
  expect(original).toMatchObject({
    kind: 'committed',
    method: 'registerRequest',
    result: { kind: 'registered' },
  })
  if (original.kind !== 'committed') throw new Error('Expected durable result')
  expect(await w.backend.execute(w.principal, w.command)).toEqual(original.result)
})

it('does not accept a copied principal or another operation actor', async () => {
  const w = await open()
  expect(await w.backend.execute({ ...w.principal }, w.command)).toEqual({
    kind: 'denied',
    reason: 'principal',
  })
  expect(
    await w.backend.inspect(w.principal, {
      ...w.binding,
      operationRef: OperationRefSchema.parse({ ...w.binding.operationRef, actorRef: 'other' }),
    }),
  ).toMatchObject({ kind: 'denied' })
  expect(await w.terminal.inspect(w.binding)).toEqual({ kind: 'absent' })
})

it('drains admitted writes on close, rejects new work and preserves shared storage', async () => {
  const reached = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const w = await open({
    wrapHitl: storage => ({
      ...storage,
      async commit(input) {
        reached.resolve()
        await release.promise
        return storage.commit(input)
      },
    }),
  })
  const pending = w.backend.execute(w.principal, w.command)
  await reached.promise
  let finished = false
  const closed = w.backend.close().then(() => {
    finished = true
  })
  try {
    expect(await w.backend.execute(w.principal, w.command)).toEqual({
      kind: 'unavailable',
      reason: 'closing',
    })
    expect(await w.backend.inspect(w.principal, w.binding)).toEqual({
      kind: 'unavailable',
      reason: 'closing',
    })
    expect(finished).toBe(false)
  } finally {
    release.resolve()
  }
  expect(await pending).toMatchObject({ kind: 'registered' })
  await closed
  expect(await w.terminal.inspect(w.binding)).toMatchObject({
    kind: 'terminal',
    terminal: { state: 'committed' },
  })
})

it('applies standing coordination to receiver binding as well as card writes', async () => {
  const w = await open()
  expect(await w.backend.execute(w.principal, w.command)).toMatchObject({ kind: 'registered' })
  const bind = IndependentCommandSchema.parse({
    kind: 'bind',
    command: {
      protocol: 'hitl/1',
      operation: w.operation('bind'),
      waitRef: w.request.origin.wait,
      expectedGeneration: '0',
      instanceId: 'process',
      implementationRef: 'v1',
    },
  })
  if (bind.kind !== 'bind') throw new Error('Expected bind')
  expect(await w.backend.execute(w.principal, bind)).toMatchObject({
    kind: 'bound',
    receiverGeneration: '1',
  })
  expect(await w.remove()).toEqual({ kind: 'succeeded' })
  expect(await w.backend.execute(w.principal, bind)).toMatchObject({ kind: 'denied' })
})

it('includes an admitted read in close even when its verifier closes the service reentrantly', async () => {
  const w = await open()
  const reached = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  let closed: Promise<void> | undefined
  let finished = false
  const backend = createIdentityQualifiedHitl({
    ...w.terminalOptions,
    destination: w.destination,
    required: [],
    identity: {
      standing: w.identity.standing,
      reservations: w.identity.reservations,
      verifier: {
        async verify(principal) {
          closed = backend.close().then(() => {
            finished = true
          })
          reached.resolve()
          await release.promise
          return w.authority.verifier.verify(principal)
        },
      },
    },
  })
  const reading = backend.qualify(w.principal)
  await reached.promise
  try {
    await Promise.resolve()
    expect(finished).toBe(false)
  } finally {
    release.resolve()
  }
  expect(await reading).toMatchObject({ kind: 'qualified' })
  await closed
  expect(finished).toBe(true)
})

it('keeps revocation pending while the destination is offline, then resumes by sealing the original', async () => {
  const reached = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const w = await open({
    wrapHitl: storage => ({
      ...storage,
      async commit(input) {
        reached.resolve()
        await release.promise
        return storage.commit(input)
      },
    }),
  })
  const pending = w.backend.execute(w.principal, w.command)
  try {
    await reached.promise
    w.setAvailable(false)
    let failure: unknown
    try {
      await w.remove()
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(Error)
    const reported = z.object({ operation: z.object({ operationId: z.string() }) }).parse(failure)
    const next = IndependentCommandSchema.parse({
      ...w.command,
      input: {
        ...w.command.input,
        command: { ...w.request, operation: w.operation('new-registration') },
      },
    })
    if (next.kind !== 'request') throw new Error('Expected request')
    expect(await w.backend.execute(w.principal, next)).toMatchObject({
      kind: 'conflict',
      reason: 'qualification-changing',
    })
    w.setAvailable(true)
    expect(
      await w.identity.governanceRecovery.resume({
        login: w.loginA.login,
        operation: reported.operation,
      }),
    ).toMatchObject({ kind: 'finished', outcome: { kind: 'succeeded' } })
    expect(await w.terminal.inspect(w.binding)).toMatchObject({
      kind: 'terminal',
      terminal: { state: 'aborted' },
    })
  } finally {
    w.setAvailable(true)
    release.resolve()
  }
  expect(await pending).toMatchObject({ kind: 'conflict', reason: 'operation-sealed' })
})
