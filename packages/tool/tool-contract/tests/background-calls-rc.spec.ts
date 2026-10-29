import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import { tenantEquals } from '@omne-harness/legal-identity'
import type { ProducerRegistration, SupplyInput } from '@omne-harness/runtime-context-contract'
import {
  createMemoryRuntimeContext,
  createTestAuthorityPorts,
} from '@omne-harness/runtime-context-contract/testing'
import { backgroundCallsBlock, backgroundCallsSchema } from '@omne-harness/tool-contract'
import {
  projectToolBackgroundCalls,
  type ToolBackgroundCallsSource,
} from '@omne-harness/tool-contract/provider'
import {
  complete,
  input,
  operation,
  original,
  revision,
  scope,
  settled,
  state,
  tenant,
} from './background-calls-fixture.ts'
import { evidence } from './tool-values.ts'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close()
})

/** A trusted fixture directory. It is not the missing production directory or holder. */
async function setup(source: ToolBackgroundCallsSource = complete()) {
  const authority = createTestAuthorityPorts<string>()
  authority.bind(input.scope, input.tenant)
  const context = createMemoryRuntimeContext({
    authority: authority.authority,
    bindings: authority.bindings,
  })
  cleanup.push(() => context.close())
  const replay = await context.beginReplay(input.principal, {
    scope: input.scope,
    tenant: input.tenant,
    through: null,
    supersedes: null,
  })
  assert.equal(replay.kind, 'replaying')
  assert.equal(
    (
      await context.finishReplay(input.principal, {
        replay: replay.replay,
        material: { registrations: [], checkpoints: [], end: null },
      })
    ).kind,
    'ready',
  )
  let current = source
  let permitted = true
  const supplies: SupplyInput<string>[] = []
  const registration: ProducerRegistration<'tool.background-calls', string> = {
    key: backgroundCallsBlock.key,
    tenant: input.tenant,
    producer: { producer: 'tool-background-fixture' },
    declaration: backgroundCallsBlock,
    scoped: false,
    async supply(request) {
      supplies.push(request)
      const binding = await authority.bindings.lookup(request.scope)
      if (
        !permitted ||
        request.principal !== input.principal ||
        binding.kind !== 'bound' ||
        !tenantEquals(binding.tenant, request.tenant)
      )
        return { kind: 'refused' }
      return projectToolBackgroundCalls({ input: request, source: current })
    },
  }
  const registered = await context.registerProducer(input.principal, registration)
  assert.equal(registered.kind, 'registered')
  assert.equal(
    (
      await context.applyCommit(input.principal, {
        kind: 'registration',
        commit: { commit: 'register-tool-background' },
        change: {
          kind: 'add',
          creating: true,
          scope: input.scope,
          tenant: input.tenant,
          key: backgroundCallsBlock.key,
          basedOn: 0,
          required: true,
          parameters: undefined,
          bindings: [
            {
              key: backgroundCallsBlock.key,
              need: {
                name: 'background',
                shape: backgroundCallsSchema,
                consumer: 'model',
                purpose: 'Observe original background calls',
                necessity: 'required',
              },
            },
          ],
        },
      })
    ).kind,
    'applied',
  )
  const issued = await context.issueEligibility(input.principal, {
    supersedes: null,
    scope: input.scope,
    tenant: input.tenant,
    principal: input.principal,
    consumer: 'model',
    keys: [backgroundCallsBlock.key],
    bindings: [],
    registrationRevision: 1,
  })
  assert.equal(issued.kind, 'issued')
  const bound = await context.bind(issued.eligibility.id)
  assert.equal(bound.kind, 'bound')
  cleanup.push(() => bound.reader.end())
  return {
    context,
    authority,
    registration,
    handle: registered.handle,
    reader: bound.reader,
    eligibility: issued.eligibility,
    supplies,
    change(next: ToolBackgroundCallsSource) {
      current = next
    },
    deny() {
      permitted = false
    },
    async invalidate() {
      return registered.handle.invalidate({
        kind: 'scope',
        scope: input.scope,
        tenant: input.tenant,
      })
    },
  }
}

async function readValue(fixture: Awaited<ReturnType<typeof setup>>) {
  const read = await fixture.reader.read([{ need: 'background', key: backgroundCallsBlock.key }])
  assert.equal(read.kind, 'success')
  const item = read.value[0]
  assert.ok(item?.kind === 'value')
  const decoded = await backgroundCallsSchema['~standard'].validate(item.value)
  assert.equal(decoded.issues, undefined)
  return decoded.value
}

