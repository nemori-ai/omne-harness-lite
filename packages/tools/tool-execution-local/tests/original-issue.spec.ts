import { rm } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import type {
  ToolOriginalIssueParticipant,
  ToolOriginalIssueSupport,
} from '@omne-harness-lite/tool-execution-runtime'
import { fixture, request, scope } from './execution-owner-fixture.ts'
import type { ContextReader } from '@omne-harness-lite/runtime-context'

function support(log: Awaited<ReturnType<typeof fixture>>['log']): ToolOriginalIssueSupport {
  return {
    storage: log.fixtureStorage,
    log: log.participant,
    access: log.fixtureAccess,
    async classifyTerminalIn(unit, identity) {
      const source = await log.participant.sourceIn(unit, log.fixtureAccess, {
        tenant: identity.ref.tenant,
        session: identity.ref.session,
      })
      if ('failure' in source) return { kind: 'unavailable' }
      const prefix = await log.participant.readPrefixIn(unit, log.fixtureAccess, source.source)
      if ('failure' in prefix) return { kind: 'unavailable' }
      return {
        kind: 'classified',
        late: prefix.entries.some(entry =>
          ['attempt-changed', 'run-ended'].includes(entry.dedupeKey ?? ''),
        ),
      }
    },
    current: { authorizeIn: async () => ({ kind: 'authorized' }) },
    admission: {
      admitOriginal: async () => ({ kind: 'denied' }),
      consumeOriginal: async () => ({ kind: 'denied' }),
    },
  }
}

describe('native original Tool owner', () => {
  it('never writes intent or invokes the author when Session rejects admission', async () => {
    const f = await fixture(undefined, undefined, undefined, undefined, support)
    try {
      const result = await f.owner.submitPrepared(f.prepared)
      await f.owner.idle()
      expect(result).toEqual({ kind: 'rejected', reason: 'runtimeUnavailable' })
      expect(f.implementation).not.toHaveBeenCalled()
      expect(await f.log.readSince(scope.session, 0)).toEqual({ entries: [], tail: 0 })
    } finally {
      await f.close()
    }
  })

  it('retains the original job and participant after an unconfirmed admission', async () => {
    const participants: ToolOriginalIssueParticipant[] = []
    const admit = vi.fn(async (participant: ToolOriginalIssueParticipant) => {
      participants.push(participant)
      return { kind: 'unknownCommit' as const, identity: participant.identity }
    })
    const f = await fixture(undefined, undefined, undefined, undefined, log => ({
      ...support(log),
      admission: { admitOriginal: admit, consumeOriginal: async () => ({ kind: 'denied' }) },
    }))
    try {
      await f.owner.submitPrepared(f.prepared)
      await f.owner.submitPrepared(f.prepared)
      await f.owner.idle()
      expect(admit).toHaveBeenCalledTimes(2)
      expect(participants[1]).toBe(participants[0])
      expect(f.implementation).not.toHaveBeenCalled()
      await expect(f.owner.close()).rejects.toThrow('retains unconfirmed original admission')
    } finally {
      await f.log.close()
      await rm(f.dir, { recursive: true, force: true })
    }
  })
})

import { projectToolJournal } from '@omne-harness-lite/tool-execution-runtime'
import { deferred, ref } from './execution-owner-fixture.ts'
import { narrow, StorageUnavailable } from '@omne-harness-lite/storage'
import { checkAppendInput } from '@omne-harness-lite/session-log'
import type { ToolOriginalIssueClaim } from '@omne-harness-lite/tool-execution-runtime'

