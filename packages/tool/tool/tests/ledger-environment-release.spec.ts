import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ReleaseProgress, ToolEnvironment } from '@omne-harness/tool-contract'
import type { ToolAccessGuard } from '@omne-harness/tool'
import { settlementFixture, refProcess } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import {
  evidence,
  failure,
  ok,
  operationId,
  principalB,
  tenantB,
  type Principal,
} from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

function firstPreparation(f: Awaited<ReturnType<typeof settlementFixture>>) {
  const preparation = f.before.preparations[0]
  if (preparation === undefined) throw new Error('fixture missing preparation')
  return preparation
}

async function releasedFixture(inspect?: ToolEnvironment<Principal, unknown>['inspectRelease']) {
  const f = await settlementFixture(
    inspect === undefined ? {} : { wrapReleaseInspection: () => ({ inspectRelease: inspect }) },
  )
  ok(await f.preserve())
  const recovery = await f.load()
  const task = recovery.tasks.find(task => task.kind === 'release')
  if (task?.kind !== 'release') throw new Error('fixture missing release')
  const preparation = f.before.preparations.find(
    item => item.operation === task.release.preparation,
  )
  if (preparation === undefined) throw new Error('fixture missing preparation')
  const plan = {
    ...f.access,
    operation: operationId('public-plan'),
    preparation,
    custody: task.release.custody,
  }
  const record = (name: string, outcome: ReleaseProgress, release = task.release) =>
    f.ledger.commands.recordRelease({ ...f.access, operation: operationId(name), release, outcome })
  return { ...f, release: task.release, plan, record }
}

function accessGate() {
  const entered = Promise.withResolvers<void>()
  const resumed = Promise.withResolvers<void>()
  let armed = false
  return {
    arm: () => {
      armed = true
    },
    entered: entered.promise,
    resume: resumed.resolve,
    wrapAccess: (access: ToolAccessGuard<Principal>): ToolAccessGuard<Principal> => ({
      qualify: async input => {
        const verdict = await access.qualify(input)
        if (armed && input.action === 'write') {
          armed = false
          entered.resolve()
          await resumed.promise
        }
        return verdict
      },
    }),
  }
}

