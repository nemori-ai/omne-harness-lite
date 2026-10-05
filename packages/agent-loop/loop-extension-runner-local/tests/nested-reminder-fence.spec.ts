import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isJsonNumber } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import {
  judgeDefinition,
  judgePositionedSubject,
  type ExtensionInput,
  type PositionedSubject,
} from '@omne-harness-lite/loop-extension'
import {
  judgeMessage,
  type LoggedMessage,
  type SystemReminderMessage,
} from '@omne-harness-lite/messages'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import { type AppendFence, type SessionLog } from '@omne-harness-lite/session-log'
import { createRunnerLogAdapter } from '../src/run-log.ts'
import { createRunnerReminderLogAdapter } from '../src/reminder-log.ts'
import { createRunnerTaskOwner } from '../src/task-owner.ts'
import { runPass } from '../src/run-pass.ts'
import {
  type RunnerPass,
  type RunnerPiece,
  type RunnerPorts,
} from '@omne-harness-lite/loop-extension-runner'

const at = '2026-09-29T06:00:00Z'
const tenant = parseTenantId({ organization: 'nested-org', account: 'nested-account' })
const session = parseOpaqueIdentifier('nested-session', 'SessionRef')
const logHandle = parseOpaqueIdentifier('nested-log', 'LogHandle')
const environment = parseOpaqueIdentifier('nested-environment', 'EnvironmentHandle')
if (!('ok' in tenant) || !('ok' in session) || !('ok' in logHandle) || !('ok' in environment))
  throw new Error('invalid identities')
const tenantId = tenant.ok,
  sessionId = session.ok,
  inputLog = logHandle.ok,
  inputEnvironment = environment.ok
const execution = { kind: 'withRun', run: 'nested-run', attempt: 7 } as const

function subject(value: unknown): PositionedSubject {
  const judged = judgePositionedSubject(value)
  if (!('ok' in judged)) throw new Error('invalid subject')
  return judged.ok
}
function reminder(id = 'nested-reminder'): SystemReminderMessage {
  const judged = judgeMessage({
    id,
    type: 'system_reminder',
    blocks: [],
    createdAt: at,
    nature: 'event',
    source: { kind: 'extension', extension: 'outer-extension' },
  })
  if (!('ok' in judged) || judged.ok.type !== 'system_reminder') throw new Error('invalid reminder')
  return judged.ok
}
function piece(
  name: string,
  position: 'after_persist_message' | 'before_persist_message',
  power: 'rewrite' | 'veto' = 'rewrite',
): RunnerPiece {
  const judged = judgeDefinition({
    name,
    position,
    power,
    implementation: { kind: 'builtin', builtinName: name },
  })
  if (!('ok' in judged)) throw new Error('invalid definition')
  return { definition: judged.ok, power }
}
const outerPiece = piece('outer-extension', 'after_persist_message')
const nestedPiece = piece('nested-extension', 'before_persist_message', 'veto')
const pass: RunnerPass = {
  initial: subject({
    position: 'after_persist_message',
    subject: { message: { id: 'outer-message', type: 'user', blocks: [], createdAt: at } },
  }),
  anchor: 'outer-message',
  execution,
}

