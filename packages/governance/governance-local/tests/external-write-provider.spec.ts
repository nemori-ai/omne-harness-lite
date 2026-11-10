import { afterEach, expect, it, vi } from 'vitest'
import {
  createGovernanceLocal,
  type GovernanceExternalWriteOptions,
  type GovernanceLocalOptions,
} from '@omne-harness/governance-local'
import { openProviderWorld } from './provider-world.ts'
import { executionSchema } from '../src/operation-schema.ts'
import { digest } from '../src/encoding.ts'

const worlds: Awaited<ReturnType<typeof openProviderWorld>>[] = []
afterEach(async () => {
  for (const { w } of worlds.splice(0)) await w.close()
})
function intent(operationId = 'external-write-one') {
  return {
    operationId,
    write: {
      owner: 'fixture.owner',
      protocol: 'fixture-command/1',
      targetRef: 'target-one',
      commandDigest: 'original-command',
      command: { pick: 'deny' },
    },
  }
}
async function setup(
  overrides: Partial<GovernanceExternalWriteOptions> = {},
  configure: (options: GovernanceLocalOptions) => GovernanceLocalOptions = options => options,
) {
  const world = await openProviderWorld()
  worlds.push(world)
  const resolve = vi.fn(async () => ({
    kind: 'qualified' as const,
    qualification: { fixture: 'original-qualified-write' },
    required: [],
    source: null,
  }))
  const plan = vi.fn(() => {
    throw new Error('fixture external combination unavailable')
  })
  const externalWrites: GovernanceExternalWriteOptions = {
    sourceRoute: 'fixture-external-source',
    principalOf: principal => principal,
    resolve,
    plan,
    ...overrides,
  }
  const made = await createGovernanceLocal({ ...configure(world.options), externalWrites })
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  expect(made.externalWrites).toBeDefined()
  const service = made.externalWrites
  if (service === undefined) throw new Error('configured write outlet missing')
  const ref = (operationId = 'external-write-one') => ({
    scope: world.w.scope,
    principalRef: world.w.principalRef,
    owner: 'internal.external-write' as const,
    operationId,
  })
  return { ...world, made, service, resolve, plan, ref }
}

it('retains the accepted original and settles actual Identity custody when planning fails', async () => {
  const { w, made, service, resolve, plan, ref } = await setup()
  const result = await service.execute(w.principal, intent())
  expect(result).toMatchObject({ kind: 'terminal', outcome: 'aborted', result: { kind: 'sealed' } })
  const original = await w.services().sql.lookup(ref())
  expect(original).toMatchObject({
    kind: 'found',
    record: {
      state: 'aborted',
      request: {
        command: {
          write: { ...intent().write, qualification: { fixture: 'original-qualified-write' } },
          required: [],
        },
      },
    },
  })
  expect(resolve).toHaveBeenCalledTimes(1)
  expect(plan).toHaveBeenCalledTimes(1)
  expect(await service.execute(w.principal, intent())).toEqual(result)
  expect(resolve).toHaveBeenCalledTimes(1)
  expect(plan).toHaveBeenCalledTimes(1)
  expect(
    await service.execute(w.principal, {
      ...intent(),
      write: { ...intent().write, command: { pick: 'auto' } },
    }),
  ).toEqual({ kind: 'conflict', reason: 'operation' })
  expect(await made.close()).toEqual({ kind: 'closed' })
  if (result.kind !== 'terminal') throw new Error('terminal expected')
  expect(await w.services().sql.observe(result.binding)).toMatchObject({
    kind: 'found',
    standing: { kind: 'settled', outcome: 'aborted' },
  })
})

it('refuses forged principals and qualification failure without accepting an operation', async () => {
  const { w, made, service, resolve, ref } = await setup({
    resolve: async () => ({ kind: 'denied' }),
  })
  expect(await service.execute({ ...w.principal }, intent())).toEqual({ kind: 'denied' })
  expect(await service.execute(w.principal, intent())).toEqual({ kind: 'denied' })
  expect(resolve).not.toHaveBeenCalled()
  expect(await w.services().sql.lookup(ref())).toEqual({ kind: 'absent' })
  expect(await made.close()).toEqual({ kind: 'closed' })
  expect(await service.execute(w.principal, intent())).toMatchObject({ kind: 'unavailable' })
})

