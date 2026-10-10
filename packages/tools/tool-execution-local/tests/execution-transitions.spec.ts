import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import type {
  ToolJournalPayload,
  ToolExecutionRecords,
} from '@omne-harness-lite/tool-execution-runtime'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { createToolOriginalIssue } from '../src/original-issue.ts'
import { toolOriginalIssueMigrations } from '../src/original-issue-migrations.ts'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import { ref, request, scope } from './execution-owner-fixture.ts'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const close of cleanup.splice(0)) await close()
})
const contextRead = (
  readIndex: number,
): Extract<ToolJournalPayload, { kind: 'execution_context_read' }> => ({
  kind: 'execution_context_read',
  revision: 1,
  ref,
  readIndex,
  values: [],
})
async function fixture(issued = true) {
  const dir = await mkdtemp(join(tmpdir(), 'omne-native-tool-transitions-'))
  const log = await openSqlLogFixture({ dir })
  cleanup.push(async () => {
    await log.close()
    await rm(dir, { recursive: true, force: true })
  })
  for (const fragment of toolOriginalIssueMigrations)
    await log.fixtureStorage.write(tx => fragment.migration.up(tx.db))
  await log.fixturePrefix(scope)
  let open = true
  const appendIn = vi.fn(log.participant.appendIn)
  const original = createToolOriginalIssue({
    support: {
      storage: log.fixtureStorage,
      log: {
        sourceIn: log.participant.sourceIn,
        readByKeyIn: log.participant.readByKeyIn,
        appendIn,
      },
      access: log.fixtureAccess,
      current: { authorizeIn: async () => ({ kind: 'authorized' }) },
      admission: {
        admitOriginal: async () => ({ kind: 'denied' }),
        consumeOriginal: async () => ({ kind: 'denied' }),
      },
    },
    generation: 'native-transition-owner',
    expected: { scope, tail: 0, ownerGeneration: 'actual-fixture-backing' },
    value: {
      kind: 'execution_intended',
      revision: 1,
      ref,
      origin: request.origin,
      input: { submission: { adoption: request.adoption } },
    },
    stopped: new Promise<void>(() => {}),
    isOpen: () => open,
    isRetained: () => open,
  })
  if (issued)
    await log.fixtureStorage.atomic(async unit => {
      expect(await original.participant.stageOriginalIn(unit)).toHaveProperty('kind', 'staged')
    })
  return {
    log,
    original,
    appendIn,
    closeAdmission() {
      open = false
    },
  }
}

test('stages an original Tool transition in the caller unit without complete Session capabilities', async () => {
  const f = await fixture()
  const atomic = vi.spyOn(f.log.fixtureStorage, 'atomic')
  const result = await f.log.fixtureStorage.atomic(unit =>
    f.original.records.stageTransitionIn(unit, f.original.job, [contextRead(1)]),
  )
  expect(result).toEqual({ kind: 'staged', positions: [2] })
  expect(atomic).toHaveBeenCalledTimes(1)
  const found = await f.log.fixtureStorage.atomic(unit =>
    f.original.records.readOriginalIn(unit, ref),
  )
  expect(found).toHaveProperty('history.contextReads.0.value.readIndex', 1)
})

test('recognizes the same transition and refuses a different payload at its original key', async () => {
  const f = await fixture()
  const stage = (values: Parameters<ToolExecutionRecords['stageTransitionIn']>[2]) =>
    f.log.fixtureStorage.atomic(unit =>
      f.original.records.stageTransitionIn(unit, f.original.job, values),
    )
  expect(await stage([contextRead(1)])).toEqual({ kind: 'staged', positions: [2] })
  expect(await stage([contextRead(1)])).toEqual({ kind: 'recognized', positions: [2] })
  const altered = {
    ...contextRead(1),
    values: [
      {
        key: 'actual-source',
        revision: '1',
        value: 'different',
        observedAt: '2026-01-01T00:00:00Z',
      },
    ],
  }
  expect(await stage([altered as never])).toHaveProperty('kind', 'conflict')
  expect(await stage([contextRead(2)])).toEqual({ kind: 'staged', positions: [3] })
})

test('a later caller failure rolls back every staged transition and preserves the original job', async () => {
  const f = await fixture()
  await expect(
    f.log.fixtureStorage.atomic(async unit => {
      expect(
        await f.original.records.stageTransitionIn(unit, f.original.job, [
          contextRead(1),
          contextRead(2),
        ]),
      ).toEqual({ kind: 'staged', positions: [2, 3] })
      throw new Error('later caller rollback')
    }),
  ).rejects.toThrow('later caller rollback')
  expect(
    await f.log.fixtureStorage.atomic(unit =>
      f.original.records.stageTransitionIn(unit, f.original.job, [contextRead(1)]),
    ),
  ).toEqual({ kind: 'staged', positions: [2] })
})