async function admittedFixture(
  options: {
    readonly stage?: 'rollback' | 'unknown'
    readonly consume?: 'unknown' | 'deny'
    readonly executor?: Parameters<typeof fixture>[0]
    readonly forbidCompletePrefix?: boolean
    readonly advanceBeforeStage?: boolean
    readonly classifyTerminalIn?: ToolOriginalIssueSupport['classifyTerminalIn']
  } = {},
) {
  const participants: ToolOriginalIssueParticipant[] = []
  const claims = new Map<ToolOriginalIssueClaim, ToolOriginalIssueParticipant>()
  let consumeCount = 0
  let stageMode = options.stage,
    consumeMode = options.consume
  const f = await fixture(options.executor, undefined, undefined, undefined, async log => {
    await log.fixturePrefix(scope)
    return {
      ...support(log),
      ...(options.classifyTerminalIn ? { classifyTerminalIn: options.classifyTerminalIn } : {}),
      ...(options.forbidCompletePrefix
        ? {
            log: {
              ...log.participant,
              readPrefixIn: () => {
                throw new Error('Tool complete Session prefix forbidden')
              },
            },
          }
        : {}),
      admission: {
        async admitOriginal(participant) {
          participants.push(participant)
          if (options.advanceBeforeStage) {
            const later = checkAppendInput(
              scope.session,
              [
                {
                  tenant: scope.tenant,
                  readKeys: ['unrelated'],
                  payload: { category: 'fact', format: 'test-later/1' },
                },
              ],
              { kind: 'unfenced' },
              { kind: 'unconditional' },
            )
            if ('failure' in later) throw new Error('invalid later fixture')
            const appended = await log.append(
              scope.session,
              later.ok.entries,
              later.ok.fence,
              later.ok.condition,
            )
            if ('failure' in appended) throw new Error('later append unavailable')
          }
          try {
            const staged = await log.fixtureStorage.atomic(async unit => {
              const result = await participant.stageOriginalIn(unit)
              if (result.kind === 'staged') claims.set(result.claim, participant)
              if (stageMode === 'rollback') throw new StorageUnavailable('controlled rollback')
              return result
            })
            if (stageMode === 'unknown')
              return { kind: 'unknownCommit', identity: participant.identity }
            return staged.kind === 'staged' ? { ...staged, kind: 'issued' } : staged
          } catch (error) {
            if (!(error instanceof StorageUnavailable)) throw error
            return { kind: 'unknownCommit', identity: participant.identity }
          }
        },
        async consumeOriginal(claim) {
          consumeCount++
          if (consumeMode === 'deny') return { kind: 'staleAttempt' }
          const participant = claims.get(claim)
          if (!participant) return { kind: 'invalidInput' }
          const consumed = await log.fixtureStorage.atomic(unit =>
            participant.consumeOriginalIn(unit, claim),
          )
          if (consumeMode === 'unknown')
            return { kind: 'unknownCommit', identity: participant.identity }
          return consumed.kind === 'staged' ? { ...consumed, kind: 'launch' } : consumed
        },
      },
    }
  })
  return {
    f,
    participants,
    claims,
    consumes: () => consumeCount,
    setStage: (mode: typeof stageMode) => {
      stageMode = mode
    },
    setConsume: (mode: typeof consumeMode) => {
      consumeMode = mode
    },
  }
}