it('captures intent before awaiting qualification and rejects caller supplied qualification', async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const { w, made, service, ref } = await setup({
    resolve: async (_principal, request) => {
      entered.resolve()
      await release.promise
      request.write.command = { pick: 'resolver-mutated-copy' }
      return {
        kind: 'qualified',
        qualification: { fixture: 'qualified' },
        required: [],
        source: null,
      }
    },
  })
  const raw = intent()
  const pending = service.execute(w.principal, raw)
  await entered.promise
  raw.write.command.pick = 'caller-mutated-after-call'
  release.resolve()
  expect(await pending).toMatchObject({ kind: 'terminal', outcome: 'aborted' })
  const found = await w.services().sql.lookup(ref())
  expect(found).toMatchObject({
    kind: 'found',
    record: { request: { command: { write: intent().write } } },
  })
  if (found.kind !== 'found') throw new Error('original expected')
  expect(found.record.requestDigest).toBe(digest(found.record.request))
  expect(
    await service.execute(w.principal, {
      ...intent('spoofed-qualification'),
      write: { ...intent().write, qualification: { fixture: 'spoof' } },
    }),
  ).toMatchObject({ kind: 'invalid-input' })
  expect(await w.services().sql.lookup(ref('spoofed-qualification'))).toEqual({ kind: 'absent' })
  expect(await made.close()).toEqual({ kind: 'closed' })
})

it('saves the full execution before dispatch and preserves it after an unavailable business combination', async () => {
  const { w, made, service, plan } = await setup({
    plan: input => ({
      combination: {
        combinationVersion: 'fixture-external-unavailable/1',
        manifestDigest: 'a'.repeat(64),
      },
      writer: 'fixture.external-writer',
      commands: [
        { participant: 'fixture.external-writer', facts: { command: input.command.write.command } },
      ],
    }),
  })
  const result = await service.execute(w.principal, intent())
  expect(result).toMatchObject({ kind: 'terminal', outcome: 'aborted' })
  if (result.kind !== 'terminal') throw new Error('terminal expected')
  const saved = await w.services().sql.readStage(result.binding, 'apply')
  expect(saved).toMatchObject({
    kind: 'stored',
    envelope: {
      combinationVersion: 'fixture-external-unavailable/1',
      commands: expect.arrayContaining([
        { participant: 'fixture.external-writer', facts: { command: intent().write.command } },
      ]),
    },
  })
  expect(plan).not.toHaveBeenCalled()
  expect(await service.execute(w.principal, intent())).toEqual(result)
  expect(await w.services().sql.readStage(result.binding, 'apply')).toEqual(saved)
  expect(await made.close()).toEqual({ kind: 'closed' })
})

it('does not accept a late qualification after provider close begins', async () => {
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const { w, made, service, ref, plan } = await setup({
    resolve: async () => {
      entered.resolve()
      await release.promise
      return { kind: 'qualified', qualification: { fixture: 'late' }, required: [], source: null }
    },
  })
  const call = service.execute(w.principal, intent())
  await entered.promise
  const closing = made.close()
  release.resolve()
  expect(await call).toMatchObject({ kind: 'unavailable' })
  expect(await closing).toEqual({ kind: 'closed' })
  expect(plan).not.toHaveBeenCalled()
  expect(await w.services().sql.lookup(ref())).toEqual({ kind: 'absent' })
})

it('does not plan when the original Identity qualification cannot be held', async () => {
  const { w, made, service, plan } = await setup({
    resolve: async () => ({
      kind: 'qualified',
      qualification: { fixture: 'requires-organization-management' },
      required: ['organization-settings-manage'],
      source: null,
    }),
  })
  const result = await service.execute(w.principal, intent())
  expect(result).toMatchObject({ kind: 'terminal', outcome: 'aborted' })
  expect(plan).not.toHaveBeenCalled()
  if (result.kind !== 'terminal') throw new Error('terminal expected')
  expect(await w.services().sql.observe(result.binding)).toMatchObject({
    kind: 'found',
    standing: { request: { required: ['organization-settings-manage'] } },
    record: { request: { command: { required: ['organization-settings-manage'] } } },
  })
  expect(await made.close()).toEqual({ kind: 'closed' })
})

