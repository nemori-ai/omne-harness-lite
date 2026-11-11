import { expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import type { ControlProgress } from '@omne-harness/tool-contract'
import { decodeToolRevision, type ToolLiveExecution } from '@omne-harness/tool-contract/provider'
import type {
  LedgerRecord,
  ToolControlSubjects,
  ToolLedgerAction,
  ToolLedgerStore,
} from '@omne-harness/tool'
import { admitCall, startHarness, type StartOptions } from './start-values.ts'
import { testControlSubjects } from './control-subject-values.ts'
import {
  callId,
  evidence,
  guards,
  ok,
  operationId,
  principalA,
  principalB,
  tenantA,
  type Principal,
} from './runtime-values.ts'

const controller = { ...principalA, subject: 'controller-b' }
const access = { principal: principalA, tenant: tenantA, call: callId('original') }
const input = {
  ...access,
  principal: controller,
  operation: operationId('controller-stop'),
  intent: { kind: 'stop' } as const,
}

function fixture(options: StartOptions = {}) {
  let revoked = false
  let dispatched = 0
  let progress: ControlProgress = { kind: 'pending', diagnostic: 'not dispatched' }
  const checkedSubjects: string[] = []
  const directory = new Map<string, Principal>()
  const lives = new Map<string, ToolLiveExecution>()
  const subjects = () =>
    testControlSubjects(
      {
        qualify: async input => {
          checkedSubjects.push(input.principal.subject)
          return revoked && input.principal.subject === controller.subject
            ? { kind: 'denied', reason: 'revoked' }
            : guards().access.qualify(input)
        },
      },
      directory,
    )
  const initial: StartOptions = {
    controlSubjects: subjects(),
    bindingPort: base => ({
      ...base,
      start: async (...args) => {
        const original = ok(await base.start(...args))
        const live = {
          ...original,
          inspectControl: async () => succeed(progress),
          stop: async () => {
            dispatched += 1
            progress = { kind: 'accepted', evidence: evidence('accepted') }
            return succeed(progress)
          },
        }
        lives.set(args[0].call, live)
        return succeed(live)
      },
    }),
    bindingsPort: base => ({
      ...base,
      recover: async input => {
        const live = lives.get(input.call)
        if (live === undefined) throw new Error('missing execution')
        return succeed({
          acknowledge: live.acknowledge,
          inspectStart: async () => succeed({ kind: 'live' as const, execution: live }),
          inspectSuspension: async () => {
            throw new Error('unused')
          },
          stop: live.stop,
          inspectControl: live.inspectControl,
        })
      },
    }),
    ...options,
  }
  const h = startHarness(initial)
  return {
    h,
    checkedSubjects,
    subjects,
    dispatched: () => dispatched,
    revoke: () => {
      revoked = true
    },
    progress: (value: ControlProgress) => {
      progress = value
    },
    rebuild: (controlSubjects: ToolControlSubjects<Principal> | null = subjects()) =>
      startHarness({
        ...initial,
        memory: h.memory,
        binding: h.binding,
        authority: h.authority,
        controlSubjects,
      }),
  }
}

async function started(f: ReturnType<typeof fixture>, run: (signal: AbortSignal) => Promise<void>) {
  const abort = new AbortController()
  try {
    await admitCall(f.h, 'original')
    await f.h.runOnce('original', abort.signal)
    await run(abort.signal)
  } finally {
    abort.abort()
  }
}

async function replaceRecords(
  store: ToolLedgerStore,
  replace: (record: LedgerRecord) => LedgerRecord,
) {
  const domain = { kind: 'call', tenant: tenantA, call: access.call } as const
  const read = await store.read(domain)
  if (read.kind !== 'complete') throw new Error('unreadable fixture')
  expect(
    await store.commit({
      domain,
      expected: read.revision,
      revision: ok(decodeToolRevision(String(BigInt(read.revision) + 1n))),
      writes: read.records.map(record => ({ kind: 'put', record: replace(record) })),
    }),
  ).toEqual({ kind: 'committed' })
}

it('rejects the original controller after revocation when a different principal drives', async () => {
  const f = fixture()
  await started(f, async signal => {
    ok(await f.h.commands.control(input))
    f.revoke()
    await f.h.runOnce('original', signal)
    expect(f.dispatched()).toBe(0)
    expect(f.checkedSubjects).toEqual(['controller-b'])
    const recovery = ok(await f.h.commands.loadRecovery(access))
    expect(recovery.controls[0]?.progress).toMatchObject({
      kind: 'rejected',
      reason: 'control-qualification-denied',
    })
    expect(recovery.tasks.some(task => task.kind === 'stop')).toBe(false)
    expect(recovery.state.execution.kind).toBe('live')
    expect(recovery.state.queue.kind).toBe('held')
    expect(recovery.tasks.some(task => task.kind === 'release')).toBe(false)
  })
})

it('recovers B from the committed reference after rebuilding ledger, runtime and provider', async () => {
  const f = fixture()
  await started(f, async signal => {
    const receipt = ok(await f.h.commands.control(input))
    const rebuilt = f.rebuild()
    expect(ok(await rebuilt.commands.control({ ...input, principal: { ...controller } }))).toEqual(
      receipt,
    )
    f.revoke()
    await rebuilt.runOnce('original', signal)
    expect(f.checkedSubjects).toEqual(['controller-b'])
    expect(f.dispatched()).toBe(0)
    expect(ok(await rebuilt.commands.loadRecovery(access)).controls[0]?.progress.kind).toBe(
      'rejected',
    )
  })
})

it('accepts refreshed B credentials but denies C before comparing the intent', async () => {
  const f = fixture()
  await started(f, async signal => {
    const receipt = ok(await f.h.commands.control(input))
    expect(ok(await f.h.commands.control({ ...input, principal: { ...controller } }))).toEqual(
      receipt,
    )
    for (const intent of [{ kind: 'stop' }, { kind: 'background' }] as const)
      expect(
        await f.h.commands.control({
          ...input,
          principal: { ...principalA, subject: 'controller-c' },
          intent,
        }),
      ).toMatchObject({ failure: { kind: 'denied' } })
    await f.h.runOnce('original', signal)
    expect(f.checkedSubjects).toEqual(['controller-b'])
    expect(f.dispatched()).toBe(1)
    const accepted = ok(await f.h.commands.loadRecovery(access))
    expect(accepted.controls[0]?.progress.kind).toBe('accepted')
    f.revoke()
    f.progress({ kind: 'stopped', evidence: evidence('stopped') })
    await f.rebuild(null).runOnce('original', signal)
    expect(ok(await f.h.commands.loadRecovery(access)).controls[0]?.progress.kind).toBe('stopped')
    expect(f.dispatched()).toBe(1)
    expect(f.checkedSubjects).toHaveLength(1)
  })
})

it('rechecks the winning controller after a CAS conflict instead of recalling by intent alone', async () => {
  let land: (() => Promise<void>) | undefined
  const f = fixture({
    store: memory => ({
      ...memory,
      commit: async commit => {
        if (
          land !== undefined &&
          commit.writes.some(
            write =>
              write.kind === 'put' &&
              write.record.kind === 'operation' &&
              write.record.operation.receipt.kind === 'control',
          )
        ) {
          const winner = land
          land = undefined
          await winner()
        }
        return memory.commit(commit)
      },
    }),
  })
  await started(f, async () => {
    land = async () => {
      ok(
        await f.h.commands.control({
          ...input,
          principal: { ...principalA, subject: 'controller-c' },
        }),
      )
    }
    expect(await f.h.commands.control(input)).toMatchObject({ failure: { kind: 'denied' } })
    expect(
      await f.h.commands.control({
        ...input,
        principal: { ...principalA, subject: 'controller-c' },
      }),
    ).toHaveProperty('ok')
    expect(ok(await f.h.commands.loadRecovery(access)).controls).toHaveLength(1)
  })
})

it.each(['missing', 'malformed', 'substituted'] as const)(
  'keeps pending work when the stored subject is %s',
  async damage => {
    const f = fixture()
    await started(f, async signal => {
      ok(await f.h.commands.control(input))
      await replaceRecords(f.h.memory, record => {
        if (record.kind !== 'operation' || record.operation.receipt.kind !== 'control')
          return record
        const { subject: _subject, ...receipt } = record.operation.receipt
        return {
          ...record,
          operation: {
            ...record.operation,
            receipt: {
              ...receipt,
              ...(damage === 'missing'
                ? {}
                : {
                    subject:
                      damage === 'malformed'
                        ? { owner: '', record: '', revision: '', digest: '' }
                        : evidence('different-subject'),
                  }),
            },
          },
        }
      })
      await f.h.runOnce('original', signal)
      expect(f.dispatched()).toBe(0)
      const recovery = ok(await f.h.commands.loadRecovery(access))
      expect(recovery.controls[0]?.progress.kind).toBe('pending')
      expect(recovery.tasks.some(task => task.kind === 'stop')).toBe(true)
      expect(f.checkedSubjects).toEqual([])
    })
  },
)

it('refuses new controls without subjects and never recovers a pending controller from admission', async () => {
  const absent = fixture({ controlSubjects: null })
  await started(absent, async () => {
    expect(await absent.h.commands.control(input)).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'control-subjects' },
    })
    expect(ok(await absent.h.commands.loadRecovery(access)).controls).toEqual([])
  })
  const f = fixture()
  await started(f, async signal => {
    ok(await f.h.commands.control(input))
    await f.rebuild(null).runOnce('original', signal)
    expect(f.dispatched()).toBe(0)
    expect(
      ok(await f.h.commands.loadRecovery(access)).tasks.some(task => task.kind === 'stop'),
    ).toBe(true)
  })
})

