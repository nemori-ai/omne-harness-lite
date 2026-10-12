import { afterEach, expect, test, vi } from 'vitest'
import { narrow } from '@omne-harness-lite/storage'
import { at, ref, request } from './execution-owner-fixture.ts'
import { resource } from './runtime-recovery-fixture.ts'
import { nativeRuntimeFixture } from './native-runtime-fixture.ts'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close()
})

test('native construction reads an empty task index without borrowing or enumerating Sessions', async () => {
  const f = await nativeRuntimeFixture(cleanup)
  const read = vi.spyOn(f.log.fixtureStorage, 'read')
  const pool = f.start()
  await pool.ready
  expect(read).toHaveBeenCalled()
  expect(f.borrow).not.toHaveBeenCalled()
  expect(f.enumerate).not.toHaveBeenCalled()
  expect(f.recoverOwned).not.toHaveBeenCalled()
  await pool.close()
})

test('cold queued originals receive one failed terminal with original identity and no author call', async () => {
  const f = await nativeRuntimeFixture(cleanup)
  await f.seed()
  await f.reopen()
  const pool = f.start()
  await pool.ready
  const result = await f.history()
  expect(result.kind).toBe('found')
  if (result.kind !== 'found') return
  expect(result.history.started).toBeUndefined()
  expect(result.history.terminal?.value.terminal).toMatchObject({
    outcome: 'failed',
    code: 'abnormal_interruption',
  })
  expect(result.history.terminal?.value.account).toMatchObject({
    late: true,
    cost: { total_usd: 'unknown' },
  })
  expect(result.history.intent.value.origin).toEqual(request.origin)
  expect(f.support.classifyTerminalIn).toHaveBeenCalledTimes(1)
  expect(f.unused).not.toHaveBeenCalled()
  expect(f.enumerate).not.toHaveBeenCalled()
  await pool.close()
})

test.each(['pending', 'unsupported'] as const)(
  'native cold %s resource blocks readiness and preserves the original receipt',
  async status => {
    const f = await nativeRuntimeFixture(cleanup)
    const original = await f.seed()
    const staged = await f.support.storage.atomic(unit =>
      original.records.stageTransitionIn(unit, original.job, [
        { kind: 'resource_planned', revision: 1, ref, resource },
      ]),
    )
    expect(staged.kind).toBe('staged')
    await f.reopen()
    f.recover.mockResolvedValueOnce([{ resource, status, evidence: { pending: true } }])
    const pool = f.start()
    await expect(pool.ready).rejects.toThrow('unconfirmed resource cleanup')
    const incomplete = await f.history()
    if (incomplete.kind !== 'found') throw new Error('original missing')
    expect(incomplete.history.terminal).toBeUndefined()
    expect(
      incomplete.history.resources.get(resource.key)?.observations.at(-1)?.value,
    ).toMatchObject({ status: 'unconfirmed', evidence: { pending: true } })
    // Close retries this owner's retained recovery obligation without reissuing the tool.
    await pool.close()
    const completed = await f.history()
    if (completed.kind !== 'found') throw new Error('original missing')
    expect(
      completed.history.resources.get(resource.key)?.observations.map(value => value.value.status),
    ).toEqual(['unconfirmed', 'confirmed'])
    expect(completed.history.terminal?.value.terminal).toMatchObject({
      code: 'abnormal_interruption',
    })
    expect(f.unused).not.toHaveBeenCalled()
  },
)

test('cold terminal originals remain unchanged across another owner', async () => {
  const f = await nativeRuntimeFixture(cleanup)
  const original = await f.seed()
  const recognized = await f.support.storage.atomic(unit =>
    original.participant.stageOriginalIn(unit),
  )
  expect(recognized.kind).toBe('alreadyIssued')
  // The original handle owns its actual claim; no reconstructed owner can obtain one.
  const source = await original.recordStatus()
  expect(source).toBe('known')
  await f.reopen()
  const first = f.start()
  await first.ready
  await first.close()
  const before = await f.history()
  const second = f.start()
  await second.ready
  expect(await f.history()).toEqual(before)
  await second.close()
  expect(f.unused).not.toHaveBeenCalled()
})

test('a malformed original index blocks native readiness instead of becoming an empty recovery', async () => {
  const f = await nativeRuntimeFixture(cleanup)
  await f.seed()
  await f.support.storage.write(tx =>
    narrow<{ tool_original_issue: { identity: string } }>(tx)
      .updateTable('tool_original_issue')
      .set({ identity: '{}' })
      .execute(),
  )
  const pool = f.start()
  await expect(pool.ready).rejects.toThrow('snapshot unavailable')
  await expect(pool.close()).rejects.toThrow('snapshot unavailable')
  expect(f.unused).not.toHaveBeenCalled()
  expect(f.enumerate).not.toHaveBeenCalled()
})

test.each([false, true])(
  'cold original started with waiting=%s ends without resuming the author',
  async waiting => {
    const f = await nativeRuntimeFixture(cleanup)
    const original = await f.seed()
    const consumed = await f.support.storage.atomic(unit =>
      original.participant.consumeOriginalIn(unit, original.claim),
    )
    expect(consumed.kind).toBe('staged')
    if (waiting) {
      const recorded = await f.support.storage.atomic(unit =>
        original.records.stageTransitionIn(unit, original.job, [
          {
            kind: 'execution_waiting',
            revision: 1,
            ref,
            waitIndex: 1,
            request: { prompt: 'Continue?', answerSchema: { type: 'boolean' } },
          },
        ]),
      )
      expect(recorded.kind).toBe('staged')
    }
    await f.reopen()
    const pool = f.start()
    await pool.ready
    const recovered = await f.history()
    if (recovered.kind !== 'found') throw new Error('original missing')
    expect(recovered.history.started?.value.at).toBe(at)
    expect(recovered.history.terminal?.value.terminal).toMatchObject({
      code: 'abnormal_interruption',
    })
    expect(recovered.history.answers.size).toBe(0)
    expect(f.unused).not.toHaveBeenCalled()
    await pool.close()
  },
)
