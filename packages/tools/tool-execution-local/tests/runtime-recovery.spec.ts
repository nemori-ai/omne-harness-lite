import { expect, test } from 'vitest'
import type { ResourceRecoveryResult } from '@omne-harness-lite/execution-environments'
import { at, ref, scope } from './execution-owner-fixture.ts'
import { recoveryFixture, resource } from './runtime-recovery-fixture.ts'

test.each([false, true])(
  'cold journal recovery ends started=%s without replay and retains original terminal/account coordinates',
  async started => {
    const f = await recoveryFixture({ started })
    try {
      await f.run()
      const history = await f.read()
      expect(f.f.implementation).not.toHaveBeenCalled()
      expect(f.recover).toHaveBeenCalledExactlyOnceWith(scope, f.authority, [resource])
      expect(history.resources.get(resource.key)?.observations.map(x => x.value.status)).toEqual([
        'confirmed',
      ])
      expect(history.terminal?.value).toMatchObject({
        terminal: { outcome: 'failed', code: 'abnormal_interruption' },
        account: {
          callId: ref.callId,
          initiator: scope.tenant,
          frames: 'unknown',
          cost: { total_usd: 'unknown' },
          wallClock: { startedAt: at, endedAt: at },
        },
        delivery: { pass: 'original-after-action', selectedChain: [] },
      })
      const tail = await f.log.readSince(scope.session, 0)
      await f.run()
      expect(await f.log.readSince(scope.session, 0)).toEqual(tail)
      expect(f.recover.mock.calls[1]?.[2]).toEqual([])
    } finally {
      await f.close()
    }
  },
)

test.each(['pending', 'unsupported'] as const)(
  'cold %s stop remains unconfirmed and retries the original receipt',
  async status => {
    const f = await recoveryFixture()
    f.recover.mockResolvedValueOnce([{ resource, status, evidence: { uncertainty: status } }])
    try {
      await expect(f.run()).rejects.toThrow('unconfirmed resource cleanup')
      const pending = await f.read()
      expect(pending.resources.get(resource.key)?.observations.at(-1)?.value).toMatchObject({
        status: 'unconfirmed',
        evidence: { uncertainty: status },
      })
      expect(pending.terminal).toBeUndefined()
      await f.run()
      expect(
        (await f.read()).resources.get(resource.key)?.observations.map(x => x.value.status),
      ).toEqual(['unconfirmed', 'confirmed'])
      expect(f.recover.mock.calls.map(call => call[2])).toEqual([[resource], [resource]])
      expect(f.f.implementation).not.toHaveBeenCalled()
    } finally {
      await f.close()
    }
  },
)

test('owned partial recovery preserves the original stop receipt before failure and never stops an adopted resource through the call', async () => {
  const f = await recoveryFixture({ adopted: true })
  f.recoverOwned.mockResolvedValueOnce({
    kind: 'recovered',
    values: [{ resource, status: 'pending', evidence: { original: true } }],
    failures: [{ provider: 'controlled', reason: 'unavailable' }],
  })
  try {
    await expect(f.run()).rejects.toThrow('owner recovery remains pending')
    expect(f.recover).not.toHaveBeenCalled()
    expect((await f.read()).resources.get(resource.key)?.observations.at(-1)?.value).toMatchObject({
      status: 'unconfirmed',
      evidence: { original: true },
    })
    f.recoverOwned.mockResolvedValue({
      kind: 'recovered',
      values: [{ resource, status: 'confirmedStopped', evidence: { original: true } }],
      failures: [],
    })
    await f.run()
    expect(f.recover).toHaveBeenCalledExactlyOnceWith(scope, f.authority, [])
    const tail = await f.log.readSince(scope.session, 0)
    await f.run()
    expect(await f.log.readSince(scope.session, 0)).toEqual(tail)
    expect((await f.read()).resources.get(resource.key)?.observations).toHaveLength(2)
  } finally {
    await f.close()
  }
})

test.each(['wrong-resource', 'invalid-status', 'missing-result'] as const)(
  'cold %s rejects before writing a stop or terminal',
  async mode => {
    const f = await recoveryFixture()
    const reports =
      mode === 'missing-result'
        ? []
        : [
            {
              resource: mode === 'invalid-status' ? resource : { ...resource, key: 'foreign' },
              status: mode === 'invalid-status' ? ['confirmedStopped'] : 'confirmedStopped',
            },
          ]
    f.recover.mockResolvedValueOnce(
      reports as unknown as ({ resource: typeof resource } & ResourceRecoveryResult)[],
    )
    try {
      await expect(f.run()).rejects.toThrow('Tool')
      const history = await f.read()
      expect(history.resources.get(resource.key)?.observations).toHaveLength(0)
      expect(history.terminal).toBeUndefined()
      expect(f.f.implementation).not.toHaveBeenCalled()
    } finally {
      await f.close()
    }
  },
)

test('owner recovery cannot create a receipt for an unplanned resource', async () => {
  const f = await recoveryFixture()
  f.recoverOwned.mockResolvedValueOnce({
    kind: 'recovered',
    values: [{ resource: { ...resource, key: 'foreign' }, status: 'confirmedStopped' }],
    failures: [],
  })
  try {
    await expect(f.run()).rejects.toThrow('original planned resource')
    expect(f.recover).not.toHaveBeenCalled()
    expect((await f.read()).resources.get(resource.key)?.observations).toHaveLength(0)
  } finally {
    await f.close()
  }
})

test.each(['enumerate', 'owner-generation', 'clock', 'receipt-unknown', 'tail-changed'] as const)(
  'recovery %s respects the original owner and durable retry boundary',
  async mode => {
    const f = await recoveryFixture()
    try {
      if (mode === 'enumerate')
        f.enumerate.mockResolvedValueOnce({ kind: 'rejected', reason: 'notAuthorized' })
      if (mode === 'owner-generation')
        f.readPrefix.mockResolvedValueOnce({
          kind: 'prefix',
          prefix: { scope, ownerGeneration: 'foreign', tail: 0, entries: [] },
        })
      if (mode === 'clock') f.now.mockReturnValueOnce('unavailable')
      if (mode === 'receipt-unknown')
        f.controlledJournal.commit.mockResolvedValueOnce({
          kind: 'rejected',
          reason: 'unavailable',
        })
      if (mode === 'tail-changed')
        f.controlledJournal.commit.mockResolvedValueOnce({
          kind: 'rejected',
          reason: 'tailChanged',
        })
      if (mode === 'tail-changed') {
        await f.run()
        expect(f.input.retry).toHaveBeenCalledExactlyOnceWith(0)
        expect((await f.read()).resources.get(resource.key)?.observations).toHaveLength(1)
      } else {
        await expect(f.run()).rejects.toThrow('Tool')
        expect((await f.read()).terminal).toBeUndefined()
        await f.run()
        expect((await f.read()).terminal?.value.terminal).toEqual({
          outcome: 'failed',
          code: 'abnormal_interruption',
        })
      }
      expect(f.f.implementation).not.toHaveBeenCalled()
    } finally {
      await f.close()
    }
  },
)