it.each(['unavailable', 'throws'] as const)(
  'keeps pending work when the resolver %s and rejects foreign access',
  async fault => {
    const f = fixture()
    await started(f, async signal => {
      ok(await f.h.commands.control(input))
      const restored = f.rebuild({
        ...f.subjects(),
        qualify: async () => {
          if (fault === 'throws') throw new Error('secret resolver failure')
          return { kind: 'unavailable', diagnostic: 'directory unreadable' }
        },
      })
      const original = ok(await restored.commands.loadRecovery(access)).controls[0]
      if (original === undefined) throw new Error('missing control')
      expect(
        await restored.ledger.controls.prepareDispatch({
          ...access,
          principal: principalB,
          control: original.operation,
          source: original.source,
        }),
      ).toMatchObject({ failure: { kind: 'denied' } })
      await restored.runOnce('original', signal)
      expect(f.dispatched()).toBe(0)
      expect(ok(await restored.commands.loadRecovery(access)).controls[0]?.progress.kind).toBe(
        'pending',
      )
    })
  },
)

it.each(['applied', 'dropped'] as const)(
  'does not dispatch after a rejection commit answer is lost (%s)',
  async fault => {
    let lose = false
    const f = fixture({
      store: memory => ({
        ...memory,
        commit: async commit => {
          if (
            lose &&
            commit.writes.some(
              write => write.kind === 'delete' && write.key === `task:stop:${input.operation}`,
            )
          ) {
            lose = false
            if (fault === 'applied') await memory.commit(commit)
            return { kind: 'unknown', diagnostic: 'rejection response lost' }
          }
          return memory.commit(commit)
        },
      }),
    })
    await started(f, async signal => {
      ok(await f.h.commands.control(input))
      f.revoke()
      lose = true
      const original = ok(await f.h.commands.loadRecovery(access)).controls[0]
      if (original === undefined) throw new Error('missing control')
      expect(
        await f.h.ledger.controls.prepareDispatch({
          ...access,
          control: original.operation,
          source: original.source,
        }),
      ).toMatchObject({ failure: { kind: 'unavailable' } })
      expect(f.dispatched()).toBe(0)
      await f.h.runOnce('original', signal)
      expect(f.dispatched()).toBe(0)
      expect(ok(await f.h.commands.loadRecovery(access)).controls[0]?.progress.kind).toBe(
        'rejected',
      )
    })
  },
)