describe('canonical environment cleanup ledger', () => {
  it('fixes preparation and custody before awaiting current qualification', async () => {
    const gate = accessGate()
    const f = await settlementFixture({ wrapAccess: gate.wrapAccess })
    ok(await f.preserve())
    const task = (await f.load()).tasks.find(task => task.kind === 'release')
    if (task?.kind !== 'release') throw new Error('fixture missing release')
    const original = {
      ...f.access,
      operation: operationId('fixed-plan'),
      preparation: firstPreparation(f),
      custody: task.release.custody,
    }
    const input = {
      ...original,
      preparation: { ...original.preparation, request: { ...original.preparation.request } },
      custody: { ...original.custody },
    }
    const before = (await f.records()).filter(row => row.kind === 'result')
    gate.arm()
    const pending = f.ledger.commands.planRelease(input)
    await gate.entered
    input.preparation.request.command = 'replaced-during-qualification'
    input.preparation = { ...input.preparation, operation: operationId('replaced-preparation') }
    input.custody.record = 'replaced-custody'
    gate.resume()
    expect(ok(await pending)).toEqual(task.release)
    expect(ok(await f.ledger.commands.planRelease(original))).toEqual(task.release)
    expect(failure(await f.ledger.commands.planRelease(input)).kind).toBe('conflict')
    expect(
      failure(await f.ledger.commands.planRelease({ ...original, principal: principalB })).kind,
    ).toBe('denied')
    expect((await f.records()).filter(row => row.kind === 'environment-release')).toHaveLength(1)
    expect((await f.load()).tasks.filter(task => task.kind === 'release')).toEqual([task])
    expect((await f.records()).filter(row => row.kind === 'result')).toEqual(before)
  })

  it('recognizes one plan across new operations, original replay and completed cleanup', async () => {
    const f = await releasedFixture()
    expect(ok(await f.ledger.commands.planRelease(f.plan))).toEqual(f.release)
    expect(
      ok(await f.ledger.commands.planRelease({ ...f.plan, operation: f.release.operation })),
    ).toEqual(f.release)
    const original = (await f.records()).find(
      row => row.kind === 'operation' && row.operation.operation === f.release.operation,
    )
    const before = (await f.records()).filter(row => row.kind === 'result')
    const actual = ok(await f.environment.release({ ...f.access, release: f.release }))
    if (actual.kind !== 'released') throw new Error('fixture environment did not release')
    const receipt = ok(await f.record('confirm', actual))
    const after = await f.load()
    expect(after.tasks.some(task => task.kind === 'release')).toBe(false)
    expect(ok(await f.record('confirm', actual))).toEqual(receipt)
    expect(
      ok(
        await f.ledger.commands.planRelease({ ...f.plan, operation: operationId('after-release') }),
      ),
    ).toEqual(f.release)
    expect(ok(await f.ledger.commands.planRelease(f.plan))).toEqual(f.release)
    expect((await f.load()).tasks.some(task => task.kind === 'release')).toBe(false)
    expect((await f.records()).filter(row => row.kind === 'environment-release')).toHaveLength(1)
    expect((await f.records()).filter(row => row.kind === 'result')).toEqual(before)
    expect(
      (await f.records()).find(
        row => row.kind === 'operation' && row.operation.operation === f.release.operation,
      ),
    ).toEqual(original)
    expect(after.state.effect).toEqual(f.final.effect)
    expect(after.state.delivery).toEqual((await f.load()).state.delivery)
  })

  it.each(['custody', 'preparation', 'request', 'adoption'] as const)(
    'rejects changed %s and operation reuse',
    async field => {
      const f = await releasedFixture()
      ok(await f.ledger.commands.planRelease(f.plan))
      const changes = {
        custody: { ...f.plan, custody: evidence('wrong') },
        preparation: {
          ...f.plan,
          preparation: { ...f.plan.preparation, operation: operationId('wrong') },
        },
        request: {
          ...f.plan,
          preparation: {
            ...f.plan.preparation,
            request: { ...f.plan.preparation.request, timeout: 'wrong' },
          },
        },
        adoption: {
          ...f.plan,
          preparation: {
            ...f.plan.preparation,
            adoption: { ...f.plan.preparation.adoption, owner: 'wrong' },
          },
        },
      }
      expect(failure(await f.ledger.commands.planRelease(changes[field])).kind).toBe('conflict')
      expect(
        failure(
          await f.ledger.commands.planRelease({
            ...changes[field],
            operation: operationId('new-wrong'),
          }),
        ).kind,
      ).toBe('invalid')
    },
  )

  it.each(['failed', 'interrupted'] as const)(
    'blocks public planning for %s even without process history',
    async terminal => {
      const f = await settlementFixture({
        terminal:
          terminal === 'failed'
            ? { kind: 'failed', cause: 'executor', diagnostic: 'failed' }
            : { kind: 'interrupted', cause: { kind: 'foreground-limit' } },
      })
      ok(await f.preserve())
      const rows = await f.records()
      const result = rows.find(row => row.kind === 'result')
      if (result?.kind !== 'result' || result.result.custody.kind !== 'execution')
        throw new Error('fixture result')
      expect(
        failure(
          await f.ledger.commands.planRelease({
            ...f.access,
            operation: operationId('forbidden-plan'),
            preparation: firstPreparation(f),
            custody: result.result.custody.retained,
          }),
        ).kind,
      ).toBe('unsupported')
      expect((await f.load()).tasks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'settle', state: 'blocked' }),
          expect.objectContaining({ kind: 'facts' }),
        ]),
      )
      expect((await f.records()).some(row => row.kind === 'environment-release')).toBe(false)
    },
  )

  it('rechecks every historical process reference rather than current projection', async () => {
    const f = await settlementFixture({
      process: raw => [
        refProcess('lost', '1'),
        {
          ...refProcess('last', '2'),
          content: { ...refProcess('last').content, ref: raw.content },
        },
      ],
    })
    ok(await f.preserve())
    const result = (await f.records()).find(row => row.kind === 'result')
    if (result?.kind !== 'result' || result.result.custody.kind !== 'execution')
      throw new Error('fixture result')
    expect(
      failure(
        await f.ledger.commands.planRelease({
          ...f.access,
          operation: operationId('incomplete-plan'),
          preparation: firstPreparation(f),
          custody: result.result.custody.retained,
        }),
      ).kind,
    ).toBe('unsupported')
    expect(
      (await f.load()).tasks.some(task => task.kind === 'settle' && task.state === 'blocked'),
    ).toBe(true)
  })

  it.each(['covered-ref', 'legacy-address'] as const)(
    'requires full content identity for %s',
    async kind => {
      const external = refProcess('retained-process')
      if (!('ref' in external.content)) throw new Error('fixture ref')
      const ref = external.content.ref
      const f = await settlementFixture({
        process: [
          {
            ...external,
            content:
              kind === 'covered-ref'
                ? external.content
                : {
                    kind: 'file',
                    id: external.content.id,
                    visibility: external.content.visibility,
                    storage: ref.storage,
                    key: ref.key,
                    mediaType: ref.mediaType,
                  },
          },
        ],
        attachments: [ref],
      })
      ok(await f.preserve())
      const result = (await f.records()).find(row => row.kind === 'result')
      if (result?.kind !== 'result' || result.result.custody.kind !== 'execution')
        throw new Error('fixture result')
      const input = {
        ...f.access,
        operation: operationId('content-identity-plan'),
        preparation: firstPreparation(f),
        custody: result.result.custody.retained,
      }
      const planned = await f.ledger.commands.planRelease(input)
      if (kind === 'covered-ref') {
        const release = ok(planned)
        expect((await f.load()).tasks).toContainEqual(
          expect.objectContaining({ kind: 'release', release }),
        )
      } else {
        expect(failure(planned).kind).toBe('unsupported')
        expect(
          (await f.load()).tasks.some(task => task.kind === 'settle' && task.state === 'blocked'),
        ).toBe(true)
      }
    },
  )

  it.each([
    'tenant',
    'preparation',
    'resource',
    'custody',
    'operation',
    'adoption',
    'inputDigest',
  ] as const)('rejects substituted release %s before inspection', async field => {
    const inspect = vi.fn<ToolEnvironment<Principal, unknown>['inspectRelease']>()
    const f = await releasedFixture(inspect)
    const replacements = {
      tenant: tenantB,
      preparation: operationId('wrong'),
      resource: evidence('wrong'),
      custody: evidence('wrong'),
      operation: operationId('wrong'),
      adoption: { ...f.release.adoption, owner: 'wrong' },
      inputDigest: 'wrong',
    }
    expect(
      failure(
        await f.record(
          'forged',
          { kind: 'released', evidence: evidence('forged') },
          { ...f.release, [field]: replacements[field] },
        ),
      ).kind,
    ).toBe('invalid')
    expect(inspect).not.toHaveBeenCalled()
    expect((await f.load()).tasks.some(task => task.kind === 'release')).toBe(true)
  })

  it.each(['unknown', 'throw', 'failure', 'forged'] as const)(
    'does not clear cleanup on inspection %s',
    async mode => {
      const inspect = vi.fn<ToolEnvironment<Principal, unknown>['inspectRelease']>(async () => {
        if (mode === 'throw') throw new Error('secret credential')
        if (mode === 'failure')
          return fail({
            kind: 'unavailable',
            dependency: 'environment',
            diagnostic: 'secret credential',
            retryable: true,
          })
        return succeed(
          mode === 'unknown'
            ? { kind: 'unknown', diagnostic: 'secret credential' }
            : { kind: 'released', evidence: evidence('actual') },
        )
      })
      const f = await releasedFixture(inspect)
      const answer = failure(
        await f.record('observe', { kind: 'released', evidence: evidence('forged') }),
      )
      expect(answer.kind).toBe(mode === 'forged' ? 'invalid' : 'unavailable')
      expect(JSON.stringify(answer)).not.toContain('secret credential')
      expect((await f.load()).tasks.some(task => task.kind === 'release')).toBe(true)
      expect(
        (await f.records()).some(
          row => row.kind === 'operation' && row.operation.operation === operationId('observe'),
        ),
      ).toBe(false)
    },
  )

  it('uses independent observations, redacts diagnostics and never regresses released', async () => {
    const f = await releasedFixture()
    const before = (await f.records()).filter(row => row.kind === 'result')
    for (const kind of ['pending', 'unknown', 'rejected'] as const) {
      const outcome = { kind, diagnostic: 'secret credential' }
      const receipt = ok(await f.record(`observe-${kind}`, outcome))
      expect(ok(await f.record(`observe-${kind}`, outcome))).toEqual(receipt)
      const task = (await f.load()).tasks.find(task => task.kind === 'release')
      expect(task).toMatchObject({
        operation: f.release.operation,
        diagnostic: `environment-release-${kind}`,
        state: kind === 'rejected' ? 'blocked' : 'pending',
      })
    }
    const actual = ok(await f.environment.release({ ...f.access, release: f.release }))
    expect(failure(await f.record('observe-pending', actual)).kind).toBe('conflict')
    ok(await f.record('released-new-observation', actual))
    ok(await f.record('late-unknown', { kind: 'unknown', diagnostic: 'late' }))
    expect((await f.load()).tasks.some(task => task.kind === 'release')).toBe(false)
    expect((await f.records()).find(row => row.kind === 'environment-release')).toMatchObject({
      environmentRelease: { release: f.release, progress: actual },
    })
    expect(
      failure(
        await f.record('different-evidence', { kind: 'released', evidence: evidence('different') }),
      ).kind,
    ).toBe('conflict')
    expect((await f.records()).filter(row => row.kind === 'result')).toEqual(before)
  })

  it.each(['unknown-applied', 'unknown-dropped'] as const)(
    'retains one observation through %s',
    async fault => {
      const f = await releasedFixture()
      const actual = ok(await f.environment.release({ ...f.access, release: f.release }))
      f.harness.memory.injectCommit(fault)
      expect(failure(await f.record('unknown-commit', actual)).kind).toBe('commit-unknown')
      expect((await f.load()).tasks.some(task => task.kind === 'release')).toBe(
        fault === 'unknown-dropped',
      )
      const first = ok(await f.record('unknown-commit', actual))
      expect(ok(await f.record('unknown-commit', actual))).toEqual(first)
      expect((await f.load()).tasks.some(task => task.kind === 'release')).toBe(false)
      expect(
        (await f.records()).filter(
          row =>
            row.kind === 'operation' && row.operation.operation === operationId('unknown-commit'),
        ),
      ).toHaveLength(1)
    },
  )

  it.each(['unknown-applied', 'unknown-dropped'] as const)(
    'recognizes a plan alias through %s without another release',
    async fault => {
      const f = await releasedFixture()
      f.harness.memory.injectCommit(fault)
      expect(failure(await f.ledger.commands.planRelease(f.plan)).kind).toBe('commit-unknown')
      expect(ok(await f.ledger.commands.planRelease(f.plan))).toEqual(f.release)
      expect(ok(await f.ledger.commands.planRelease(f.plan))).toEqual(f.release)
      expect((await f.records()).filter(row => row.kind === 'environment-release')).toHaveLength(1)
      expect((await f.load()).tasks.filter(task => task.kind === 'release')).toHaveLength(1)
    },
  )

  it('honors an operation exclusion established while inspection is in flight', async () => {
    let f: Awaited<ReturnType<typeof releasedFixture>>
    const inspect = vi.fn<ToolEnvironment<Principal, unknown>['inspectRelease']>(async input => {
      expect(
        ok(await f.ledger.reads.operation({ ...f.access, operation: operationId('in-flight') }))
          .kind,
      ).toBe('not-committed')
      return f.environment.inspectRelease(input)
    })
    f = await releasedFixture(inspect)
    const actual = ok(await f.environment.release({ ...f.access, release: f.release }))
    expect(failure(await f.record('in-flight', actual)).kind).toBe('unavailable')
    expect((await f.load()).tasks.some(task => task.kind === 'release')).toBe(true)
    expect(
      (await f.records()).some(
        row => row.kind === 'operation' && row.operation.operation === operationId('in-flight'),
      ),
    ).toBe(false)
  })

  it('rejects extra fields and accessors without evaluating them', async () => {
    const f = await releasedFixture()
    const getter = vi.fn(() => {
      throw new Error('secret credential')
    })
    const release = Object.defineProperty({}, 'operation', { get: getter, enumerable: true })
    expect(
      failure(
        await f.record(
          'accessor',
          { kind: 'released', evidence: evidence('forged') },
          release as never,
        ),
      ).kind,
    ).toBe('invalid')
    expect(getter).not.toHaveBeenCalled()
    expect(
      failure(
        await f.record('extra', {
          kind: 'released',
          evidence: evidence('forged'),
          extra: 'forged',
        } as never),
      ).kind,
    ).toBe('invalid')
    expect((await f.load()).tasks.some(task => task.kind === 'release')).toBe(true)
  })

  it('checks current tenant qualification on receipt replay', async () => {
    const f = await releasedFixture()
    ok(await f.ledger.commands.planRelease(f.plan))
    const outcome = { kind: 'unknown', diagnostic: 'unknown' } as const
    ok(await f.record('replay-qualified', outcome))
    expect(
      failure(
        await f.ledger.commands.recordRelease({
          ...f.access,
          principal: principalB,
          operation: operationId('replay-qualified'),
          release: f.release,
          outcome,
        }),
      ).kind,
    ).toBe('denied')
    expect(
      failure(await f.ledger.commands.planRelease({ ...f.plan, principal: principalB })).kind,
    ).toBe('denied')
    expect(failure(await f.ledger.commands.planRelease({ ...f.plan, tenant: tenantB })).kind).toBe(
      'denied',
    )
    expect(
      failure(
        await f.ledger.commands.recordRelease({
          ...f.access,
          principal: principalB,
          operation: operationId('denied'),
          release: f.release,
          outcome: { kind: 'unknown', diagnostic: 'unknown' },
        }),
      ).kind,
    ).toBe('denied')
  })
})

