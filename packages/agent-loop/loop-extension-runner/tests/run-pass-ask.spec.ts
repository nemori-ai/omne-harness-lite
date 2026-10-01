import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import { judgeDefinition, judgePositionedSubject } from '@omne-harness-lite/loop-extension'
import { checkAppendInput, type LogEntry } from '@omne-harness-lite/session-log-jsonl'
import {
  passKeys,
  runPass,
  type RunnerAskAssociation,
  type RunnerInvocationResult,
  type RunnerPorts,
} from '../src/index.ts'

const at = '2026-09-29T00:00:00Z'
const tenant = parseTenantId({ organization: 'runner-org', account: 'runner-account' })
const session = parseOpaqueIdentifier('runner-ask-session', 'SessionRef')
const logHandle = parseOpaqueIdentifier('runner-ask-log', 'LogHandle')
const nextLogHandle = parseOpaqueIdentifier('runner-ask-log-new', 'LogHandle')
const environment = parseOpaqueIdentifier('runner-ask-env', 'EnvironmentHandle')
const input = judgePositionedSubject({
  position: 'after_persist_message',
  subject: { message: { id: 'message-ask', type: 'user', blocks: [], createdAt: at } },
})
const definition = judgeDefinition({
  name: 'runner-ask',
  position: 'after_persist_message',
  power: 'veto',
  implementation: { kind: 'builtin', builtinName: 'runner-ask' },
})
if (
  !('ok' in tenant) ||
  !('ok' in session) ||
  !('ok' in logHandle) ||
  !('ok' in nextLogHandle) ||
  !('ok' in environment) ||
  !('ok' in input) ||
  !('ok' in definition)
)
  throw new Error('runner ask fixture rejected')
const acceptedTenant = tenant.ok
const acceptedSession = session.ok
const acceptedLogHandle = logHandle.ok
const acceptedNextLogHandle = nextLogHandle.ok
const acceptedEnvironment = environment.ok
const acceptedInput = input.ok
const acceptedDefinition = definition.ok
const pass = {
  initial: acceptedInput,
  anchor: 'message-ask',
  execution: { kind: 'withRun', run: 'run-ask', attempt: 1 } as const,
}
const piece = { definition: acceptedDefinition, power: 'veto' as const }
const card = {
  explanation: 'Choose one',
  options: [{ id: 'yes', label: 'Yes' }],
  about: { position: 'after_persist_message' },
}