it('only inspects an unknown control after reconstruction even if B is now denied', async () => {
  const f = fixture()
  await started(f, async signal => {
    ok(await f.h.commands.control(input))
    f.progress({ kind: 'unknown', diagnostic: 'stop outcome unknown' })
    await f.h.runOnce('original', signal)
    f.revoke()
    const rebuilt = f.rebuild()
    await rebuilt.runOnce('original', signal)
    f.progress({ kind: 'pending', diagnostic: 'source forgot the outcome' })
    await rebuilt.runOnce('original', signal)
    expect(f.checkedSubjects).toEqual([])
    expect(f.dispatched()).toBe(0)
    expect(ok(await rebuilt.commands.loadRecovery(access)).controls[0]?.progress.kind).toBe(
      'unknown',
    )
  })
})

it('keeps pending work when the runtime has no dispatch preparation port', async () => {
  const f = fixture({ omitRuntimeControls: true })
  await started(f, async signal => {
    ok(await f.h.commands.control(input))
    await f.h.runOnce('original', signal)
    expect(f.dispatched()).toBe(0)
    expect(ok(await f.h.commands.loadRecovery(access)).controls[0]?.progress.kind).toBe('pending')
  })
})

it('retains B ownership after an applied control commit loses its reply', async () => {
  let lose = true
  const f = fixture({
    store: memory => ({
      ...memory,
      commit: async commit => {
        const committed = await memory.commit(commit)
        if (
          lose &&
          commit.writes.some(
            write =>
              write.kind === 'put' &&
              write.record.kind === 'operation' &&
              write.record.operation.receipt.kind === 'control',
          )
        ) {
          lose = false
          return { kind: 'unknown', diagnostic: 'control response lost' }
        }
        return committed
      },
    }),
  })
  await started(f, async signal => {
    expect(await f.h.commands.control(input)).toMatchObject({ failure: { kind: 'commit-unknown' } })
    const rebuilt = f.rebuild()
    expect(await rebuilt.commands.control({ ...input, principal: principalA })).toMatchObject({
      failure: { kind: 'denied' },
    })
    expect(
      ok(await rebuilt.commands.control({ ...input, principal: { ...controller } })).operation,
    ).toBe(input.operation)
    f.revoke()
    await rebuilt.runOnce('original', signal)
    const recovery = ok(await rebuilt.commands.loadRecovery(access))
    expect(f.dispatched()).toBe(0)
    expect(recovery.controls).toHaveLength(1)
    expect(recovery.controls[0]?.progress.kind).toBe('rejected')
  })
})