describe('Tool supply over the public RC protocol, with non-durable authority and holder doubles', () => {
  it('recomputes after original-handle invalidation with scope, tenant and actual principal', async () => {
    const fixture = await setup()
    expect((await readValue(fixture)).calls[0]?.revision).toBe(revision())
    expect(fixture.supplies).toEqual([input])
    fixture.change(
      complete([original({ state: { ...state(), revision: revision('revision-2') } })]),
    )
    expect(await fixture.invalidate()).toEqual({ kind: 'invalidated', scopes: [input.scope] })
    expect((await readValue(fixture)).calls[0]?.revision).toBe(revision('revision-2'))
    expect(fixture.supplies).toEqual([input, input])
  })
  it('refuses current source disclosure after revocation instead of replaying its old value', async () => {
    const fixture = await setup()
    expect((await readValue(fixture)).calls).toHaveLength(1)
    fixture.deny()
    await fixture.invalidate()
    expect(
      await fixture.reader.read([{ need: 'background', key: backgroundCallsBlock.key }]),
    ).toEqual({ kind: 'refused', reason: 'unauthorized' })
    expect(fixture.supplies).toHaveLength(2)
  })
  it('refuses a revoked reader eligibility and a changed trusted scope binding', async () => {
    const fixture = await setup()
    expect(
      (await fixture.context.revokeEligibility(input.principal, fixture.eligibility.id)).kind,
    ).toBe('revoked')
    expect(await fixture.reader.snapshot()).toEqual({ kind: 'refused', reason: 'unauthorized' })
    fixture.authority.bind(input.scope, tenant('b'))
    expect(await fixture.invalidate()).toEqual({ kind: 'refused', reason: 'unauthorized' })
  })
  it.each(['partial', 'unknown', 'unavailable', 'refused'] as const)(
    'preserves %s at the reader rather than returning empty calls',
    async kind => {
      const fixture = await setup({ kind })
      const read = await fixture.reader.read([
        { need: 'background', key: backgroundCallsBlock.key },
      ])
      if (kind === 'unavailable')
        expect(read).toMatchObject({
          kind: 'missing',
          items: [{ key: backgroundCallsBlock.key, cause: 'source-unavailable' }],
        })
      else if (kind === 'refused') expect(read).toEqual({ kind: 'refused', reason: 'unauthorized' })
      else expect(read).toEqual({ kind: 'unknown', cause: 'source-unknown' })
    },
  )
  it('allows an empty value only from the complete authorized directory', async () => {
    const fixture = await setup(complete([]))
    expect(await readValue(fixture)).toEqual({ tenant: input.tenant, calls: [] })
  })
  it('does not let an old generation, unregistered scope or ended scope invalidate the current value', async () => {
    const fixture = await setup()
    const replacement = await fixture.context.registerProducer(
      input.principal,
      fixture.registration,
    )
    assert.equal(replacement.kind, 'registered')
    expect(await fixture.invalidate()).toEqual({ kind: 'rejected', reason: 'stale-generation' })
    await fixture.handle.dispose()
    expect((await readValue(fixture)).calls).toHaveLength(1)
    const unregistered = scope('unregistered')
    fixture.authority.bind(unregistered, input.tenant)
    expect(
      await replacement.handle.invalidate({
        kind: 'scope',
        tenant: input.tenant,
        scope: unregistered,
      }),
    ).toMatchObject({ kind: 'rejected' })
    expect(
      (
        await fixture.context.applyCommit(input.principal, {
          kind: 'scope',
          commit: { commit: 'end-scope' },
          scope: input.scope,
          tenant: input.tenant,
          scopeEnded: true,
        })
      ).kind,
    ).toBe('applied')
    expect(
      await replacement.handle.invalidate({
        kind: 'scope',
        tenant: input.tenant,
        scope: input.scope,
      }),
    ).toEqual({ kind: 'rejected', reason: 'scope-ended' })
  })
  it('withdrawing the producer leaves original unsettled responsibilities intact', async () => {
    const originalCall = original({
      state: { ...settled(), execution: { kind: 'unknown', start: operation('original-start') } },
      tasks: [
        {
          kind: 'account',
          state: 'pending',
          operation: operation('original-account'),
          diagnostic: null,
          basis: evidence('account-basis'),
        },
      ],
    })
    const source = complete([originalCall])
    const before = structuredClone(source)
    const fixture = await setup(source)
    await fixture.handle.dispose()
    expect(await fixture.invalidate()).toEqual({ kind: 'rejected', reason: 'withdrawn' })
    expect(
      await fixture.reader.read([{ need: 'background', key: backgroundCallsBlock.key }]),
    ).toMatchObject({ kind: 'missing', items: [{ cause: 'producer-withdrawn' }] })
    expect(source).toEqual(before)
    expect(projectToolBackgroundCalls({ input, source })).toMatchObject({
      kind: 'value',
      value: { calls: [{ execution: 'unknown', pending: ['account'] }] },
    })
  })
})