function controlled() {
  const entries: LogEntry[] = []
  let invocation = 0
  let opened = 0
  let released = 0
  let phase: 'pending' | 'ready' | 'wrong' | 'unavailable' = 'pending'
  let control: 'valid' | 'replayInconsistent' | 'unavailable' = 'valid'
  const ports: RunnerPorts = {
    binding: { session: acceptedSession, tenant: acceptedTenant, logGeneration: 'ask-generation' },
    readConclusions: async current => {
      const key = passKeys({ position: current.initial.position, anchor: current.anchor })
      if ('invalidInput' in key) return { failure: 'invalidInput' }
      return {
        entries: entries.filter(entry => entry.readKeys.includes(key.pass)),
        tail: entries.length,
      }
    },
    readAskState: async association => {
      if (phase === 'unavailable') return { kind: 'unavailable' }
      if (phase === 'wrong')
        return { kind: 'ready', binding: binding({ ...association, piece: 'other-piece' }) }
      if (phase === 'pending') return { kind: 'pending', association }
      return { kind: 'ready', binding: binding(association) }
    },
    presence: async () => 'present',
    openHandles: async () => {
      opened++
      return {
        log: opened === 1 ? acceptedLogHandle : acceptedNextLogHandle,
        environment: acceptedEnvironment,
        release: () => {
          released++
        },
      }
    },
    invoke: async (_piece, current, _signal, mode) => {
      invocation++
      expect(current.earlier).toEqual([])
      if (mode.kind === 'fresh') return { kind: 'output', value: { kind: 'ask', card } }
      expect(current.log).toBe(acceptedNextLogHandle)
      return { kind: 'output', value: { kind: 'observed' } }
    },
    verifyFailure: async (_subject, _binding, _execution) => ({ kind: 'unavailable' }),
    judgeCapabilities: async () => ({ kind: 'accepted' }),
    record: async entry => {
      const checked = checkAppendInput(
        acceptedSession,
        [entry],
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
      if (!('ok' in checked) || checked.ok.entries[0] === undefined) return { kind: 'invalidInput' }
      const admitted = checked.ok.entries[0]
      const existing = entries.find(previous => previous.dedupeKey === admitted.dedupeKey)
      if (existing !== undefined) return { kind: 'alreadyRecorded', entry: existing }
      const stored: LogEntry = {
        ...admitted,
        session: acceptedSession,
        position: entries.length + 1,
      }
      entries.push(stored)
      return { kind: 'confirmed', entry: stored }
    },
    now: () => at,
    mintReminder: () => 'reminder-ask',
    isActive: () => true,
    fallbackNeedsProjection: async () => false,
    reminders: {
      inspect: async () => ({ kind: 'absent' }),
      nestedChain: async () => [],
      append: async () => ({ kind: 'confirmed' }),
    },
  }
  function binding(association: RunnerAskAssociation) {
    return {
      association,
      cardId: 'card-ask',
      batchId: 'batch-ask',
      answerId: 'answer-ask',
      control: () => control,
      release: () => {},
    } as const
  }
  return {
    ports,
    entries,
    setPhase(value: typeof phase) {
      phase = value
    },
    setControl(value: typeof control) {
      control = value
    },
    counts: () => ({ invocation, opened, released }),
  }
}

describe('ask readiness and replay are separate control facts', () => {
  it('keeps pending ask, replays only its piece, and retains every round in history', async () => {
    const source = controlled()
    const first = await runPass(pass, [piece], source.ports, new AbortController().signal)
    expect(first).toMatchObject({ effect: { kind: 'asked' } })
    expect(source.entries).toHaveLength(1)
    const pending = await runPass(pass, [piece], source.ports, new AbortController().signal)
    expect(pending).toEqual(first)
    expect(source.counts().invocation).toBe(1)
    source.setPhase('ready')
    const ready = await runPass(pass, [piece], source.ports, new AbortController().signal)
    expect(ready).toMatchObject({ effect: { kind: 'proceed' } })
    expect('conclusions' in ready && ready.conclusions).toHaveLength(2)
    expect(source.entries).toHaveLength(2)
    expect(source.counts()).toEqual({ invocation: 2, opened: 2, released: 2 })
    const final = await runPass(pass, [piece], source.ports, new AbortController().signal)
    expect(final).toEqual(ready)
    expect(source.counts().invocation).toBe(2)
  })

  it('rejects wrong ask association and latches replay deviation despite a normal output', async () => {
    const source = controlled()
    await runPass(pass, [piece], source.ports, new AbortController().signal)
    source.setPhase('wrong')
    expect(await runPass(pass, [piece], source.ports, new AbortController().signal)).toEqual({
      failure: 'replayInconsistent',
    })
    source.setPhase('unavailable')
    expect(await runPass(pass, [piece], source.ports, new AbortController().signal)).toEqual({
      failure: 'unavailable',
    })
    source.setPhase('ready')
    source.setControl('replayInconsistent')
    expect(await runPass(pass, [piece], source.ports, new AbortController().signal)).toEqual({
      failure: 'replayInconsistent',
    })
    expect(source.entries).toHaveLength(1)
  })

  it('invalidates handles on cancellation and consumes a late contributor rejection', async () => {
    const source = controlled()
    const controller = new AbortController()
    let started: (() => void) | undefined
    const entered = new Promise<void>(resolve => {
      started = resolve
    })
    let rejectLate: ((reason: Error) => void) | undefined
    const pending = runPass(
      pass,
      [piece],
      {
        ...source.ports,
        invoke: async () =>
          new Promise<RunnerInvocationResult>((_resolve, reject) => {
            rejectLate = reject
            started?.()
          }),
      },
      controller.signal,
    )
    await entered
    controller.abort()
    expect(await pending).toEqual({ failure: 'cancelled' })
    expect(source.counts().released).toBe(1)
    rejectLate?.(new Error('late contributor failure'))
    await Promise.resolve()
    expect(source.entries).toHaveLength(0)
  })
})