it('records an unknown observation using A write qualification without substituting A control qualification', async () => {
  const deniedActions: ToolLedgerAction[] = []
  const f = fixture({ deniedActions })
  await started(f, async signal => {
    ok(await f.h.commands.control(input))
    await f.h.runOnce('original', signal)
    deniedActions.push('control')
    f.progress({ kind: 'unknown', diagnostic: 'confirmation lost' })
    await f.h.runOnce('original', signal)
    expect(ok(await f.h.commands.loadRecovery(access)).controls[0]?.progress.kind).toBe('unknown')
    expect(f.dispatched()).toBe(1)
    expect(f.checkedSubjects).toEqual(['controller-b'])
  })
})

it.each(['throws', 'malformed'] as const)(
  'rejects a %s subject capture without saving a control',
  async fault => {
    const base = testControlSubjects(guards().access)
    const f = fixture({
      controlSubjects: {
        ...base,
        capture: async () => {
          if (fault === 'throws') throw new Error('secret identity data')
          return succeed({ owner: '', record: '', revision: '', digest: '' })
        },
      },
    })
    await started(f, async () => {
      const outcome = await f.h.commands.control(input)
      expect(outcome).toMatchObject({ failure: { kind: 'unavailable' } })
      expect(JSON.stringify(outcome)).not.toContain('secret identity data')
      expect(ok(await f.h.commands.loadRecovery(access)).controls).toEqual([])
    })
  },
)