async function fixture() {
  const root = resolve(process.cwd(), '../../../tmp/runner-inject-fix/files')
  await mkdir(root, { recursive: true })
  const dir = await mkdtemp(join(root, 'nested-'))
  const log = await openJsonlSessionLog({
    dir,
    processOwnership: { current: 'nested-test-process', observeExit: async () => 'exited' },
  })
  const binding = { session: sessionId, tenant: tenantId, logGeneration: 'nested-generation' }
  const owner = createRunnerTaskOwner(binding)
  const fences: AppendFence[] = []
  const observedLog: SessionLog = {
    ...log,
    append: async (...args) => {
      fences.push(args[2])
      return log.append(...args)
    },
  }
  let current = pass.initial
  const adapter = createRunnerLogAdapter({
    log: observedLog,
    binding,
    owner,
    subjectForCandidate: () => current,
  })
  const messages = createRunnerReminderLogAdapter({
    log: observedLog,
    binding,
    owner,
    readMessagePrefix: async () => {
      const read = await log.readSince(sessionId, 0)
      if (!('entries' in read)) return { unavailable: true }
      const result: LoggedMessage[] = []
      for (const entry of read.entries) {
        const value = entry.payload
        if (
          value === null ||
          typeof value !== 'object' ||
          Array.isArray(value) ||
          isJsonNumber(value) ||
          !('category' in value) ||
          !('value' in value) ||
          value.category !== 'message'
        )
          continue
        const judged = judgeMessage(value.value)
        if (!('ok' in judged) || judged.ok.type === 'system') return { unavailable: true }
        result.push(judged.ok)
      }
      return result
    },
  })
  const inputs: ExtensionInput[] = []
  let released = 0
  const ports: RunnerPorts = {
    ...adapter,
    readConclusions: async value => {
      current = value.initial
      return adapter.readConclusions(value)
    },
    readAskState: async () => ({ kind: 'unavailable' }),
    presence: async () => 'present',
    openHandles: async () => ({
      log: inputLog,
      environment: inputEnvironment,
      release: () => {
        released++
      },
    }),
    invoke: async (_piece, input) => {
      inputs.push(input)
      return {
        kind: 'output',
        value:
          input.position === 'after_persist_message'
            ? { kind: 'inject', message: reminder() }
            : { kind: 'observed' },
      }
    },
    verifyFailure: async (_subject, _binding, _execution) => ({ kind: 'unavailable' }),
    judgeCapabilities: async () => ({ kind: 'accepted' }),
    now: () => at,
    mintReminder: () => 'recorded-error-reminder',
    isActive: () => true,
    fallbackNeedsProjection: async () => false,
    reminders: { ...messages, nestedChain: async () => [nestedPiece] },
  }
  return {
    log,
    owner,
    ports,
    inputs,
    fences,
    released: () => released,
    async rows() {
      const read = await log.readSince(sessionId, 0)
      if (!('entries' in read)) throw new Error('log unavailable')
      return read.entries
    },
    async close() {
      owner.closeAdmission()
      await owner.drain()
      await log.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}

describe('private reminder nesting preserves its outer fence', () => {
  for (const mode of ['inject', 'record'] as const)
    it(`${mode}: nonempty nested chain gets no Run input, writes stay fenced, replay is exact`, async () => {
      const actual = await fixture()
      const ports: RunnerPorts =
        mode === 'inject'
          ? actual.ports
          : {
              ...actual.ports,
              invoke: async (piece, input, signal, invocation) => {
                if (input.position === 'after_persist_message') {
                  actual.inputs.push(input)
                  return { kind: 'errored', error: 'ordinary contributor failure' }
                }
                return actual.ports.invoke(piece, input, signal, invocation)
              },
            }
      try {
        const chain = [{ ...outerPiece, onError: 'record' as const }]
        const first = await runPass(pass, chain, ports, new AbortController().signal)
        expect(first).toMatchObject({ effect: { kind: 'proceed' } })
        expect(actual.inputs).toHaveLength(2)
        expect(actual.inputs[0]).toMatchObject({ run: execution.run, attempt: 7 })
        expect(actual.inputs[1]).toMatchObject({
          position: 'before_persist_message',
          subject: { producer: 'system' },
        })
        expect(Object.hasOwn(actual.inputs[1] ?? {}, 'run')).toBe(false)
        expect(Object.hasOwn(actual.inputs[1] ?? {}, 'attempt')).toBe(false)
        expect(actual.fences).toEqual(
          Array.from({ length: 3 }, () => ({ kind: 'fenced', run: execution.run, attempt: 7 })),
        )
        const before = await actual.rows()
        expect(before).toHaveLength(3)
        for (const entry of before) expect(entry).toMatchObject({ run: execution.run, attempt: 7 })
        expect(await runPass(pass, chain, ports, new AbortController().signal)).toEqual(first)
        expect(actual.inputs).toHaveLength(2)
        expect(await actual.rows()).toEqual(before)
        expect(actual.released()).toBe(2)
      } finally {
        await actual.close()
      }
    })

  it('public system + withRun and malformed outer execution remain rejected before invoking ports', async () => {
    const actual = await fixture()
    let reads = 0
    const ports = {
      ...actual.ports,
      readConclusions: async (pass: RunnerPass) => {
        reads++
        return actual.ports.readConclusions(pass)
      },
    }
    try {
      const external = {
        initial: subject({
          position: 'before_persist_message',
          subject: { message: reminder(), producer: 'system' },
        }),
        anchor: 'nested-reminder',
        execution,
        nested: true,
      }
      expect(await runPass(external, [nestedPiece], ports, new AbortController().signal)).toEqual({
        failure: 'invalidInput',
      })
      for (const invalid of [
        { ...execution, run: '' },
        { ...execution, attempt: 0 },
        { ...execution, attempt: 1.5 },
      ])
        expect(
          await runPass(
            { ...pass, execution: invalid },
            [outerPiece],
            ports,
            new AbortController().signal,
          ),
        ).toEqual({ failure: 'invalidInput' })
      expect(reads).toBe(0)
      expect(actual.inputs).toHaveLength(0)
      expect(await actual.rows()).toHaveLength(0)
    } finally {
      await actual.close()
    }
  })

  it('nested veto suppresses only the reminder and does not rerun the nested contributor', async () => {
    const actual = await fixture()
    const ports: RunnerPorts = {
      ...actual.ports,
      invoke: async (piece, input, signal, mode) => {
        if (input.position === 'before_persist_message') {
          actual.inputs.push(input)
          return { kind: 'output', value: { kind: 'veto', reason: 'do not persist this reminder' } }
        }
        return actual.ports.invoke(piece, input, signal, mode)
      },
    }
    try {
      const first = await runPass(pass, [outerPiece], ports, new AbortController().signal)
      expect(first).toMatchObject({ effect: { kind: 'proceed' } })
      expect(await actual.rows()).toHaveLength(2)
      expect(await runPass(pass, [outerPiece], ports, new AbortController().signal)).toEqual(first)
      expect(actual.inputs).toHaveLength(2)
      expect(await actual.rows()).toHaveLength(2)
    } finally {
      await actual.close()
    }
  })

  it('a newer actual SL3 attempt rejects the nested conclusion and prevents the reminder', async () => {
    const actual = await fixture()
    const ports: RunnerPorts = {
      ...actual.ports,
      invoke: async (piece, input, signal, mode) => {
        if (input.position === 'before_persist_message') {
          expect(
            await actual.log.append(
              sessionId,
              [
                {
                  tenant: tenantId,
                  run: execution.run,
                  attempt: 8,
                  readKeys: [],
                  payload: { newer: true },
                },
              ],
              { kind: 'fenced', run: execution.run, attempt: 8 },
              { kind: 'unconditional' },
            ),
          ).toHaveProperty('positions')
        }
        return actual.ports.invoke(piece, input, signal, mode)
      },
    }
    try {
      expect(await runPass(pass, [outerPiece], ports, new AbortController().signal)).toEqual({
        failure: 'attemptSuperseded',
      })
      expect(await actual.rows()).toHaveLength(2)
      expect(actual.fences).toHaveLength(2)
    } finally {
      await actual.close()
    }
  })
})

describe('cancellation at returned control-source boundaries', () => {
  for (const state of ['pending', 'ready'] as const)
    it(`cancel while waiting source returns ${state}: no effect or reinvocation`, async () => {
      const actual = await fixture()
      const controller = new AbortController()
      const askPiece = piece('ask-extension', 'after_persist_message', 'veto')
      let invoked = 0,
        released = 0
      const ports: RunnerPorts = {
        ...actual.ports,
        invoke: async () => {
          invoked++
          return {
            kind: 'output',
            value: {
              kind: 'ask',
              card: {
                explanation: 'Choose',
                options: [{ id: 'yes', label: 'Yes' }],
                about: { position: 'after_persist_message' },
              },
            },
          }
        },
        readAskState: async association => {
          await Promise.resolve()
          controller.abort()
          return state === 'pending'
            ? { kind: 'pending', association }
            : {
                kind: 'ready',
                binding: {
                  association,
                  cardId: 'card-1',
                  batchId: 'batch-1',
                  answerId: 'answer-1',
                  control: () => 'valid',
                  release: () => {
                    released++
                  },
                },
              }
        },
      }
      try {
        expect(await runPass(pass, [askPiece], ports, new AbortController().signal)).toMatchObject({
          effect: { kind: 'asked' },
        })
        expect(await runPass(pass, [askPiece], ports, controller.signal)).toEqual({
          failure: 'cancelled',
        })
        expect(invoked).toBe(1)
        expect(released).toBe(state === 'ready' ? 1 : 0)
        expect(actual.released()).toBe(1)
        expect(await actual.rows()).toHaveLength(1)
      } finally {
        await actual.close()
      }
    })

  for (const point of ['presence', 'handles', 'nested-handles'] as const)
    it(`cancel while ${point} completes does not start another contributor`, async () => {
      const actual = await fixture()
      const controller = new AbortController()
      const ports: RunnerPorts = {
        ...actual.ports,
        presence: async () => {
          await Promise.resolve()
          if (point === 'presence') controller.abort()
          return 'present'
        },
        openHandles: async (piece, mode) => {
          const handles = await actual.ports.openHandles(piece, mode)
          if (
            point === 'handles' ||
            (point === 'nested-handles' && piece.definition.position === 'before_persist_message')
          )
            controller.abort()
          return handles
        },
      }
      try {
        expect(await runPass(pass, [outerPiece], ports, controller.signal)).toEqual({
          failure: 'cancelled',
        })
        expect(actual.inputs).toHaveLength(point === 'nested-handles' ? 1 : 0)
        expect(await actual.rows()).toHaveLength(point === 'nested-handles' ? 1 : 0)
        expect(actual.released()).toBe(point === 'presence' ? 0 : point === 'handles' ? 1 : 2)
      } finally {
        await actual.close()
      }
    })
})
