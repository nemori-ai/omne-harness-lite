import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import {
  isJsonNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type {
  ObserverDiagnostic,
  ObserverScope,
  SettlementLogBinding,
} from '@omne-harness-lite/model-request-runtime'
import {
  createAcknowledgementCustody,
  createCallContainerStore,
  createModelCallContentStore,
  createModelObserverQueue,
  createSettlementCoordinator,
  createSettlementWork,
  modelCallContentMigrations,
  type SettlementStagedBatch,
} from '@omne-harness-lite/model-request-runtime-local'
import type { SessionLog } from '@omne-harness-lite/session-log'
import { composeMigrations } from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import {
  closeAll,
  contention,
  identifier,
  NativeSettlementOwner,
  observerHost,
  scheduler,
  settlementExpectation,
  StageStorage,
} from './observer-settlement-boundary-fixture.ts'

function orderedJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(orderedJson)
  if (value !== null && typeof value === 'object' && !isJsonNumber(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, member]) => [key, orderedJson(member)]),
    )
  }
  return value
}

function expectJson(actual: unknown, expected: unknown) {
  const actualJson = readJsonStrict(writeJsonLossless(actual))
  const expectedJson = readJsonStrict(writeJsonLossless(expected))
  expect(actualJson).toStrictEqual(expectedJson)
  if ('failed' in actualJson || 'failed' in expectedJson) throw new Error('invalid fixture JSON')
  expect(writeJsonLossless(orderedJson(actualJson.ok))).toStrictEqual(
    writeJsonLossless(orderedJson(expectedJson.ok)),
  )
}

for (const reason of ['observer_scope_mismatch', 'unavailable'] as const) {
  test(`observer discards both queued events after delivery authorization becomes ${reason}`, async () => {
    const scope: ObserverScope = {
      session: identifier('session-1', 'SessionRef'),
      tenant: {
        organization: identifier('org-1', 'OrganizationId'),
        account: identifier('account-1', 'AccountId'),
      },
      target: { kind: 'model_call', callId: 'call-1', dispatch: 1 },
    }
    const snapshot = { blocks: [], position: 0 }
    const event = { t: 'finish', reason: 'end' } as const
    const expectedReceived = [writeJsonLossless({ scope, kind: 'snapshot', snapshot })]
    const bytes = [1, 2].map(
      position =>
        new TextEncoder().encode(writeJsonLossless({ scope, kind: 'event', position, event }))
          .byteLength,
    )
    const expectedDiagnostics = [1, 2].map((position, index) => ({
      session: scope.session,
      tenant: scope.tenant,
      callId: 'call-1',
      dispatch: 1,
      stage: 'delivery',
      reason,
      position,
      bufferedEvents: 2 - index,
      bufferedBytes: bytes.slice(index).reduce((sum, count) => sum + count, 0),
    }))
    const host = observerHost(scope)
    const diagnostics: ObserverDiagnostic[] = []
    const queue = createModelObserverQueue({
      scope,
      authorization: host.authorization,
      receiver: host.receiver,
      maxBufferedEvents: 4,
      maxBufferedBytes: 10000,
      diagnostic: diagnostic => diagnostics.push(diagnostic),
    })
    try {
      expect(queue.start(snapshot)).toStrictEqual({ accepted: true })
      expect(queue.offer(event, { ...snapshot, position: 1 })).toStrictEqual({ accepted: true })
      expect(queue.offer(event, { ...snapshot, position: 2 })).toStrictEqual({ accepted: true })
      host.revoke(reason)
      host.finish()
      await host.deliveryRecheck
      expect(host.received).toStrictEqual(expectedReceived)
      expectJson(diagnostics, expectedDiagnostics)
      expect(queue.offer(event, { ...snapshot, position: 3 })).toStrictEqual({
        rejected: { reason: 'consumer_failed' },
      })
      await host.receiver.stopped
      expect(await queue.close()).toStrictEqual({ released: true })
      expect(await queue.close()).toStrictEqual({ released: true })
      expect(host.state()).toStrictEqual({ active: 0, stopCalls: 1 })
    } finally {
      await closeAll([
        () => host.close(),
        async () => {
          expect(await queue.close()).toStrictEqual({ released: true })
        },
        async () => {
          expect(await host.authorization.close()).toStrictEqual({ released: true })
        },
        async () => {
          expect(host.state()).toStrictEqual({ active: 0, stopCalls: 1 })
        },
      ])
    }
  })
}

