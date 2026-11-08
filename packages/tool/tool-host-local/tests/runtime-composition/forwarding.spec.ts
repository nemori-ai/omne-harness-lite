import { expect, it, vi } from 'vitest'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { accepted, fixture, unbox } from './fixture.ts'

it('forwards through the real executor binding at resource concurrency one and retires both calls', async () => {
  const world = await fixture(async () => 'retained-payload', undefined, 2, true)
  try {
    for (let i = 0; i < 4; i++) {
      const parent = accepted(await world.api.invoke(world.forwardInvocation(`parent-${i}`)))
      await world.settledState(parent)
      const answer = world.forwarded[i]
      expect(answer).toMatchObject({ kind: 'pending', parent })
      if (answer?.kind !== 'pending') throw new Error(JSON.stringify(answer))
      await world.settledState(answer.reference)
      expect(world.launches()).toBe(i + 1)
      await expect.poll(() => world.plugins.diagnostics().executor?.knownCalls).toBe(0)
      expect(world.plugins.diagnostics().executor?.pacedDeliveries).toBe(0)
      const resumed = await world.plugins.forwarding()?.resume(world.query(parent))
      expect(resumed?.kind).toBe('accepted')
      expect(world.launches()).toBe(i + 1)
      const found = unbox(await world.api.queries.lookup(world.query(answer.reference)))
      expect(found).toMatchObject({ kind: 'found', state: { delivery: { kind: 'released' } } })
      if (found.kind !== 'found' || found.state.phase !== 'settled')
        throw new Error('settled target required')
      const page = await world.plugins.forwardedResult({
        ...world.query(answer.reference),
        result: found.state.result,
        after: null,
      })
      expect(page).toMatchObject({ ok: { result: found.state.result, next: null } })
      expect(page).toMatchObject({
        ok: { value: { content: [{ kind: 'text', text: 'retained-payload' }] } },
      })
      await expect(
        world.api.queries.readResult({
          ...world.query(answer.reference),
          result: found.state.result,
          after: null,
        }),
      ).resolves.toMatchObject({ failure: { kind: 'not-found', reason: 'released' } })
    }
  } finally {
    await world.close()
  }
})

it('reports unavailable at host capacity one without running a target effect', async () => {
  const world = await fixture(undefined, undefined, 1, true)
  try {
    const parent = accepted(await world.api.invoke(world.forwardInvocation('capacity-one')))
    await world.settledState(parent)
    expect(world.forwarded).toMatchObject([
      { kind: 'rejected', failure: { kind: 'unavailable', dependency: 'tool-executor' } },
    ])
    expect(world.launches()).toBe(0)
    await expect.poll(() => world.plugins.diagnostics().executor?.knownCalls).toBe(0)
  } finally {
    await world.close()
  }
})

it('does not run a forwarded target when its current policy denies after preparation', async () => {
  let targetChecks = 0
  const world = await fixture(undefined, undefined, 2, true, {
    qualify: async ({ request }) => {
      if (request.availability.definition.name === 'Tools') return { kind: 'allowed' }
      targetChecks++
      return targetChecks < 3
        ? { kind: 'allowed' }
        : { kind: 'denied', reason: 'target-rule-revoked' }
    },
  })
  try {
    const parent = accepted(await world.api.invoke(world.forwardInvocation('policy-target')))
    await world.settledState(parent)
    const answer = world.forwarded[0]
    if (answer?.kind !== 'pending') throw new Error(JSON.stringify(answer))
    await world.settledState(answer.reference)
    expect(targetChecks).toBeGreaterThanOrEqual(3)
    expect(world.launches()).toBe(0)
    expect(unbox(await world.api.queries.lookup(world.query(answer.reference)))).toMatchObject({
      kind: 'found',
      state: { execution: { kind: 'not-started' } },
    })
    await expect.poll(() => world.plugins.diagnostics().executor?.knownCalls).toBe(0)
  } finally {
    await world.close()
  }
})

