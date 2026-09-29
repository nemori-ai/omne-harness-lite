import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import {
  judgeDefinition,
  judgePositionedSubject,
  type PositionedSubject,
} from '@omne-harness-lite/loop-extension'
import { judgeMessage } from '@omne-harness-lite/messages'
import { encodeModelLogKey } from '@omne-harness-lite/model-request-runtime'
import { openJsonlSessionLog, type SessionLog } from '@omne-harness-lite/session-log-jsonl'
import {
  createRunnerLogAdapter,
  createRunnerReminderLogAdapter,
  createRunnerTaskOwner,
  runPass,
  type RunnerLogBinding,
  type RunnerPiece,
  type RunnerPorts,
} from '../src/index.ts'

const at = '2026-09-29T00:00:00Z'
const tenant = parseTenantId({ organization: 'runner-org', account: 'runner-account' })
if (!('ok' in tenant)) throw new Error('invalid tenant fixture')
const binding: RunnerLogBinding = {
  session: 'runner-public-session',
  tenant: tenant.ok,
  logGeneration: 'generation-1',
}
const logHandle = parseOpaqueIdentifier('runner-log-handle', 'LogHandle')
const environment = parseOpaqueIdentifier('runner-environment-handle', 'EnvironmentHandle')
if (!('ok' in logHandle) || !('ok' in environment)) throw new Error('invalid handle fixture')
const admittedLogHandle = logHandle.ok
const admittedEnvironment = environment.ok
const session = parseOpaqueIdentifier(binding.session, 'SessionRef')
if (!('ok' in session)) throw new Error('invalid session fixture')
const admittedSession = session.ok

function initial(position: 'before_persist_message' | 'after_persist_message'): PositionedSubject {
  const result = judgePositionedSubject({
    position,
    subject: {
      message: { id: 'message-1', type: 'user', blocks: [], createdAt: at },
      ...(position === 'before_persist_message' ? { producer: 'user' } : {}),
    },
  })
  if (!('ok' in result)) throw new Error('invalid initial fixture')
  return result.ok
}

function piece(
  name: string,
  position: 'before_persist_message' | 'after_persist_message',
  power: 'observe' | 'veto' = 'observe',
): RunnerPiece {
  const result = judgeDefinition({
    name,
    position,
    power,
    implementation: { kind: 'builtin', builtinName: name },
  })
  if (!('ok' in result)) throw new Error('invalid definition fixture')
  return { definition: result.ok, power }
}

function ports(
  log: SessionLog,
  owner: ReturnType<typeof createRunnerTaskOwner>,
  bound: RunnerLogBinding,
  changes: Partial<RunnerPorts> = {},
): RunnerPorts {
  const adapter = createRunnerLogAdapter({
    log,
    binding: bound,
    owner,
    subjectForCandidate: () => initial('before_persist_message'),
  })
  return {
    ...adapter,
    readAskState: async () => ({ kind: 'unavailable' }),
    presence: async () => 'present',
    openHandles: async () => ({
      log: admittedLogHandle,
      environment: admittedEnvironment,
      release: () => {},
    }),
    invoke: async () => ({ kind: 'output', value: { kind: 'observed' } }),
    verifyFailure: async (_subject, _binding, _execution) => ({ kind: 'unavailable' }),
    judgeCapabilities: async () => ({ kind: 'accepted' }),
    now: () => at,
    mintReminder: () => 'reminder-id',
    isActive: () => true,
    fallbackNeedsProjection: async () => false,
    reminders: {
      inspect: async () => ({ kind: 'absent' }),
      nestedChain: async () => [],
      append: async () => ({ kind: 'confirmed' }),
    },
    ...changes,
  }
}