describe('native original Tool same-unit execution', () => {
  it('commits the full original intent and consumes once before one actual author call', async () => {
    const { f, participants, consumes } = await admittedFixture()
    try {
      expect(await f.owner.submitPrepared(f.prepared)).toEqual({ kind: 'recorded', execution: ref })
      await f.owner.idle()
      await participants[0]!.stopped
      const records = await f.log.fixtureStorage.read(tx =>
        narrow<{ tool_original_issue: { intent: string; consumed: number } }>(tx)
          .selectFrom('tool_original_issue')
          .selectAll()
          .execute(),
      )
      expect(records).toHaveLength(1)
      expect(records[0]!.consumed).toBe(1)
      expect(
        JSON.parse(records[0]!.intent).payload.value.value.input.submission.call.arguments,
      ).toEqual({ value: 'captured' })
      expect(f.implementation).toHaveBeenCalledTimes(1)
      await f.owner.submitPrepared(f.prepared)
      await f.owner.idle()
      expect(f.implementation).toHaveBeenCalledTimes(1)
      expect(consumes()).toBe(1)
    } finally {
      await f.close()
    }
  })

  it.each(['rollback', 'unknown'] as const)(
    'does not consume or call after %s admission',
    async stage => {
      const { f, consumes } = await admittedFixture({ stage })
      try {
        expect(await f.owner.submitPrepared(f.prepared)).toEqual(
          stage === 'unknown'
            ? { kind: 'unknownCommit', original: ref }
            : { kind: 'rejected', reason: 'runtimeUnavailable' },
        )
        await f.owner.idle()
        expect(f.implementation).not.toHaveBeenCalled()
        expect(consumes()).toBe(0)
        const journal = await f.log.readSince(scope.session, 0)
        if ('failure' in journal) throw new Error('journal unavailable')
        expect(journal.entries.length).toBe(stage === 'rollback' ? 0 : 1)
      } finally {
        await f.close()
      }
    },
  )

  it('refuses a copied claim and never calls after a denied consume', async () => {
    const { f, participants, claims } = await admittedFixture({ consume: 'deny' })
    try {
      await f.owner.submitPrepared(f.prepared)
      await f.owner.idle()
      const claim = [...claims.keys()][0]!
      const copied = Object.freeze({ ...claim }) as ToolOriginalIssueClaim
      expect(
        await f.log.fixtureStorage.atomic(unit => participants[0]!.consumeOriginalIn(unit, copied)),
      ).toEqual({ kind: 'invalidInput' })
      expect(f.implementation).not.toHaveBeenCalled()
    } finally {
      await f.close()
    }
  })

  it('closes an unstarted consumed job after a lost consume reply, with original terminal/account/delivery', async () => {
    const { f, participants } = await admittedFixture({ consume: 'unknown' })
    try {
      await f.owner.submitPrepared(f.prepared)
      await f.owner.idle()
      await participants[0]!.stopped
      expect(f.implementation).not.toHaveBeenCalled()
      const view = await f.journal.read(scope, ref.callId)
      if (view.kind !== 'view') throw new Error('journal unavailable')
      expect(view.executions.get(ref.callId)?.terminal?.value).toMatchObject({
        terminal: { outcome: 'unavailable', reason: 'original_consume_unconfirmed' },
        account: { callId: ref.callId, cost: { total_usd: 0, items: [] } },
        delivery: { pass: 'after-action-pass' },
      })
    } finally {
      await f.close()
    }
  })

  it('does not report stopped while the original author is still running', async () => {
    const author = deferred<string>()
    const { f, participants } = await admittedFixture({ executor: async () => author.promise })
    try {
      await f.owner.submitPrepared(f.prepared)
      await vi.waitFor(() => expect(f.implementation).toHaveBeenCalledTimes(1))
      let stopped = false
      void participants[0]!.stopped.then(() => {
        stopped = true
      })
      const observer = await f.observer()
      observer.release()
      await Promise.resolve()
      expect(stopped).toBe(false)
      author.resolve('result')
      await f.owner.idle()
      await participants[0]!.stopped
      expect(stopped).toBe(true)
    } finally {
      author.resolve('result')
      await f.close()
    }
  })
})

it('recognizes a lost issue reply with the same participant and performs exactly one original call', async () => {
  const f = await admittedFixture({ stage: 'unknown' })
  try {
    await f.f.owner.submitPrepared(f.f.prepared)
    f.setStage(undefined)
    expect(await f.f.owner.submitPrepared(f.f.prepared)).toEqual({
      kind: 'recognized',
      execution: ref,
    })
    await f.f.owner.idle()
    expect(f.participants[1]).toBe(f.participants[0])
    expect(f.f.implementation).toHaveBeenCalledTimes(1)
    expect(f.claims.size).toBe(1)
  } finally {
    await f.f.close()
  }
})