describe('restricted settled facts task', () => {
  it('fixes the original facts task and blocked reason before awaiting current qualification', async () => {
    const gate = accessGate()
    const f = await settlementFixture({
      terminal: { kind: 'failed', cause: 'executor', diagnostic: 'failed' },
      wrapAccess: gate.wrapAccess,
    })
    ok(await f.preserve())
    const task = (await f.load()).tasks.find(task => task.kind === 'facts')
    if (task?.kind !== 'facts') throw new Error('fixture missing facts')
    const original = {
      ...f.access,
      operation: operationId('fixed-facts-task'),
      task,
      resolution: { kind: 'blocked', reason: 'settled-facts-source-ended' } as const,
    }
    const input = {
      ...original,
      task: { ...task, basis: { ...task.basis } },
      resolution: { kind: 'blocked' as const, reason: 'settled-facts-source-ended' },
    }
    const before = await f.load()
    const results = (await f.records()).filter(row => row.kind === 'result')
    gate.arm()
    const pending = f.ledger.commands.recordTask(input)
    await gate.entered
    input.task.basis.record = 'replaced-basis'
    input.task = { ...input.task, operation: operationId('replaced-task') }
    input.resolution.reason = 'settled-facts-source-unavailable'
    gate.resume()
    const receipt = ok(await pending)
    expect(ok(await f.ledger.commands.recordTask(original))).toEqual(receipt)
    expect(failure(await f.ledger.commands.recordTask(input)).kind).toBe('conflict')
    expect(
      failure(await f.ledger.commands.recordTask({ ...original, principal: principalB })).kind,
    ).toBe('denied')
    expect((await f.load()).tasks).toEqual(
      before.tasks.map(current =>
        current.kind === 'facts'
          ? { ...current, state: 'blocked', diagnostic: original.resolution.reason }
          : current,
      ),
    )
    expect((await f.records()).filter(row => row.kind === 'result')).toEqual(results)
  })

  it.each(['unknown-applied', 'unknown-dropped'] as const)(
    'records original blocked duty atomically and replays through %s',
    async fault => {
      const f = await settlementFixture({
        terminal: { kind: 'failed', cause: 'executor', diagnostic: 'failed' },
      })
      ok(await f.preserve())
      const task = (await f.load()).tasks.find(task => task.kind === 'facts')
      if (task === undefined) throw new Error('fixture facts task')
      const input = {
        ...f.access,
        operation: operationId('block-facts'),
        task,
        resolution: { kind: 'blocked', reason: 'settled-facts-source-ended' } as const,
      }
      const before = (await f.records()).filter(row => row.kind === 'result')
      f.harness.memory.injectCommit(fault)
      expect(failure(await f.ledger.commands.recordTask(input)).kind).toBe('commit-unknown')
      const receipt = ok(await f.ledger.commands.recordTask(input))
      expect(ok(await f.ledger.commands.recordTask(input))).toEqual(receipt)
      expect((await f.load()).tasks).toContainEqual({
        ...task,
        state: 'blocked',
        diagnostic: input.resolution.reason,
      })
      expect((await f.records()).filter(row => row.kind === 'result')).toEqual(before)
      const commit = f.commits.findLast(commit =>
        commit.writes.some(
          row =>
            row.kind === 'put' &&
            row.record.kind === 'operation' &&
            row.record.operation.operation === input.operation,
        ),
      )
      expect(commit?.writes.filter(row => row.kind === 'put').map(row => row.record.kind)).toEqual(
        expect.arrayContaining(['call', 'task', 'operation']),
      )
      expect(
        failure(
          await f.ledger.commands.recordTask({
            ...input,
            resolution: { kind: 'blocked', reason: 'settled-facts-source-unavailable' },
          }),
        ).kind,
      ).toBe('conflict')
    },
  )

  it('cannot clear tasks, change their basis, use arbitrary diagnostics or block a live call', async () => {
    const f = await settlementFixture({
      terminal: { kind: 'interrupted', cause: { kind: 'foreground-limit' } },
    })
    const live = (await f.load()).tasks.find(task => task.kind === 'facts')
    if (live?.kind !== 'facts') throw new Error('fixture facts')
    const input = {
      ...f.access,
      operation: operationId('block'),
      task: live,
      resolution: { kind: 'blocked', reason: 'settled-facts-source-unavailable' } as const,
    }
    expect(failure(await f.ledger.commands.recordTask(input)).kind).toBe('invalid')
    ok(await f.preserve())
    const recovery = await f.load()
    for (const task of recovery.tasks) {
      expect(
        failure(
          await f.ledger.commands.recordTask({
            ...input,
            task,
            resolution: { kind: 'done', evidence: evidence('not-proof') },
          }),
        ).kind,
      ).toBe('unsupported')
      if (task.kind !== 'facts')
        expect(failure(await f.ledger.commands.recordTask({ ...input, task })).kind).toBe(
          'unsupported',
        )
    }
    expect(
      failure(
        await f.ledger.commands.recordTask({
          ...input,
          task: { ...live, basis: evidence('forged') },
        }),
      ).kind,
    ).toBe('unsupported')
    expect(
      failure(
        await f.ledger.commands.recordTask({
          ...input,
          resolution: { kind: 'blocked', reason: 'secret credential' },
        }),
      ).kind,
    ).toBe('invalid')
    expect((await f.load()).tasks).toEqual(recovery.tasks)
    ok(await f.ledger.commands.recordTask(input))
    expect(
      failure(await f.ledger.commands.recordTask({ ...input, principal: principalB })).kind,
    ).toBe('denied')
  })
})