async function journalFixture() {
  const expected = settlementExpectation()
  const dir = await mkdtemp(join(tmpdir(), 'observer-settlement-boundaries-'))
  const log = await openSqlLogFixture({ dir: join(dir, 'log') })
  const owner = new NativeSettlementOwner()
  const appends: Parameters<SessionLog['append']>[] = []
  let refuseAppend = false
  const port: SessionLog = {
    readSince: (...args) => log.readSince(...args),
    readByKey: (...args) => log.readByKey(...args),
    async append(...args) {
      appends.push(args)
      if (refuseAppend) {
        refuseAppend = false
        throw new Error('settlement append refused')
      }
      return await log.append(...args)
    },
  }
  const generation = Object.freeze({})
  const binding: SettlementLogBinding = {
    session: expected.session,
    tenant: expected.tenant,
    log: port,
    readPrefix: () =>
      log.fixturePrefix({ session: expected.session, tenant: expected.tenant }, port),
    originalIssue: log.fixtureOriginalIssue,
    generation,
    currentGeneration: () => generation,
  }
  try {
    const result = await log.append(
      expected.session,
      expected.anchors,
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    if ('failure' in result) throw new Error('legal anchor append failed')
    expectJson(await log.readSince(expected.session, 0), expected.journal)
  } catch (error) {
    await closeAll([() => log.close(), () => rm(dir, { recursive: true, force: true })])
    throw error
  }
  return {
    expected,
    dir,
    log,
    owner,
    binding,
    appends,
    refuseAppend: () => {
      refuseAppend = true
    },
    disarm: () => {
      refuseAppend = false
    },
    close: () =>
      closeAll([
        () => owner.drain(),
        () => log.close(),
        () => rm(dir, { recursive: true, force: true }),
      ]),
  }
}

for (const scenario of [
  {
    name: 'recovers the committed generation after a lost stage receipt',
    stage: 'commit',
    reads: 1,
  },
  {
    name: 'retains an unreadable generation until the actual row can be recognized',
    stage: 'commit',
    reads: 2,
  },
  { name: 'ends a refused stage after real readback proves absence', stage: 'refuse', reads: 1 },
] as const) {
  test(`settlement work ${scenario.name}`, async () => {
    const fixture = await journalFixture()
    const { expected, binding, owner, dir } = fixture
    try {
      const physical = await openStorage({
        dialect: 'sqlite',
        file: join(dir, 'content.sqlite'),
        synchronous: 'full',
        upgrade: false,
        migrations: composeMigrations(modelCallContentMigrations('sqlite')),
      })
      try {
        const storage = new StageStorage(physical)
        const content = createModelCallContentStore({
          storage,
          policy: { maxConcurrentWrites: 4, maxContentBytes: 1000000 },
        })
        const calls = createCallContainerStore()
        const custody = createAcknowledgementCustody({
          calls,
          content,
          scheduler,
          policy: { next: () => ({ stop: true }) },
          diagnostic() {},
        })
        const retireInputs: Parameters<typeof custody.retireWork>[0][] = []
        const stageInputs: Parameters<typeof content.work.stage>[0][] = []
        const ref = { session: expected.session, callId: 'mc_19f3' }
        const work = createSettlementWork({
          binding,
          owner,
          store: {
            ...content.work,
            async stage(input) {
              stageInputs.push(input)
              return await content.work.stage(input)
            },
          },
          custody: {
            retireWork: async input => {
              retireInputs.push(input)
              return await custody.retireWork(input)
            },
          },
          instance: 'runtime-c4-e',
          ref,
          request: expected.request,
          contention,
          scheduler,
          diagnostic() {},
        })
        const key = { binding, call: 'mc_19f3', response: 'resp_4c1e9a' }
        const expectedRow = {
          work: {
            workId: work.workId,
            generation: 1,
            owner: 'runtime-c4-e',
            staged: expected.staged,
          },
        }
        try {
          storage.arm(scenario.stage, scenario.reads)
          const result = await work.advance()
          if (scenario.reads === 2) {
            expect(result).toStrictEqual({ retained: true })
            expect(result).not.toHaveProperty('ended')
            expect(retireInputs).toStrictEqual([])
            storage.disarm()
            expectJson(await content.work.read(key), expectedRow)
            expect(await work.advance()).toStrictEqual({ ended: true })
          } else {
            expect(result).toStrictEqual({ ended: true })
            expect(result).not.toHaveProperty('settled')
          }
          expect(await content.work.read(key)).toStrictEqual({ absent: true })
          expect(stageInputs.map(input => input.binding)).toStrictEqual([binding])
          expectJson(
            stageInputs.map(({ binding: _binding, ...input }) => input),
            [
              {
                call: 'mc_19f3',
                response: 'resp_4c1e9a',
                workId: work.workId,
                owner: 'runtime-c4-e',
                staged: expected.staged,
              },
            ],
          )
          expect({
            stageAttempts: storage.stageAttempts,
            stageCommits: storage.stageCommits,
            readRefusals: storage.readRefusals,
          }).toStrictEqual({
            stageAttempts: 1,
            stageCommits: scenario.stage === 'commit' ? 1 : 0,
            readRefusals: scenario.reads,
          })
          expect(retireInputs).toStrictEqual(
            scenario.stage === 'commit'
              ? [
                  {
                    binding,
                    ref,
                    response: 'resp_4c1e9a',
                    workId: work.workId,
                    generation: 1,
                  },
                ]
              : [],
          )
          expect(fixture.appends).toStrictEqual([])
          expectJson(await fixture.log.readSince(expected.session, 0), expected.journal)
          expect({ active: owner.active, running: owner.running }).toStrictEqual({
            active: 0,
            running: 0,
          })
        } finally {
          storage.disarm()
          await closeAll([
            async () => {
              await work.advance()
            },
            async () => {
              expect(await work.close()).toStrictEqual(true)
            },
            async () => {
              expect(await custody.close()).toStrictEqual({ released: true })
            },
            async () => {
              expect(await calls.close()).toStrictEqual({ released: true })
            },
            async () => {
              expect(await content.close()).toStrictEqual({ released: true })
            },
            () => owner.drain(),
          ])
        }
      } finally {
        await physical.close()
      }
    } finally {
      await fixture.close()
    }
  })
}

test('coordinator refuses a native failed hold before any settlement append', async () => {
  const fixture = await journalFixture()
  const { expected, binding, owner } = fixture
  const holdInputs: SettlementStagedBatch[] = []
  const holdTasks: Promise<never>[] = []
  let holdActive = 0
  const coordinator = createSettlementCoordinator({
    binding,
    owner,
    settlementContention: contention,
    settlementScheduler: scheduler,
    diagnostic() {},
  })
  const handle = coordinator.settle({
    ...expected.request,
    staging: {
      hold(batch) {
        holdInputs.push(batch)
        holdActive++
        const attempt = Promise.resolve()
          .then(() => {
            throw new Error('native hold refused')
          })
          .finally(() => {
            holdActive--
          })
        holdTasks.push(attempt)
        return attempt
      },
    },
  })
  try {
    const result = await handle.completion
    expect(result).toStrictEqual({ unavailable: true, reason: 'staging' })
    expect(result).not.toHaveProperty('settled')
    expectJson(holdInputs, [expected.staged])
    expect(fixture.appends).toStrictEqual([])
    expectJson(await fixture.log.readSince(expected.session, 0), expected.journal)
    expect(await handle.stopped).toStrictEqual(undefined)
    expect(await coordinator.close()).toStrictEqual(undefined)
    expect({
      active: owner.active,
      running: owner.running,
      releases: owner.releases,
      holdActive,
    }).toStrictEqual({ active: 0, running: 0, releases: 1, holdActive: 0 })
  } finally {
    fixture.disarm()
    handle.requestStop()
    await closeAll([
      async () => {
        await Promise.allSettled([handle.completion, handle.stopped, ...holdTasks])
      },
      async () => {
        expect(await coordinator.close()).toStrictEqual(undefined)
      },
      async () => {
        expect(holdActive).toStrictEqual(0)
      },
      () => fixture.close(),
    ])
  }
})

test('coordinator retains the original unknown append until the same source proves absence', async () => {
  const fixture = await journalFixture()
  const { expected, binding, owner } = fixture
  const expectedAppends = [
    [expected.session, expected.entries, { kind: 'unfenced' }, { kind: 'unconditional' }],
  ]
  const coordinator = createSettlementCoordinator({
    binding,
    owner,
    settlementContention: contention,
    settlementScheduler: scheduler,
    diagnostic() {},
  })
  fixture.refuseAppend()
  const handle = coordinator.settle(expected.request)
  try {
    const result = await handle.completion
    expect(result).toStrictEqual({ unavailable: true, reason: 'write_unknown' })
    expect(result).not.toHaveProperty('settled')
    expectJson(fixture.appends, expectedAppends)
    expect(await handle.stopped).toStrictEqual(undefined)
    expect({
      active: owner.active,
      running: owner.running,
      releases: owner.releases,
    }).toStrictEqual({ active: 1, running: 0, releases: 0 })
    expectJson(await fixture.log.readSince(expected.session, 0), expected.journal)
    expect(await coordinator.close()).toStrictEqual(undefined)
    expect({
      active: owner.active,
      running: owner.running,
      releases: owner.releases,
    }).toStrictEqual({ active: 0, running: 0, releases: 1 })
    expectJson(fixture.appends, expectedAppends)
    expectJson(await fixture.log.readSince(expected.session, 0), expected.journal)
  } finally {
    fixture.disarm()
    handle.requestStop()
    await closeAll([
      async () => {
        await Promise.allSettled([handle.completion, handle.stopped])
      },
      async () => {
        expect(await coordinator.close()).toStrictEqual(undefined)
      },
      () => fixture.close(),
    ])
  }
})