it('does not revive a rolled back claim when the original job is staged again', async () => {
  const f = await admittedFixture({ stage: 'rollback', consume: 'deny' })
  try {
    await f.f.owner.submitPrepared(f.f.prepared)
    const oldClaim = [...f.claims.keys()][0]!
    f.setStage(undefined)
    await f.f.owner.submitPrepared(f.f.prepared)
    await f.f.owner.idle()
    expect(f.claims.size).toBe(2)
    expect(
      await f.f.log.fixtureStorage.atomic(unit =>
        f.participants[0]!.consumeOriginalIn(unit, oldClaim),
      ),
    ).toEqual({ kind: 'invalidInput' })
    expect(f.f.implementation).not.toHaveBeenCalled()
  } finally {
    await f.f.close()
  }
})

it('rejects a foreign StorageUnit before any original write', async () => {
  const f = await admittedFixture({ consume: 'deny' })
  const other = await fixture()
  try {
    await f.f.owner.submitPrepared(f.f.prepared)
    await f.f.owner.idle()
    await expect(
      other.log.fixtureStorage.atomic(unit => f.participants[0]!.stageOriginalIn(unit)),
    ).rejects.toThrow()
    expect(await other.log.readSince(scope.session, 0)).toEqual({ entries: [], tail: 0 })
    expect(f.f.implementation).not.toHaveBeenCalled()
  } finally {
    await other.close()
    await f.f.close()
  }
})