it('resumes submitted execution using its original plan without consulting the current resolver', async () => {
  const { w, made, service, resolve, plan, ref } = await setup()
  const request = {
    owner: 'internal.external-write' as const,
    command: {
      ...intent(),
      scope: w.scope,
      write: { ...intent().write, qualification: { fixture: 'persisted-before-retry' } },
      required: [],
      source: null,
      sourceRoute: 'fixture-external-source',
    },
  }
  const binding = { ref: ref(), requestDigest: digest(request) }
  const { sql, standing } = w.services()
  expect(
    await sql.accept({
      principalRef: w.principalRef,
      epoch: made.epoch,
      transactionDomain: w.activation.domain.transactionDomain,
      request,
    }),
  ).toMatchObject({ kind: 'found', record: { state: 'accepted' } })
  expect(
    await standing.reserve(
      { operation: binding, destination: w.destination, required: [] },
      w.principal,
    ),
  ).toMatchObject({ kind: 'held' })
  const commands = [{ participant: 'fixture.external-writer', facts: { original: 'saved-facts' } }]
  const execution = executionSchema.parse({
    combinationVersion: 'fixture-external-unavailable/1',
    manifestDigest: 'a'.repeat(64),
    authority: {
      protocol: 'governance-external-write-execution/1',
      requestDigest: binding.requestDigest,
      writer: 'fixture.external-writer',
      commands,
    },
  })
  expect(await sql.executeControl(binding, { kind: 'submit', binding, execution })).toMatchObject({
    kind: 'applied',
  })
  expect(await service.execute(w.principal, intent())).toMatchObject({
    kind: 'terminal',
    outcome: 'aborted',
  })
  expect(resolve).not.toHaveBeenCalled()
  expect(plan).not.toHaveBeenCalled()
  expect(await sql.readStage(binding, 'apply')).toMatchObject({
    kind: 'stored',
    envelope: { commands: expect.arrayContaining(commands) },
  })
  expect(await made.close()).toEqual({ kind: 'closed' })
})

it('retains failed settlement through a Worker restart and completes it during the next assembly', async () => {
  const { w, made, service } = await setup({}, options => ({
    ...options,
    identity: {
      ...options.identity,
      reservations: {
        ...options.identity.reservations,
        reserve: request => options.identity.reservations.reserve(request),
        settle: async () => ({ kind: 'unavailable', diagnostic: 'fixture-settlement-offline' }),
      },
    },
  }))
  const result = await service.execute(w.principal, intent())
  expect(result).toMatchObject({ kind: 'terminal', outcome: 'aborted' })
  if (result.kind !== 'terminal') throw new Error('terminal expected')
  expect(await w.services().sql.observe(result.binding)).toMatchObject({
    kind: 'found',
    standing: { kind: 'held' },
  })
  expect(await made.close()).toMatchObject({ kind: 'pending', phase: 'recovery' })
  await w.reopen()
  const fresh = await openProviderWorld(w)
  const resolve = vi.fn(async () => ({ kind: 'denied' as const }))
  const restored = await createGovernanceLocal({
    ...fresh.options,
    externalWrites: {
      sourceRoute: 'fixture-external-source',
      principalOf: principal => principal,
      resolve,
      plan() {
        throw new Error('a recovered terminal must not plan')
      },
    },
  })
  if (restored.kind !== 'created' || restored.externalWrites === undefined)
    throw new Error(JSON.stringify(restored))
  expect(await w.services().sql.observe(result.binding)).toMatchObject({
    kind: 'found',
    standing: { kind: 'settled', outcome: 'aborted' },
  })
  expect(await restored.externalWrites.execute(w.principal, intent())).toEqual(result)
  expect(resolve).not.toHaveBeenCalled()
  expect(await restored.close()).toEqual({ kind: 'closed' })
})

it('returns a confirmed terminal while settlement is pending and keeps close responsible for it', async () => {
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const { w, made, service } = await setup({}, options => ({
    ...options,
    identity: {
      ...options.identity,
      reservations: {
        ...options.identity.reservations,
        async settle(request) {
          entered.resolve()
          await release.promise
          return options.identity.reservations.settle(request)
        },
      },
    },
  }))
  let returned = false
  const call = service.execute(w.principal, intent()).then(result => {
    returned = true
    return result
  })
  try {
    await entered.promise
    await new Promise(resolve => setImmediate(resolve))
    expect(returned).toBe(true)
  } finally {
    release.resolve()
  }
  expect(await call).toMatchObject({ kind: 'terminal', outcome: 'aborted' })
  expect(await made.close()).toEqual({ kind: 'closed' })
})