test('a lost actual commit return is recognized without another append', async () => {
  const f = await fixture()
  const originalAtomic = f.log.fixtureStorage.atomic.bind(f.log.fixtureStorage)
  const lost = vi.spyOn(f.log.fixtureStorage, 'atomic').mockImplementationOnce(async work => {
    await originalAtomic(work)
    throw new StorageUnavailable('actual return lost')
  })
  await expect(
    f.log.fixtureStorage.atomic(unit =>
      f.original.records.stageTransitionIn(unit, f.original.job, [contextRead(1)]),
    ),
  ).rejects.toThrow(StorageUnavailable)
  lost.mockRestore()
  const count = f.appendIn.mock.calls.length
  expect(
    await f.log.fixtureStorage.atomic(unit =>
      f.original.records.stageTransitionIn(unit, f.original.job, [contextRead(1)]),
    ),
  ).toEqual({ kind: 'recognized', positions: [2] })
  expect(f.appendIn).toHaveBeenCalledTimes(count)
})

test('a partial batch conflicts and a complete new batch recognizes every original position', async () => {
  const f = await fixture()
  const stage = (values: Parameters<ToolExecutionRecords['stageTransitionIn']>[2]) =>
    f.log.fixtureStorage.atomic(unit =>
      f.original.records.stageTransitionIn(unit, f.original.job, values),
    )
  expect(await stage([contextRead(1)])).toEqual({ kind: 'staged', positions: [2] })
  const count = f.appendIn.mock.calls.length
  expect(await stage([contextRead(1), contextRead(2)])).toEqual({ kind: 'conflict' })
  expect(f.appendIn).toHaveBeenCalledTimes(count)
  expect(await stage([contextRead(2), contextRead(3)])).toEqual({
    kind: 'staged',
    positions: [3, 4],
  })
  expect(await stage([contextRead(2), contextRead(3)])).toEqual({
    kind: 'recognized',
    positions: [3, 4],
  })
})

test('copied jobs, unissued originals and foreign call records cannot stage transitions', async () => {
  const f = await fixture(false)
  const invoke = (job = f.original.job, value = contextRead(1)) =>
    f.log.fixtureStorage.atomic(unit => f.original.records.stageTransitionIn(unit, job, [value]))
  expect(await invoke()).toEqual({ kind: 'invalidSource' })
  expect(await invoke({ ...f.original.job })).toEqual({ kind: 'invalidSource' })
  expect(
    await invoke(f.original.job, {
      ...contextRead(1),
      ref: { ...ref, callId: 'foreign' as typeof ref.callId },
    }),
  ).toEqual({ kind: 'invalidSource' })
  expect(f.appendIn).not.toHaveBeenCalled()
})

test('out-of-order transitions are refused before append and a foreign storage unit remains a defect', async () => {
  const f = await fixture(),
    other = await fixture()
  const count = f.appendIn.mock.calls.length
  expect(
    await f.log.fixtureStorage.atomic(unit =>
      f.original.records.stageTransitionIn(unit, f.original.job, [contextRead(2)]),
    ),
  ).toEqual({ kind: 'conflict' })
  expect(f.appendIn).toHaveBeenCalledTimes(count)
  await expect(
    other.log.fixtureStorage.atomic(unit =>
      f.original.records.stageTransitionIn(unit, f.original.job, [contextRead(1)]),
    ),
  ).rejects.toThrow()
})

test('closing the native owner revokes new transition staging', async () => {
  const f = await fixture()
  f.closeAdmission()
  expect(
    await f.log.fixtureStorage.atomic(unit =>
      f.original.records.stageTransitionIn(unit, f.original.job, [contextRead(1)]),
    ),
  ).toEqual({ kind: 'unavailable' })
})

test('the original terminal is read by exact identity after closing admission', async () => {
  const f = await fixture()
  const ended: Extract<ToolJournalPayload, { kind: 'execution_ended' }> = {
    kind: 'execution_ended',
    revision: 1,
    ref,
    terminal: { outcome: 'unavailable', reason: 'test-owner-stopped' },
    delivery: {
      result: {
        id: unwrap(parseOpaqueIdentifier('original-result', 'BlockId')),
        kind: 'tool_result',
        callId: ref.callId,
        outcome: 'unavailable',
        visibility: { toHuman: true, toModel: true },
        blocks: [],
      },
      pass: 'original-pass',
      selectedChain: [],
    },
    account: {
      callId: ref.callId,
      initiator: ref.tenant,
      externalEffect: 'unknown',
      cost: { total_usd: 0, items: [] },
      frames: 'unknown',
      wallClock: { startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:00:00Z' },
      late: true,
    },
  }
  const staged = await f.log.fixtureStorage.atomic(unit =>
    f.original.records.stageTransitionIn(unit, f.original.job, [ended]),
  )
  expect(staged).toEqual({ kind: 'staged', positions: [2] })
  f.closeAdmission()
  const identity = f.original.participant.identity
  const read = await f.log.fixtureStorage.atomic(unit =>
    f.original.records.terminalIn(unit, identity),
  )
  expect(read).toHaveProperty('terminal.value', ended)
  expect(
    await f.log.fixtureStorage.atomic(unit =>
      f.original.records.terminalIn(unit, { ...identity, executionGeneration: 'copied-owner' }),
    ),
  ).toEqual({ kind: 'invalidSource' })
})
