import { describe, expect, it } from 'vitest'
import { canonicalDigest } from '@omne-harness/tool'
import { createLocalInvocationSource } from '@omne-harness/tool-host-local'
import { forwardingFixture, ok } from './forwarding-values.ts'

describe('trusted forwarding association', () => {
  it('requires actual consumed start, then accepts before recordStart has arrived', async () => {
    const f = await forwardingFixture({ consumed: false })
    const input = { ...f.parent, intent: f.intent, target: f.target }
    expect(await f.source.forwarding.resolve(input)).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unavailable' },
    })
    // inspect establishes a durable not-started exclusion for the unconsumed attempt.
    expect(ok(await f.consume()).kind).toBe('not-started')
    const started = await forwardingFixture()
    const answer = await started.source.forwarding.resolve({
      ...started.parent,
      intent: started.intent,
      target: started.target,
    })
    expect(answer.kind).toBe('bound')
    if (answer.kind !== 'bound') throw new Error('expected bound')
    expect(answer.request.invocation).toEqual(started.parent.request.invocation)
    expect(answer.request.consumer).toEqual({
      owner: '@omne-harness/tool-host-local/tools-forwarding',
      work: started.parent.call,
      position: 'execute',
      purpose: 'tools-target',
    })
    expect(answer.call).not.toBe(f.parent.call)
    expect(f.call.execution).toBeNull()
  })
  it('recalls one original target across concurrent retries, lost reply and rebuilt source', async () => {
    const f = await forwardingFixture()
    f.arm('lost')
    const lost = await f.source.forwarding.resolve({
      ...f.parent,
      intent: f.intent,
      target: f.target,
    })
    expect(lost.kind).toBe('issuance-unknown')
    const rebuilt = createLocalInvocationSource(f.input)
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        rebuilt.forwarding.resolve({
          ...f.parent,
          intent: f.intent,
          target: { ...f.target, settings: { ...f.target.settings, revision: 'latest' } },
        }),
      ),
    )
    for (const result of results) {
      expect(result).toMatchObject({ kind: 'bound', recovered: true })
      if (result.kind === 'bound' && lost.kind === 'issuance-unknown') {
        expect(result.call).toBe(lost.call)
        expect(result.admission).toBe(lost.admission)
        expect(result.request.settings).toEqual(f.target.settings)
        expect(
          await rebuilt.guard.verify({
            ...f.parent,
            call: result.call,
            operation: result.admission,
            request: result.request,
          }),
        ).toEqual({ kind: 'trusted' })
        expect(
          ok(
            await rebuilt.recoverBinding({
              tenant: f.parent.tenant,
              call: result.call,
              admission: result.admission,
              request: result.request,
            }),
          ).principal,
        ).toBe('alice')
      }
    }
  })
  it('rejects altered parent proof, different subject, target ceiling and current revocation', async () => {
    const f = await forwardingFixture()
    const valid = { ...f.parent, intent: f.intent, target: f.target }
    expect(
      await f.source.forwarding.resolve({
        ...valid,
        request: {
          ...f.parent.request,
          settings: { ...f.parent.request.settings, revision: 'forged' },
        },
      }),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'denied' } })
    expect(await f.source.forwarding.resolve({ ...valid, principal: 'mallory' })).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'denied' },
    })
    expect(
      await f.source.forwarding.resolve({
        ...valid,
        target: { ...f.target, scope: { ...f.target.scope, key: 'broader' } },
      }),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'denied' } })
    expect(
      await f.source.forwarding.resolve({ ...valid, intent: { ...f.intent, name: 'other' } }),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'denied' } })
    expect((await f.source.forwarding.resolve(valid)).kind).toBe('bound')
    expect(
      await f.source.forwarding.resolve({ ...valid, intent: { ...f.intent, name: 'different' } }),
    ).toMatchObject({ kind: 'rejected', failure: { kind: 'conflict' } })
    f.revoke()
    expect(await f.source.forwarding.lookup({ ...f.parent, reference: f.reference })).toMatchObject(
      { failure: { kind: 'denied' } },
    )
  })
  it('does not create a slot during lookup and keeps unresolved after an unconfirmed write', async () => {
    const f = await forwardingFixture()
    const before = await f.memory.read({
      kind: 'host',
      tenant: f.parent.tenant,
      key: 'invocation-source',
    })
    expect(ok(await f.source.forwarding.lookup({ ...f.parent, reference: f.reference }))).toEqual({
      kind: 'unresolved',
    })
    f.arm('unwritten')
    expect(
      (await f.source.forwarding.resolve({ ...f.parent, intent: f.intent, target: f.target })).kind,
    ).toBe('issuance-unknown')
    expect(ok(await f.source.forwarding.lookup({ ...f.parent, reference: f.reference }))).toEqual({
      kind: 'unresolved',
    })
    expect(
      canonicalDigest(
        await f.memory.read({ kind: 'host', tenant: f.parent.tenant, key: 'invocation-source' }),
      ),
    ).toBe(canonicalDigest(before))
  })
})

it('reads a forwarded subject projection without granting current authority', async () => {
  const f = await forwardingFixture()
  const issued = await f.source.forwarding.resolve({
    ...f.parent,
    intent: f.intent,
    target: f.target,
  })
  if (issued.kind !== 'bound') throw new Error('expected bound')
  const access = {
    tenant: f.parent.tenant,
    call: issued.call,
    admission: issued.admission,
    request: issued.request,
  }
  f.revoke()
  expect(await f.source.recoverBinding(access)).toEqual({ ok: { principal: 'alice' } })
  expect(
    await f.source.guard.verify({ ...access, principal: 'alice', operation: issued.admission }),
  ).toMatchObject({ kind: 'forged' })
  expect(await f.source.recoverBinding({ ...access, call: f.parent.call })).toMatchObject({
    failure: { kind: 'unavailable' },
  })
})