it('checks original current qualification again at consumption', async () => {
  let calls = 0
  const f = await fixture(undefined, undefined, undefined, undefined, async log => {
    await log.fixturePrefix(scope)
    let participant: ToolOriginalIssueParticipant
    return {
      ...support(log),
      current: {
        authorizeIn: async () =>
          ++calls === 1 ? { kind: 'authorized' } : { kind: 'staleAttempt' },
      },
      admission: {
        async admitOriginal(value) {
          participant = value
          const result = await log.fixtureStorage.atomic(unit => value.stageOriginalIn(unit))
          return result.kind === 'staged' ? { ...result, kind: 'issued' } : result
        },
        async consumeOriginal(claim) {
          const result = await log.fixtureStorage.atomic(unit =>
            participant.consumeOriginalIn(unit, claim),
          )
          return result.kind === 'staged' ? { ...result, kind: 'launch' } : result
        },
      },
    }
  })
  try {
    await f.owner.submitPrepared(f.prepared)
    await f.owner.idle()
    expect(calls).toBe(2)
    expect(f.implementation).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

it('does not stage or invoke after its original record owner closes', async () => {
  let changeGeneration = () => {}
  const f = await fixture(undefined, undefined, undefined, undefined, async log => {
    await log.fixturePrefix(scope)
    return {
      ...support(log),
      admission: {
        async admitOriginal(participant) {
          changeGeneration()
          const result = await log.fixtureStorage.atomic(unit => participant.stageOriginalIn(unit))
          expect(result).toEqual({ kind: 'closed' })
          return result.kind === 'staged' ? { ...result, kind: 'issued' } : result
        },
        consumeOriginal: async () => ({ kind: 'denied' }),
      },
    }
  })
  changeGeneration = () => {
    void f.journal.close()
  }
  try {
    expect(await f.owner.submitPrepared(f.prepared)).toEqual({
      kind: 'rejected',
      reason: 'runtimeUnavailable',
    })
    expect(f.implementation).not.toHaveBeenCalled()
    expect(await f.log.readSince(scope.session, 0)).toEqual({ entries: [], tail: 0 })
  } finally {
    await expect(f.owner.close()).rejects.toThrow('retains unresolved writes')
    await f.log.close()
    await rm(f.dir, { recursive: true, force: true })
  }
})

import { createToolOriginalIssueVerifier } from '../src/index.ts'

it('reads the native original identity in the caller unit after actual job close without new issue or author calls', async () => {
  const { f, participants } = await admittedFixture()
  try {
    await f.owner.submitPrepared(f.prepared)
    await f.owner.idle()
    await participants[0]!.stopped
    await f.owner.close()
    const original = participants[0]!.identity,
      verifier = createToolOriginalIssueVerifier(f.log.fixtureStorage),
      atomic = vi.spyOn(f.log.fixtureStorage, 'atomic')
    expect(await f.log.fixtureStorage.atomic(unit => verifier.verifyIn(unit, original))).toBe(true)
    expect(atomic).toHaveBeenCalledTimes(1)
    atomic.mockRestore()
    for (const changed of [
      { ...original, executionGeneration: 'other-native-generation' },
      { ...original, adoption: 'other-adoption' },
      { ...original, origin: { ...original.origin, attempt: 2 } },
    ])
      expect(await f.log.fixtureStorage.atomic(unit => verifier.verifyIn(unit, changed))).toBe(
        false,
      )
    await f.log.fixtureStorage.write(tx =>
      narrow<{ tool_original_issue: { identity: string } }>(tx)
        .updateTable('tool_original_issue')
        .set({ identity: '{invalid' })
        .execute(),
    )
    await expect(
      f.log.fixtureStorage.atomic(unit => verifier.verifyIn(unit, original)),
    ).rejects.toThrow('invalid original Tool identity')
    expect(f.implementation).toHaveBeenCalledTimes(1)
  } finally {
    await f.close()
  }
})

it('stages and consumes the original intent without the complete Session prefix capability', async () => {
  const { f, participants, consumes } = await admittedFixture({ forbidCompletePrefix: true })
  try {
    expect(await f.owner.submitPrepared(f.prepared)).toEqual({ kind: 'recorded', execution: ref })
    await f.owner.idle()
    await participants[0]!.stopped
    expect(f.implementation).toHaveBeenCalledTimes(1)
    expect(consumes()).toBe(1)
  } finally {
    await f.close()
  }
})

it('rejects the original stale coordinate without reading the full prefix or entering the author', async () => {
  const { f, consumes } = await admittedFixture({
    forbidCompletePrefix: true,
    advanceBeforeStage: true,
  })
  try {
    expect(await f.owner.submitPrepared(f.prepared)).toEqual({
      kind: 'rejected',
      reason: 'runtimeUnavailable',
    })
    await f.owner.idle()
    expect(f.implementation).not.toHaveBeenCalled()
    expect(consumes()).toBe(0)
    const rows = await f.log.fixtureStorage.read(tx =>
      narrow<{ tool_original_issue: { call: string } }>(tx)
        .selectFrom('tool_original_issue')
        .selectAll()
        .execute(),
    )
    expect(rows).toHaveLength(0)
  } finally {
    await f.close()
  }
})

it('persists the original terminal through the same-unit records when the legacy transition writer is unavailable', async () => {
  const { f } = await admittedFixture()
  let legacyTerminal = 0
  f.append.mockImplementation((session, entries, fence, condition) => {
    if (entries.some(entry => entry.dedupeKey?.includes('execution_ended'))) {
      legacyTerminal++
      throw new Error('legacy terminal writer forbidden')
    }
    return f.log.append(session, entries, fence, condition)
  })
  try {
    expect(await f.owner.submitPrepared(f.prepared)).toEqual({ kind: 'recorded', execution: ref })
    await f.owner.idle()
    const observer = await f.observer()
    try {
      expect(await observer.waitForEnd()).toHaveProperty('snapshot.state.phase', 'ended')
    } finally {
      observer.release()
    }
    expect(f.implementation).toHaveBeenCalledTimes(1)
    expect(legacyTerminal).toBe(0)
  } finally {
    await f.close()
  }
})

it('reads and finishes a retained native job without the complete Session reader', async () => {
  const entered = deferred<ContextReader['read']>()
  const returned = deferred<string>()
  const { f } = await admittedFixture({
    executor: async (_args, deps) => {
      entered.resolve(deps.context.read)
      return returned.promise
    },
  })
  try {
    expect(await f.owner.submitPrepared(f.prepared)).toEqual({ kind: 'recorded', execution: ref })
    const readContext = await entered.promise
    f.readSince.mockClear()
    f.readSince.mockImplementation(() => {
      throw new Error('complete Session reader unavailable during ordinary native read')
    })
    expect(await readContext(['workspace'])).toHaveProperty('kind', 'values')
    const observer = await f.observer()
    try {
      expect(await observer.read()).toHaveProperty('snapshot.state.phase', 'running')
      returned.resolve('done')
      await f.owner.idle()
      expect(await observer.read()).toHaveProperty('snapshot.state.phase', 'ended')
      expect(await observer.waitForEnd()).toHaveProperty('snapshot.state.phase', 'ended')
      expect(f.readSince).not.toHaveBeenCalled()
    } finally {
      observer.release()
    }
  } finally {
    f.readSince.mockImplementation(f.log.readSince)
    returned.resolve('done')
    await f.owner.idle()
    await f.close()
  }
})

it('retains the Session-classified terminal and original account when its commit reply is lost', async () => {
  const entered = deferred<void>()
  const returned = deferred<string>()
  let loseReply = false
  const classify = vi.fn<ToolOriginalIssueSupport['classifyTerminalIn']>(async unit => {
    unit.assertStorage(f.log.fixtureStorage)
    loseReply = true
    return { kind: 'classified', late: true }
  })
  const { f } = await admittedFixture({
    executor: async () => {
      entered.resolve()
      return returned.promise
    },
    classifyTerminalIn: classify,
  })
  try {
    expect(await f.owner.submitPrepared(f.prepared)).toEqual({ kind: 'recorded', execution: ref })
    await entered.promise
    const atomic = f.log.fixtureStorage.atomic.bind(f.log.fixtureStorage)
    const lost = vi.spyOn(f.log.fixtureStorage, 'atomic').mockImplementation(async use => {
      const result = await atomic(use)
      if (loseReply) {
        loseReply = false
        throw new StorageUnavailable('terminal committed; reply lost')
      }
      return result
    })
    returned.resolve('original-result')
    await f.owner.idle()
    lost.mockRestore()
    const observer = await f.observer()
    try {
      const result = await observer.read()
      expect(result).toMatchObject({
        snapshot: {
          state: {
            phase: 'ended',
            terminal: { outcome: 'completed', result: 'original-result' },
            account: { late: true, cost: { total_usd: 0 } },
          },
        },
      })
    } finally {
      observer.release()
    }
    expect(classify).toHaveBeenCalledTimes(1)
    expect(f.implementation).toHaveBeenCalledTimes(1)
  } finally {
    returned.resolve('original-result')
    await f.close()
  }
})

async function preparedFor(f: Awaited<ReturnType<typeof fixture>>) {
  return f.prepared
}

it('executes a prepared request without reading Session history or selecting the after-action chain', async () => {
  const { f } = await admittedFixture()
  const prepared = await preparedFor(f)
  f.readSince.mockImplementation(() => {
    throw new Error('prepared execution must not read complete Session history')
  })
  try {
    expect(await f.owner.submitPrepared(prepared)).toEqual({ kind: 'recorded', execution: ref })
    await f.owner.idle()
    const observer = await f.observer()
    try {
      expect(await observer.read()).toHaveProperty('snapshot.state.phase', 'ended')
    } finally {
      observer.release()
    }
    expect(f.readSince).not.toHaveBeenCalled()
    expect(f.implementation).toHaveBeenCalledTimes(1)
  } finally {
    f.readSince.mockImplementation(f.log.readSince)
    await f.close()
  }
})

it('recognizes concurrent copies of one prepared input without re-entering the author', async () => {
  const { f } = await admittedFixture()
  try {
    const prepared = await preparedFor(f)
    expect(
      await Promise.all([f.owner.submitPrepared(prepared), f.owner.submitPrepared(prepared)]),
    ).toEqual([
      { kind: 'recorded', execution: ref },
      { kind: 'recognized', execution: ref },
    ])
    await f.owner.idle()
    expect(f.implementation).toHaveBeenCalledTimes(1)
    expect(
      await f.owner.submitPrepared({
        ...prepared,
        afterAction: { ...prepared.afterAction, pass: 'changed-pass' },
      }),
    ).toEqual({ kind: 'rejected', reason: 'callConflict' })
    expect(f.implementation).toHaveBeenCalledTimes(1)
  } finally {
    await f.close()
  }
})

it('refuses a foreign prepared source and inconsistent arguments before invoking the author', async () => {
  const { f } = await admittedFixture()
  try {
    const prepared = await preparedFor(f)
    expect(await f.owner.submitPrepared({ ...prepared, args: { value: 'substituted' } })).toEqual({
      kind: 'rejected',
      reason: 'invalidInput',
    })
    expect(
      await f.owner.submitPrepared({
        ...prepared,
        source: { ...prepared.source, session: 'foreign' },
      } as unknown as import('@omne-harness-lite/tool-execution-runtime').PreparedToolExecution),
    ).toEqual({ kind: 'rejected', reason: 'invalidInput' })
    expect(f.implementation).not.toHaveBeenCalled()
    expect(await f.log.readSince(scope.session, 0)).toHaveProperty('entries', [])
  } finally {
    await f.close()
  }
})

it('checks the actual admission token before issuing a prepared Tool request', async () => {
  const { f } = await admittedFixture()
  try {
    const prepared = await preparedFor(f)
    const { admissionToken: _token, ...missing } = prepared
    expect(await f.owner.submitPrepared(missing)).toEqual({
      kind: 'rejected',
      reason: 'admissionMissing',
    })
    const verify = vi
      .spyOn(f.admission, 'verifyToken')
      .mockResolvedValue({ kind: 'invalid', reason: 'arguments_changed' })
    expect(await f.owner.submitPrepared(prepared)).toEqual({
      kind: 'rejected',
      reason: 'callConflict',
    })
    expect(verify).toHaveBeenCalledWith(
      prepared.access,
      scope,
      prepared.admissionToken,
      prepared.call,
    )
    expect(f.implementation).not.toHaveBeenCalled()
    expect(await f.log.readSince(scope.session, 0)).toHaveProperty('entries', [])
  } finally {
    await f.close()
  }
})

it('rolls back original claim consumption and its start record together', async () => {
  const { f, participants, claims } = await admittedFixture({ consume: 'deny' })
  try {
    expect(await f.owner.submitPrepared(f.prepared)).toEqual({ kind: 'recorded', execution: ref })
    await f.owner.idle()
    const failure = new Error('abort original consume unit')
    await expect(
      f.log.fixtureStorage.atomic(async unit => {
        expect(
          await participants[0]!.consumeOriginalIn(unit, [...claims.keys()][0]!),
        ).toHaveProperty('kind', 'staged')
        throw failure
      }),
    ).rejects.toBe(failure)
    const read = await f.log.readSince(scope.session, 0)
    if ('failure' in read) throw new Error('missing actual original log')
    const projected = projectToolJournal(scope, read.entries)
    if ('invalid' in projected) throw new Error('invalid actual Tool history')
    expect(projected.executions.get(ref.callId)?.started).toBeUndefined()
    const row = await f.log.fixtureStorage.read(tx =>
      narrow<{ tool_original_issue: { consumed: number } }>(tx)
        .selectFrom('tool_original_issue')
        .select('consumed')
        .executeTakeFirstOrThrow(),
    )
    expect(row.consumed).toBe(0)
    expect(f.implementation).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

it('retains an uncertain prepared admission and recognizes the original on an explicit retry', async () => {
  const state = await admittedFixture({ stage: 'unknown' })
  const { f } = state
  try {
    const prepared = await preparedFor(f)
    expect(await f.owner.submitPrepared(prepared)).toEqual({ kind: 'unknownCommit', original: ref })
    await f.owner.idle()
    expect(f.implementation).not.toHaveBeenCalled()
    state.setStage(undefined)
    expect(await f.owner.submitPrepared(prepared)).toEqual({ kind: 'recognized', execution: ref })
    await f.owner.idle()
    expect(f.implementation).toHaveBeenCalledTimes(1)
    expect(state.participants[0]).toBe(state.participants[1])
  } finally {
    await f.close()
  }
})

it.each(['unparseable', 'no_such_entry'] as const)(
  'records the prepared %s outcome without selecting or invoking an implementation',
  async reason => {
    const { f } = await admittedFixture()
    const ordinary = await preparedFor(f)
    const verify = vi.spyOn(f.admission, 'verifyToken')
    const { selected: _selected, args: _args, admissionToken: _token, ...common } = ordinary
    const { arguments: _arguments, ...unparsed } = request.call
    const supplied: import('@omne-harness-lite/tool-execution-runtime').PreparedToolExecution = {
      ...common,
      adoption: request.adoption,
      notExecutable: reason,
      call:
        reason === 'unparseable'
          ? { ...unparsed, unparseable: true, rawArguments: '{' }
          : request.call,
    }
    f.readSince.mockImplementation(() => {
      throw new Error('Session scan forbidden')
    })
    try {
      expect(await f.owner.submitPrepared(supplied)).toEqual({ kind: 'recorded', execution: ref })
      await f.owner.idle()
      const observer = await f.observer()
      try {
        const ended = await observer.waitForEnd()
        expect(ended).toMatchObject({
          kind: 'found',
          snapshot: {
            state: {
              phase: 'ended',
              terminal:
                reason === 'unparseable'
                  ? { outcome: 'failed', code: 'unparseable' }
                  : { outcome: 'unavailable', reason: 'no_such_entry' },
            },
          },
        })
      } finally {
        observer.release()
      }
      expect(f.implementation).not.toHaveBeenCalled()
      const read = await f.log.readSince(scope.session, 0)
      if ('failure' in read) throw new Error('original history unavailable')
      const history = projectToolJournal(scope, read.entries)
      if ('invalid' in history) throw new Error('invalid original history')
      expect(history.executions.get(ref.callId)?.started).toBeUndefined()
      expect(history.executions.get(ref.callId)?.terminal?.value.account.cost.total_usd).toBe(0)
      expect(verify).not.toHaveBeenCalled()
    } finally {
      f.readSince.mockImplementation(f.log.readSince)
      await f.close()
    }
  },
)

it('rejects a mixed execution/failure request and a failure inconsistent with its call', async () => {
  const { f } = await admittedFixture()
  try {
    const request = await preparedFor(f)
    expect(
      await f.owner.submitPrepared({
        ...request,
        notExecutable: 'no_such_entry',
      } as unknown as import('@omne-harness-lite/tool-execution-runtime').PreparedToolExecution),
    ).toEqual({ kind: 'rejected', reason: 'invalidInput' })
    const { selected, args: _args, ...common } = request
    if (!selected) throw new Error('selected fixture missing')
    expect(
      await f.owner.submitPrepared({
        ...common,
        adoption: selected.adoption,
        notExecutable: 'unparseable',
      }),
    ).toEqual({ kind: 'rejected', reason: 'invalidInput' })
    expect(f.implementation).not.toHaveBeenCalled()
    expect(await f.log.readSince(scope.session, 0)).toEqual({ entries: [], tail: 0 })
  } finally {
    await f.close()
  }
})
