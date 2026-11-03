import { ScheduleManagementResultSchema } from '@omne-harness/schedule-contract'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  createScheduleToolEnvironment,
  scheduleToolParameterCodec,
  type ScheduleToolEnvironment,
  type ScheduleToolContextRecovery,
} from '@omne-harness/schedule-tools'
import type { PreparationProgress, ToolEnvironment } from '@omne-harness/tool-contract/provider'
import {
  access,
  context,
  adoption,
  definition,
  scheduleId,
  evidence,
  operationId,
  value,
  services,
  run,
} from './world.ts'
import { original, baseEnvironment, sqlHost } from './recovery.ts'
const input = {
  action: 'create',
  input: {
    definition,
    initial: { kind: 'draft', reason: 'not-approved' },
    meta: { expectedRevision: null, consentRef: null },
  },
}
const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})
function prepared(
  outcome: Awaited<ReturnType<ToolEnvironment<string, ScheduleToolEnvironment>['prepare']>>,
) {
  const progress = value(outcome)
  if (progress.kind !== 'prepared') throw new Error('Not prepared')
  return progress.environment
}
it('rebuilds the original key and fingerprint from SQL after close/reopen, preserves unknown, and never sends an automatic retry', async () => {
  const directory = await realpath(
    await mkdtemp(resolve(import.meta.dirname, '../../../../tmp/schedule-a2-tools/sql-')),
  )
  dirs.push(directory)
  const file = join(directory, 'original.sqlite')
  const first = sqlHost(file)
  const { recovery, preparation } = await original(input)
  const create = vi.fn(async () =>
    ScheduleManagementResultSchema.parse({
      kind: 'unknown',
      operationRef: '00000000-0000-4000-8000-000000000009',
      retryAfterMs: 100,
    }),
  )
  try {
    const missing = prepared(await first.environment.prepare({ ...access(), preparation }))
    expect(
      (await run(input, missing.value, { ...services, commands: { ...services.commands, create } }))
        .returned,
    ).toHaveProperty('kind', 'adapterFailure')
    expect(create).not.toHaveBeenCalled()
    first.save(recovery)
    const fixed = prepared(await first.environment.prepare({ ...access(), preparation }))
    expect(Object.isFrozen(value(fixed.value.schedule).context.owner)).toBe(true)
    expect(Object.isFrozen(preparation.request)).toBe(false)
    const result = await run(input, fixed.value, {
      ...services,
      commands: { ...services.commands, create },
    })
    expect(result.returned).toMatchObject({
      kind: 'result',
      result: { kind: 'unknown' },
      operation: {
        kind: 'identity',
        identity: { operationKey: expect.stringMatching(/^[a-f0-9]{64}$/u) },
      },
    })
    expect(create).toHaveBeenCalledTimes(1)
    first.close()
    const reopened = sqlHost(file)
    try {
      const restored = prepared(
        await reopened.environment.inspectPreparation({ ...access(), preparation }),
      )
      expect(restored).toEqual(fixed)
      await run(input, restored.value, { ...services, commands: { ...services.commands, create } })
      expect(create).toHaveBeenCalledTimes(2)
      expect(create.mock.calls[1]).toEqual(create.mock.calls[0])
      const changed = { ...input, input: { ...input.input, initial: { kind: 'active' } } }
      expect(
        (
          await run(changed, restored.value, {
            ...services,
            commands: { ...services.commands, create },
          })
        ).returned,
      ).toHaveProperty('failure.reason', 'fixed-intent-mismatch')
      expect(create).toHaveBeenCalledTimes(2)
      const locator = value(restored.value.schedule).write?.locator
      const query = { action: 'queryOperation', input: locator }
      const queryRecovery = await original(query)
      const queryEnvironment = createScheduleToolEnvironment(baseEnvironment(), {
        commands: { loadRecovery: async () => succeed(queryRecovery.recovery) },
        contexts: {
          restore: async () =>
            succeed({
              ...access(),
              admission: queryRecovery.recovery.admission,
              context,
              adapter: adoption,
              source: evidence('query-context'),
            }),
        },
      })
      const queryOperation = vi.fn(services.commands.queryOperation)
      await run(
        query,
        prepared(
          await queryEnvironment.prepare({ ...access(), preparation: queryRecovery.preparation }),
        ).value,
        { ...services, commands: { ...services.commands, create, queryOperation } },
      )
      expect(queryOperation).toHaveBeenCalledWith(context, locator)
      expect(create).toHaveBeenCalledTimes(2)
      reopened.db
        .prepare('UPDATE original_call SET context = ? WHERE call = ?')
        .run(
          JSON.stringify({ ...context, originatingSessionRef: 'replacement-session' }),
          access().call,
        )
      const substituted = prepared(await reopened.environment.prepare({ ...access(), preparation }))
      expect(
        (
          await run(input, substituted.value, {
            ...services,
            commands: { ...services.commands, create },
          })
        ).returned,
      ).toHaveProperty('failure.reason', 'durable-binding-mismatch')
      expect(create).toHaveBeenCalledTimes(2)
    } finally {
      reopened.close()
    }
  } finally {
    try {
      first.close()
    } catch {
      /* Closed before reopening. */
    }
  }
})
it('rejects substituted request, admission, adapter, missing evidence, and provider failure while preserving the acquired lease', async () => {
  const { recovery, preparation } = await original(input)
  const good = {
    tenant: access().tenant,
    call: access().call,
    admission: recovery.admission,
    context,
    adapter: adoption,
    source: evidence('context'),
  }
  const attempts: ScheduleToolContextRecovery<string>[] = [
    { restore: async () => succeed({ ...good, admission: operationId('other') }) },
    { restore: async () => succeed({ ...good, adapter: { ...adoption, revision: 'other' } }) },
    { restore: async () => succeed({ ...good, source: { ...good.source, record: '' } }) },
    {
      restore: async () => {
        throw new Error('private credential')
      },
    },
    {
      restore: async () =>
        fail({ kind: 'unavailable', dependency: 'context', diagnostic: 'unknown' }),
    },
  ]
  const create = vi.fn(services.commands.create)
  for (const contexts of attempts) {
    const release = vi.fn(baseEnvironment().release)
    const base = { ...baseEnvironment(), release }
    const wrapped = createScheduleToolEnvironment(base, {
      commands: { loadRecovery: async () => succeed(recovery) },
      contexts,
    })
    const env = prepared(await wrapped.prepare({ ...access(), preparation }))
    expect(env.evidence).toEqual(evidence('lease'))
    expect(env.preparation).toBe(preparation)
    expect(
      (await run(input, env.value, { ...services, commands: { ...services.commands, create } }))
        .returned,
    ).toHaveProperty('kind', 'adapterFailure')
    const releaseRecord = {
      tenant: access().tenant,
      call: access().call,
      operation: operationId('release'),
      adoption,
      inputDigest: 'release',
      preparation: preparation.operation,
      resource: evidence('lease'),
      custody: evidence('custody'),
    }
    await wrapped.release({ ...access(), release: releaseRecord })
    expect(release).toHaveBeenCalledOnce()
  }
  expect(create).not.toHaveBeenCalled()
  const wrapped = createScheduleToolEnvironment(baseEnvironment(), {
    commands: { loadRecovery: async () => succeed(recovery) },
    contexts: {
      restore: async input => {
        expect(Object.isFrozen(input.recovery.request.arguments)).toBe(true)
        expect(Object.isFrozen(input)).toBe(true)
        return succeed(good)
      },
    },
  })
  const forged = {
    ...preparation,
    request: { ...preparation.request, context: { ...adoption, revision: 'replacement-context' } },
  }
  expect(
    prepared(await wrapped.prepare({ ...access(), preparation: forged })).value.schedule,
  ).toHaveProperty('failure.reason', 'fixed-request-mismatch')
})
it('does not recover until the base is prepared, and delegates inspect/release without dropping progress', async () => {
  const { preparation } = await original(input)
  const loadRecovery = vi.fn(async () =>
    fail({ kind: 'unavailable' as const, dependency: 'fixture', diagnostic: 'not called' }),
  )
  const progress: PreparationProgress<unknown> = { kind: 'unknown', diagnostic: 'pending' }
  const base = { ...baseEnvironment(), prepare: async () => succeed(progress) }
  const wrapped = createScheduleToolEnvironment(base, {
    commands: { loadRecovery },
    contexts: {
      restore: async () => {
        throw new Error('unexpected')
      },
    },
  })
  expect(await wrapped.prepare({ ...access(), preparation })).toEqual(succeed(progress))
  expect(loadRecovery).not.toHaveBeenCalled()
})
it('never turns a cancelled tool wait into a Schedule stop', async () => {
  const args = value(
    scheduleToolParameterCodec.parse({
      original: '',
      effective: JSON.stringify({ action: 'get', input: { scheduleId } }),
      complete: true,
    }),
  )
  const controller = new AbortController()
  controller.abort()
  const execute = vi.fn(services.commands.execute)
  await expect(
    run(
      args,
      { schedule: succeed({ context, arguments: args, write: null }) },
      { ...services, commands: { ...services.commands, execute } },
      controller.signal,
    ),
  ).rejects.toThrow('cancelled')
  expect(execute).not.toHaveBeenCalled()
})