it('continues a slow accepted preparation after the parent finishes and drains the original slot before close', async () => {
  const entered = Promise.withResolvers<void>()
  const gate = Promise.withResolvers<void>()
  const world = await fixture(undefined, undefined, 2, true, undefined, async () => {
    entered.resolve()
    await gate.promise
  })
  try {
    const parent = accepted(await world.api.invoke(world.forwardInvocation('slow-preparation')))
    await entered.promise
    await world.settledState(parent)
    expect(world.forwarded).toEqual([{ kind: 'association-unknown', parent }])
    expect((await world.plugins.forwarding()?.resume(world.query(parent)))?.kind).toBe(
      'association-unknown',
    )
    let drained = false
    const closing = world.forwarding.close().then(value => {
      drained = true
      return value
    })
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(drained).toBe(false)
    gate.resolve()
    await expect(closing).resolves.toEqual({ pending: 0, unknown: 0 })
    const resumed = await world.plugins.forwarding()?.resume(world.query(parent))
    if (resumed?.kind !== 'accepted') throw new Error(JSON.stringify(resumed))
    await world.settledState(resumed.reference)
    expect(world.launches()).toBe(1)
    const again = await world.plugins.forwarding()?.resume(world.query(parent))
    expect(again).toMatchObject({ kind: 'accepted', reference: resumed.reference, recovered: true })
    expect(world.launches()).toBe(1)
    await expect.poll(() => world.plugins.diagnostics().executor?.knownCalls).toBe(0)
  } finally {
    gate.resolve()
    await world.close()
  }
})

it('reads the saved forwarded result after rebuilding the runtime and refuses revoked access', async () => {
  const world = await fixture(async () => 'saved-across-rebuild', undefined, 2, true)
  try {
    const parent = accepted(await world.api.invoke(world.forwardInvocation('retained')))
    await world.settledState(parent)
    const answer = world.forwarded[0]
    if (answer?.kind !== 'pending') throw new Error('pending target required')
    const state = await world.settledState(answer.reference)
    await expect.poll(() => world.plugins.diagnostics().executor?.knownCalls).toBe(0)
    const request = { ...world.query(answer.reference), result: state.result, after: null }
    const reopened = await world.newExecutor()
    try {
      await expect(reopened.plugins.forwardedResult(request)).resolves.toMatchObject({
        ok: { value: { content: [{ text: 'saved-across-rebuild' }] } },
      })
      await expect(
        reopened.plugins.forwardedResult({ ...request, principal: 'mallory' }),
      ).resolves.toMatchObject({ failure: { kind: 'denied' } })
      world.revoke()
      await expect(reopened.plugins.forwardedResult(request)).resolves.toMatchObject({
        failure: { kind: 'denied' },
      })
    } finally {
      await reopened.close()
    }
  } finally {
    await world.close()
  }
})

it('refuses a changed forwarding payload even when its stored digest was left intact', async () => {
  const world = await fixture(async () => 'original-saved-value', undefined, 2, true)
  try {
    const parent = accepted(await world.api.invoke(world.forwardInvocation('tampered')))
    await world.settledState(parent)
    const answer = world.forwarded[0]
    if (answer?.kind !== 'pending') throw new Error('pending target required')
    const state = await world.settledState(answer.reference)
    await expect.poll(() => world.plugins.diagnostics().executor?.knownCalls).toBe(0)
    const domain = { kind: 'host', tenant: world.tenantA, key: 'invocation-source' } as const
    const read = await world.store.read(domain)
    if (read.kind !== 'complete') throw new Error('store required')
    const row = read.records.find(
      record =>
        record.kind === 'host' &&
        JSON.stringify(record.host.value).includes('original-saved-value'),
    )
    if (row?.kind !== 'host') throw new Error('saved copy required')
    const changed: unknown = JSON.parse(
      JSON.stringify(row.host.value).replace('original-saved-value', 'changed-saved-value'),
    )
    expect(
      (
        await world.store.commit({
          domain,
          expected: read.revision,
          revision: unbox(decodeToolRevision(String(BigInt(read.revision) + 1n))),
          writes: [
            { kind: 'put', record: { kind: 'host', host: { ...row.host, value: changed } } },
          ],
        })
      ).kind,
    ).toBe('committed')
    await expect(
      world.plugins.forwardedResult({
        ...world.query(answer.reference),
        result: state.result,
        after: null,
      }),
    ).resolves.toMatchObject({ failure: { kind: 'unavailable', dependency: 'forwarded-result' } })
  } finally {
    await world.close()
  }
})