describe('public runner pass and actual SL3 log', () => {
  it('commits each result before the next invoke and reopens without invoking again', async () => {
    const root = resolve(process.cwd(), '../../../tmp/runner-public')
    await mkdir(root, { recursive: true })
    const dir = await mkdtemp(join(root, 'jsonl-'))
    const ownership = { current: 'runner-public-test', observeExit: async () => 'exited' as const }
    const chain = [
      piece('runner-a', 'before_persist_message'),
      piece('runner-b', 'before_persist_message'),
    ]
    const pass = {
      initial: initial('before_persist_message'),
      anchor: 'message-1',
      execution: { kind: 'noRun' } as const,
    }
    try {
      const log = await openJsonlSessionLog({ dir, processOwnership: ownership })
      const owner = createRunnerTaskOwner(binding)
      let invoked = 0
      const actual = ports(log, owner, binding, {
        invoke: async (_piece, input) => {
          invoked++
          expect(input.earlier).toHaveLength(invoked - 1)
          const current = await log.readByKey(
            admittedSession,
            'runner/5/["pass","before_persist_message",null,"message-1"]',
          )
          expect('entries' in current && current.entries.length).toBe(invoked - 1)
          return { kind: 'output', value: { kind: 'observed' } }
        },
      })
      try {
        const first = await runPass(pass, chain, actual, new AbortController().signal)
        expect(first).toMatchObject({ effect: { kind: 'proceed' } })
        expect('conclusions' in first && first.conclusions).toHaveLength(2)
        expect(invoked).toBe(2)
        const again = await runPass(pass, chain, actual, new AbortController().signal)
        expect(again).toEqual(first)
        expect(invoked).toBe(2)
      } finally {
        owner.closeAdmission()
        await owner.drain()
        await log.close()
      }
      const reopened = await openJsonlSessionLog({ dir, processOwnership: ownership })
      const secondBinding = { ...binding, logGeneration: 'generation-2' }
      const secondOwner = createRunnerTaskOwner(secondBinding)
      const resumed = ports(reopened, secondOwner, secondBinding, {
        invoke: async () => {
          throw new Error('replayed final must not invoke')
        },
      })
      try {
        const result = await runPass(pass, chain, resumed, new AbortController().signal)
        expect(result).toMatchObject({ effect: { kind: 'proceed' } })
        expect('conclusions' in result && result.conclusions).toHaveLength(2)
      } finally {
        secondOwner.closeAdmission()
        await secondOwner.drain()
        await reopened.close()
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects noRun after_model_call and withRun for an inbound user message before any port call', async () => {
    let called = 0
    const dummyLog: SessionLog = {
      append: async () => ({ failure: 'unavailable' }),
      readByKey: async () => ({ entries: [], tail: 0 }),
      readSince: async () => ({ entries: [], tail: 0 }),
    }
    const owner = createRunnerTaskOwner(binding)
    const fakePorts = ports(dummyLog, owner, binding, {
      readConclusions: async () => {
        called++
        return { entries: [], tail: 0 }
      },
    })
    const badUser = await runPass(
      {
        initial: initial('before_persist_message'),
        anchor: 'message-1',
        execution: { kind: 'withRun', run: 'run-1', attempt: 1 },
      },
      [],
      fakePorts,
      new AbortController().signal,
    )
    expect(badUser).toEqual({ failure: 'invalidInput' })
    const adaptation = {
      implementation: { name: 'vendor-a.family', revision: '1' },
      definition: { modelId: 'vendor-a/chat-large', revision: '1' },
      configuration: { revision: '1', values: {} },
    }
    const profile = {
      providers: ['provider-a'],
      allowFallback: true,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 200000,
      maxOutputTokens: 64000,
      inputConstraints: {},
      upstreamInputLimits: {
        maxInputTokens: { status: 'unknown' },
        maxRequestBytes: { status: 'unknown' },
      },
      adaptation,
      updatedAt: at,
    }
    const failure = judgePositionedSubject({
      position: 'after_model_call',
      dimension: { ending: 'failure' },
      subject: {
        failure: 'upstream_unavailable',
        profile,
        dispatches: [
          {
            adaptation,
            kind: 'model_call_dispatched',
            call: 'model-call-1',
            dispatch: 1,
            provider: 'provider-a',
            response: 'response-1',
            profile: { origin: 'official', routeName: 'vendor-a/chat-large' },
            profileSnapshot: profile,
            parameters: {},
            selectedBy: 'session',
            credentialScope: { layer: 'factory' },
          },
        ],
        retryConclusions: [],
      },
    })
    if (!('ok' in failure)) throw new Error('valid failure fixture rejected')
    const badModel = await runPass(
      {
        initial: failure.ok,
        anchor: 'failure-1',
        execution: { kind: 'noRun' },
      },
      [],
      fakePorts,
      new AbortController().signal,
    )
    expect(badModel).toEqual({ failure: 'invalidInput' })
    expect(called).toBe(0)
    owner.closeAdmission()
    await owner.drain()
  })

  it('admits noRun system input and refuses model/tool producers before any log read', async () => {
    let reads = 0
    const dummyLog: SessionLog = {
      append: async () => ({ failure: 'unavailable' }),
      readByKey: async () => ({ entries: [], tail: 0 }),
      readSince: async () => ({ entries: [], tail: 0 }),
    }
    const owner = createRunnerTaskOwner(binding)
    const actual = ports(dummyLog, owner, binding, {
      readConclusions: async () => {
        reads++
        return { entries: [], tail: 0 }
      },
    })
    const system = judgePositionedSubject({
      position: 'before_persist_message',
      subject: {
        message: {
          id: 'system-reminder-1',
          type: 'system_reminder',
          blocks: [],
          createdAt: at,
          nature: 'event',
          source: { kind: 'extension', extension: 'system-extension' },
        },
        producer: 'system',
      },
    })
    if (!('ok' in system)) throw new Error('valid system input rejected')
    expect(
      await runPass(
        { initial: system.ok, anchor: 'system-reminder-1', execution: { kind: 'noRun' } },
        [],
        actual,
        new AbortController().signal,
      ),
    ).toMatchObject({ effect: { kind: 'proceed' }, conclusions: [] })
    expect(reads).toBe(1)
    for (const producer of ['model', 'tool'] as const) {
      const inadmissible = judgePositionedSubject({
        position: 'before_persist_message',
        subject: {
          message: { id: 'message-1', type: 'user', blocks: [], createdAt: at },
          producer,
        },
      })
      if (!('ok' in inadmissible)) throw new Error('producer fixture rejected')
      expect(
        await runPass(
          { initial: inadmissible.ok, anchor: 'message-1', execution: { kind: 'noRun' } },
          [],
          actual,
          new AbortController().signal,
        ),
      ).toEqual({ failure: 'invalidInput' })
    }
    expect(reads).toBe(1)
    owner.closeAdmission()
    await owner.drain()
  })

  it('records an ordinary capability rejection under veto policy before the next piece', async () => {
    const root = resolve(process.cwd(), '../../../tmp/runner-public')
    await mkdir(root, { recursive: true })
    const dir = await mkdtemp(join(root, 'policy-'))
    const log = await openJsonlSessionLog({
      dir,
      processOwnership: { current: 'runner-policy-test', observeExit: async () => 'exited' },
    })
    const owner = createRunnerTaskOwner(binding)
    let invoked = 0
    let minted = 0
    const actual = ports(log, owner, binding, {
      invoke: async () => {
        invoked++
        return { kind: 'output', value: { kind: 'observed' } }
      },
      judgeCapabilities: async () => ({ kind: 'rejected', reason: 'capability_denied' }),
      mintReminder: () => {
        minted++
        return 'unused-reminder'
      },
    })
    try {
      const result = await runPass(
        {
          initial: initial('before_persist_message'),
          anchor: 'message-1',
          execution: { kind: 'noRun' },
        },
        [
          piece('runner-veto', 'before_persist_message', 'veto'),
          piece('runner-next', 'before_persist_message'),
        ],
        actual,
        new AbortController().signal,
      )
      expect(result).toMatchObject({
        effect: { kind: 'vetoed', by: 'runner-veto' },
        conclusions: [{ skipped: 'errored', error: 'capability_denied' }],
      })
      expect(invoked).toBe(1)
      expect(minted).toBe(0)
      const saved = await log.readByKey(
        admittedSession,
        'runner/5/["pass","before_persist_message",null,"message-1"]',
      )
      expect(saved).toMatchObject({ entries: [{ dedupeKey: expect.any(String) }] })
    } finally {
      owner.closeAdmission()
      await owner.drain()
      await log.close()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns cancelled while an admitted append finishes under the long-lived owner', async () => {
    const root = resolve(process.cwd(), '../../../tmp/runner-public')
    await mkdir(root, { recursive: true })
    const dir = await mkdtemp(join(root, 'late-append-'))
    const log = await openJsonlSessionLog({
      dir,
      processOwnership: { current: 'runner-late-test', observeExit: async () => 'exited' },
    })
    const owner = createRunnerTaskOwner(binding)
    const controller = new AbortController()
    let enter: (() => void) | undefined
    const entered = new Promise<void>(resolve => {
      enter = resolve
    })
    let proceed: (() => void) | undefined
    const gate = new Promise<void>(resolve => {
      proceed = resolve
    })
    const delayed: SessionLog = {
      readByKey: log.readByKey,
      readSince: log.readSince,
      append: async (...args) => {
        enter?.()
        await gate
        return log.append(...args)
      },
    }
    const chain = [piece('runner-late', 'before_persist_message')]
    try {
      const request = runPass(
        {
          initial: initial('before_persist_message'),
          anchor: 'message-1',
          execution: { kind: 'noRun' },
        },
        chain,
        ports(delayed, owner, binding),
        controller.signal,
      )
      await entered
      controller.abort()
      expect(await request).toEqual({ failure: 'cancelled' })
      owner.closeAdmission()
      let drained = false
      const draining = owner.drain().then(() => {
        drained = true
      })
      await Promise.resolve()
      expect(drained).toBe(false)
      proceed?.()
      await draining
      const read = await log.readByKey(
        admittedSession,
        'runner/5/["pass","before_persist_message",null,"message-1"]',
      )
      expect(read).toMatchObject({ entries: [{ dedupeKey: expect.any(String) }] })
    } finally {
      proceed?.()
      owner.closeAdmission()
      await owner.drain()
      await log.close()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('persists an injected reminder through the shared mrr/3 key after its nested pass', async () => {
    const root = resolve(process.cwd(), '../../../tmp/runner-public')
    await mkdir(root, { recursive: true })
    const dir = await mkdtemp(join(root, 'inject-'))
    const log = await openJsonlSessionLog({
      dir,
      processOwnership: { current: 'runner-inject-test', observeExit: async () => 'exited' },
    })
    const owner = createRunnerTaskOwner(binding)
    const message = judgeMessage({
      id: 'injected-reminder',
      type: 'system_reminder',
      blocks: [],
      createdAt: at,
      nature: 'event',
      source: { kind: 'extension', extension: 'runner-inject' },
    })
    const definition = judgeDefinition({
      name: 'runner-inject',
      position: 'before_persist_message',
      power: 'rewrite',
      implementation: { kind: 'builtin', builtinName: 'runner-inject' },
    })
    if (!('ok' in message) || message.ok.type !== 'system_reminder' || !('ok' in definition))
      throw new Error('inject fixture rejected')
    const injected = message.ok
    const shared = createRunnerReminderLogAdapter({
      log,
      binding,
      owner,
      readMessagePrefix: async () => [],
    })
    let invoked = 0
    const actual = ports(log, owner, binding, {
      invoke: async () => {
        invoked++
        return { kind: 'output', value: { kind: 'inject', message: injected } }
      },
      reminders: { ...shared, nestedChain: async () => [] },
    })
    try {
      const result = await runPass(
        {
          initial: initial('before_persist_message'),
          anchor: 'message-1',
          execution: { kind: 'noRun' },
        },
        [{ definition: definition.ok, power: 'rewrite' }],
        actual,
        new AbortController().signal,
      )
      expect(result).toMatchObject({ effect: { kind: 'proceed' } })
      expect(invoked).toBe(1)
      const key = encodeModelLogKey({ kind: 'message', message: injected.id })
      if (!('ok' in key)) throw new Error('reminder key rejected')
      expect(await log.readByKey(admittedSession, key.ok)).toMatchObject({
        entries: [{ dedupeKey: key.ok }],
      })
    } finally {
      owner.closeAdmission()
      await owner.drain()
      await log.close()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('adopts the complete SL3 winner when two noRun passes race on the same key', async () => {
    const root = resolve(process.cwd(), '../../../tmp/runner-public')
    await mkdir(root, { recursive: true })
    const dir = await mkdtemp(join(root, 'race-'))
    const ownership = { current: 'runner-race-test', observeExit: async () => 'exited' as const }
    const pass = {
      initial: initial('before_persist_message'),
      anchor: 'message-1',
      execution: { kind: 'noRun' } as const,
    }
    const chain = [piece('runner-racer', 'before_persist_message')]
    const log = await openJsonlSessionLog({ dir, processOwnership: ownership })
    const leftOwner = createRunnerTaskOwner(binding)
    const rightOwner = createRunnerTaskOwner(binding)
    let arrived = 0
    let releaseReads: (() => void) | undefined
    const bothRead = new Promise<void>(resolve => {
      releaseReads = resolve
    })
    function racing(owner: ReturnType<typeof createRunnerTaskOwner>, instant: string): RunnerPorts {
      const ordinary = ports(log, owner, binding, { now: () => instant })
      return {
        ...ordinary,
        readConclusions: async current => {
          const read = await ordinary.readConclusions(current)
          arrived++
          if (arrived === 2) releaseReads?.()
          await bothRead
          return read
        },
      }
    }
    try {
      const [left, right] = await Promise.all([
        runPass(pass, chain, racing(leftOwner, at), new AbortController().signal),
        runPass(
          pass,
          chain,
          racing(rightOwner, '2026-09-29T00:00:01Z'),
          new AbortController().signal,
        ),
      ])
      expect(left).toMatchObject({ effect: { kind: 'proceed' } })
      expect(right).toEqual(left)
      const persisted = await log.readSince(admittedSession, 0)
      expect('entries' in persisted && persisted.entries).toHaveLength(1)
    } finally {
      leftOwner.closeAdmission()
      rightOwner.closeAdmission()
      await Promise.all([leftOwner.drain(), rightOwner.drain()])
      await log.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
