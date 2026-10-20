import { expect, it, vi } from 'vitest'
import {
  encodeModelInvocationRef,
  encodeModelOperationRef,
  resolveModelOperationRef,
  type ModelInvocationRef,
} from '@omne-harness/model-contract'
import { runtimeFixture } from './runtime-fixture.ts'
import { settleRuntime, partialParts } from './runtime-consumption-fixture.ts'
import { identity, op, proof, unbox } from './memory-fixture.ts'

it('uses the pre-admission reference and returns the original reference on replay and conflict', async () => {
  const f = runtimeFixture()
  try {
    const reference = unbox(
      encodeModelInvocationRef({
        tenant: f.tenant,
        call: f.admit.call,
        admission: f.admit.operation,
      }),
    )
    expect(
      await f.provider.runtime.calls.inspect({
        principal: f.principal,
        tenant: f.tenant,
        reference,
      }),
    ).toMatchObject({ ok: { kind: 'not-accepted' } })
    const first = unbox(await f.provider.runtime.calls.admit(f.admit))
    expect(first.reference).toBe(reference)
    expect(first.recovered).toBe(false)
    expect(await f.provider.runtime.calls.admit(f.admit)).toEqual({
      ok: { ...first, recovered: true },
    })
    expect(
      await f.provider.runtime.calls.admit({ ...f.admit, operation: op('different-admission') }),
    ).toMatchObject({ failure: { kind: 'conflict' } })
    // Dropping the first receipt loses no identity. Inspect uses the locator saved before admit.
    expect(
      await f.provider.runtime.calls.inspect({
        principal: f.principal,
        tenant: f.tenant,
        reference,
      }),
    ).toMatchObject({ ok: { kind: 'found' } })
  } finally {
    await f.dispose()
  }
})

it('distinguishes original-admission facts from call-only observation and reading', async () => {
  const f = runtimeFixture()
  try {
    const settlement = await settleRuntime(f, partialParts)
    const reference = unbox(
      encodeModelInvocationRef({
        tenant: f.tenant,
        call: f.admit.call,
        admission: op('not-original'),
      }),
    )
    const access = { principal: f.principal, tenant: f.tenant, reference }
    expect(await f.provider.runtime.calls.inspect(access)).toMatchObject({
      failure: { kind: 'invalid', field: 'admission', reason: 'not-original' },
    })
    expect(await f.provider.runtime.instances.connect(access)).toMatchObject({
      ok: { kind: 'live' },
    })
    const read = unbox(
      await f.provider.runtime.consumption.beginRead({
        ...access,
        operation: op('reference-read'),
        result: settlement.version,
      }),
    )
    expect(read.kind).toBe('started')
    f.denied.add('facts')
    expect(
      await f.provider.runtime.calls.inspect({ ...access, reference: f.reference }),
    ).toMatchObject({ failure: { kind: 'denied' } })
    expect(await f.provider.runtime.instances.connect(access)).toMatchObject({
      ok: { kind: 'live' },
    })
    f.denied.add('observe')
    expect(await f.provider.runtime.instances.connect(access)).toMatchObject({
      failure: { kind: 'denied' },
    })
    f.denied.add('content')
    expect(
      await f.provider.runtime.consumption.beginRead({
        ...access,
        operation: op('reference-read-again'),
        result: settlement.version,
      }),
    ).toMatchObject({ failure: { kind: 'denied' } })
  } finally {
    await f.dispose()
  }
})

it('rejects malformed and foreign locators directly at all three real entry boundaries', async () => {
  const f = runtimeFixture()
  try {
    const settlement = await settleRuntime(f, partialParts)
    const foreign = unbox(
      encodeModelInvocationRef({
        tenant: identity('6'),
        call: f.admit.call,
        admission: f.admit.operation,
      }),
    )
    const recall = vi.spyOn(f.dependencies.commands, 'recall')
    const connect = vi.spyOn(f.dependencies.instances.directory, 'connect')
    const acquireRead = vi.spyOn(f.dependencies.commands, 'acquireRead')
    const probes = [
      [
        'inspect',
        (reference: ModelInvocationRef) =>
          f.provider.runtime.calls.inspect({ principal: f.principal, tenant: f.tenant, reference }),
      ],
      [
        'connect',
        (reference: ModelInvocationRef) =>
          f.provider.runtime.instances.connect({
            principal: f.principal,
            tenant: f.tenant,
            reference,
          }),
      ],
      [
        'beginRead',
        (reference: ModelInvocationRef) =>
          f.provider.runtime.consumption.beginRead({
            principal: f.principal,
            tenant: f.tenant,
            reference,
            operation: op('boundary-read'),
            result: settlement.version,
          }),
      ],
    ] as const
    for (const [action, probe] of probes) {
      expect(await probe('malformed' as ModelInvocationRef)).toEqual({
        failure: { kind: 'invalid', field: 'reference', reason: 'reference-syntax' },
      })
      expect(await probe(foreign)).toEqual({ failure: { kind: 'denied', action } })
    }
    expect(
      await f.provider.runtime.calls.inspect({
        principal: f.principal,
        tenant: structuredClone(f.tenant),
        reference: f.reference,
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'tenant' } })
    expect(recall).not.toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()
    expect(acquireRead).not.toHaveBeenCalled()
  } finally {
    await f.dispose()
  }
})

it('restores ACK identity through the operation reference and retains the original result and evidence', async () => {
  const f = runtimeFixture()
  try {
    const settlement = await settleRuntime(f, partialParts)
    const completion = proof(`${f.admit.call}/${settlement.version}`, 'consumer')
    const evidence = { kind: 'processed', completion } as const
    const saved = {
      reference: unbox(
        encodeModelOperationRef({
          tenant: f.tenant,
          call: f.admit.call,
          admission: f.admit.operation,
          operation: op('restored-ack'),
        }),
      ),
      result: settlement.version,
      evidence,
    }
    const restored = unbox(resolveModelOperationRef(saved.reference, f.tenant))
    const input = {
      principal: f.principal,
      tenant: restored.tenant,
      call: restored.call,
      operation: restored.operation,
      result: saved.result,
      evidence: saved.evidence,
    }
    const first = unbox(await f.provider.runtime.consumption.acknowledge(input))
    const repeated = unbox(await f.provider.runtime.consumption.acknowledge(input))
    expect(repeated.custody.operation).toBe(first.custody.operation)
    expect(repeated.result).toBe(saved.result)
    expect(repeated.custody.receipt).toEqual(completion)
  } finally {
    await f.dispose()
  }
})