it.each(['revoke', 'revoke-read', 'retire'] as const)(
  'refuses saved result disclosure when %s occurs during a store read',
  async change => {
    const world = await fixture(async () => 'private-saved-value', undefined, 2, true)
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const read = world.store.readRecord
    const qualify = world.input.access.guard.qualify
    try {
      const parent = accepted(await world.api.invoke(world.forwardInvocation('withdrawal')))
      await world.settledState(parent)
      const answer = world.forwarded[0]
      if (answer?.kind !== 'pending') throw new Error('pending target required')
      const state = await world.settledState(answer.reference)
      await expect.poll(() => world.plugins.diagnostics().executor?.knownCalls).toBe(0)
      world.store.readRecord = async (domain, key) => {
        const value = await read(domain, key)
        if (domain.kind === 'host' && domain.key === 'invocation-source') {
          entered.resolve()
          await resume.promise
        }
        return value
      }
      const pending = world.plugins.forwardedResult({
        ...world.query(answer.reference),
        result: state.result,
        after: null,
      })
      await entered.promise
      if (change === 'revoke') world.revoke()
      else if (change === 'revoke-read')
        world.input.access.guard.qualify = async () => ({
          kind: 'denied',
          reason: 'read revoked',
        })
      else await world.plugins.close()
      resume.resolve()
      await expect(pending).resolves.toMatchObject({
        failure: { kind: change === 'retire' ? 'unavailable' : 'denied' },
      })
    } finally {
      resume.resolve()
      world.store.readRecord = read
      world.input.access.guard.qualify = qualify
      await world.close()
    }
  },
)

it('reads a forwarded result when unrelated source history prevents a full domain read', async () => {
  const world = await fixture(async () => 'exact-result', undefined, 2, true)
  try {
    const parent = accepted(await world.api.invoke(world.forwardInvocation('keyed-read')))
    await world.settledState(parent)
    const target = world.forwarded[0]
    if (target?.kind !== 'pending') throw new Error(JSON.stringify(target))
    await world.settledState(target.reference)
    const found = unbox(await world.api.queries.lookup(world.query(target.reference)))
    if (found.kind !== 'found' || found.state.phase !== 'settled')
      throw new Error('settled target required')
    const read = world.store.read.bind(world.store)
    const fullRead = vi.spyOn(world.store, 'read').mockImplementation(domain =>
      domain.kind === 'host' && domain.key === 'invocation-source'
        ? Promise.resolve({
            kind: 'unavailable',
            diagnostic: 'full source history exceeds budget',
          })
        : read(domain),
    )
    try {
      expect(
        await world.plugins.forwardedResult({
          ...world.query(target.reference),
          result: found.state.result,
          after: null,
        }),
      ).toMatchObject({ ok: { value: { content: [{ kind: 'text', text: 'exact-result' }] } } })
      expect(await world.plugins.forwarding()?.resume(world.query(parent))).toMatchObject({
        kind: 'accepted',
      })
      expect(world.launches()).toBe(1)
      expect(
        fullRead.mock.calls.filter(
          ([domain]) => domain.kind === 'host' && domain.key === 'invocation-source',
        ),
      ).toHaveLength(0)
    } finally {
      fullRead.mockRestore()
    }
  } finally {
    await world.close()
  }
})
