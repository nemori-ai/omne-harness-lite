import { describe, expect, it } from 'vitest'
import { copyJsonValue, type JsonObject } from '@omne-harness-lite/content-blocks'
import { judgeMessage } from '@omne-harness-lite/messages'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import { readSettlementPrefix, type SettlementPrefix } from '../src/settlement-prefix.ts'
import { captureModelLogValue, prepareModelLogEntry } from '../src/log-codec.ts'
import { authorizedCalibration } from '../src/service-calibration.ts'
import { copyPlanOutputHistory } from '../src/output-history.ts'
import type { CurrentHistoryReaders } from '../src/service-types.ts'
import type { LogEntry } from '@omne-harness-lite/session-log-jsonl'
import {
  batch,
  binding,
  dispatched,
  jsonObject,
  opened,
  reply,
  response,
  session,
} from './log-codec-fixture.ts'
import { controlled, type ControlledSettlementOwner } from './settlement-fixture.ts'
import type { SettlementLogBinding } from '../src/settlement-types.ts'

const digest = (character: string) => character.repeat(64)
function bodyValue(value: ModelResponse): JsonObject {
  const copied = copyJsonValue(value)
  if (!('ok' in copied)) throw new Error('JSON response fixture')
  return jsonObject(copied.ok)
}
function entryAt(prefix: SettlementPrefix, index: number): LogEntry {
  const entry = prefix.entries[index]
  if (entry === undefined) throw new Error(`missing entry ${index}`)
  return entry
}
function isModelResponse(value: unknown): value is ModelResponse {
  return 'ok' in judgeModelResponse(value)
}
function knownResponse(source: 'reply' | 'delivered'): ModelResponse {
  const { reply: originalReply, replyDisposition: disposition, ...base } = response
  const candidate = {
    ...base,
    ...(source === 'reply'
      ? { reply: originalReply, replyDisposition: disposition }
      : {
          outcome: 'failed',
          failure: { cause: 'interrupted_mid_reply' },
          delivered: reply.blocks,
        }),
    inputCalibration: {
      requestInput: {
        kind: 'known',
        projectionRevision: 'fixture-v1',
        prefixBoundary: 1,
        prefixDigest: digest('a'),
        inputEnvelopeDigest: digest('b'),
        countingBasis: {
          binding,
          model: 'teaching/model',
          provider: 'first',
          tokenizerRevision: 'fixture-v1',
          meterRevision: 'fixture-v1',
          projectionRevision: 'fixture-v1',
          replayRevision: 'fixture-v1',
          transformRevision: 'fixture-v1',
        },
      },
      observedInput: {
        kind: 'upstream_total',
        tokens: 11,
        provenance: { adapterRevision: 'fixture-v1', fieldPaths: ['usage.prompt_tokens'] },
      },
      outputGroup: {
        kind: 'known',
        projectionRevision: 'fixture-v1',
        source,
        blockDigests: [digest('c')],
        completeness: source === 'reply' ? 'complete' : 'partial',
        usageRef: 'usage',
      },
    },
  }
  const value: unknown = candidate
  if (!isModelResponse(value)) throw new Error('known MR9 fixture rejected')
  return value
}

async function prefixOf(
  log: SettlementLogBinding,
  owner: ControlledSettlementOwner,
): Promise<SettlementPrefix> {
  const acquired = owner.acquire(2)
  if (!('registration' in acquired)) throw new Error('read owner')
  const registration = acquired.registration
  const tasks: Promise<void>[] = []
  const read = await readSettlementPrefix({
    binding: log,
    registration: {
      start(kind, work) {
        const task = registration.start(kind, work)
        tasks.push(task.stopped)
        return task
      },
      release: registration.release,
    },
  })
  await Promise.all(tasks)
  registration.release()
  if (!('prefix' in read)) throw new Error(`prefix: ${read.reason}`)
  return read.prefix
}

describe('U16 authorized noRun calibration over real SL3', () => {
  it('keeps an actually selected G when original input evidence is unavailable', async () => {
    await controlled('history-without-input', async ({ binding: log, owner }) => {
      const original = knownResponse('reply')
      const body: ModelResponse = {
        ...original,
        inputCalibration: {
          requestInput: { kind: 'unavailable', reason: 'not_retained' },
          observedInput: { kind: 'unavailable', reason: 'missing_usage' },
          outputGroup: original.inputCalibration.outputGroup,
        },
      }
      if (!isModelResponse(body)) throw new Error('partial calibration fixture')
      const written = await log.log.append(
        session,
        batch(bodyValue(body)),
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
      if ('failure' in written) throw new Error(`append original batch: ${written.failure}`)
      const prefix = await prefixOf(log, owner)
      const selected = judgeMessage(reply)
      if (!('ok' in selected)) throw new Error('reply')
      const group = {
        origin: 'selected_reply' as const,
        dispatchedEntry: entryAt(prefix, 0),
        messageEntry: entryAt(prefix, 2),
        responseEntry: entryAt(prefix, 3),
        messageIndex: 0,
        response: body,
        replaySelection: [{ sourceBlockIndex: 0, messageIndex: 0, blockIndex: 0 }],
      }
      const result = authorizedCalibration(
        prefix,
        [selected.ok],
        { callId: 'next-call', dispatch: 1 },
        () => ({
          selectedSources: [{ messageIndex: 0, entry: entryAt(prefix, 2) }],
          candidates: [group],
        }),
      )
      expect(result).toMatchObject({
        calibration: { kind: 'none', reason: 'no_observation' },
        outputHistory: [{ inputCalibration: { requestInput: { kind: 'unavailable' } } }],
      })
      if (!('outputHistory' in result)) throw new Error('history missing')
      expect(result.outputHistory).toHaveLength(1)
      expect(result.outputHistory[0]?.origin).toEqual({
        adaptation: body.route.adaptation,
        provider: body.route.provider,
        parameters: body.route.parameters,
      })
      const duplicated = copyPlanOutputHistory(
        [result.outputHistory[0], result.outputHistory[0]],
        [selected.ok],
        result.calibration,
      )
      expect(duplicated).toBeUndefined()
    })
  })
  it('accepts an actual selected assistant M/R ancestor and rejects changed locator or replay target', async () => {
    await controlled('calibration-selected', async ({ binding: log, owner }) => {
      const body = knownResponse('reply')
      const written = await log.log.append(
        session,
        batch(bodyValue(body)),
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
      if ('failure' in written) throw new Error(`append original batch: ${written.failure}`)
      const prefix = await prefixOf(log, owner)
      const originalMessage = judgeMessage(reply)
      if (!('ok' in originalMessage)) throw new Error('message')
      const selected = [originalMessage.ok]
      const original = {
        origin: 'selected_reply' as const,
        dispatchedEntry: entryAt(prefix, 0),
        messageEntry: entryAt(prefix, 2),
        responseEntry: entryAt(prefix, 3),
        messageIndex: 0,
        response: body,
        replaySelection: [{ sourceBlockIndex: 0, messageIndex: 0, blockIndex: 0 }],
      }
      const read: CurrentHistoryReaders['calibration'] = () => ({
        selectedSources: [{ messageIndex: 0, entry: entryAt(prefix, 2) }],
        candidates: [original],
      })
      const target = { callId: 'next-call', dispatch: 1 }
      expect(authorizedCalibration(prefix, selected, target, read)).toMatchObject({
        calibration: { kind: 'observation', usage: { input_tokens: 11 } },
      })
      expect(
        authorizedCalibration(prefix, selected, target, () => ({
          selectedSources: [{ messageIndex: 0, entry: entryAt(prefix, 2) }],
          candidates: [{ ...original, responseEntry: entryAt(prefix, 0) }],
        })),
      ).toEqual({ unavailable: true })
      expect(
        authorizedCalibration(prefix, selected, target, () => ({
          selectedSources: [{ messageIndex: 0, entry: entryAt(prefix, 2) }],
          candidates: [
            {
              ...original,
              replaySelection: [{ sourceBlockIndex: 0, messageIndex: 0, blockIndex: 99 }],
            },
          ],
        })),
      ).toEqual({ unavailable: true })
    })
  })

  it('accepts original no-reply I for the same call prior dispatch only', async () => {
    await controlled('calibration-retry', async ({ binding: log, owner }) => {
      const body = knownResponse('delivered')
      const written = await log.log.append(
        session,
        batch(bodyValue(body)),
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
      if ('failure' in written) throw new Error(`append original R: ${written.failure}`)
      const prefix = await prefixOf(log, owner)
      const original = {
        origin: 'same_call_retry' as const,
        dispatchedEntry: entryAt(prefix, 0),
        responseEntry: entryAt(prefix, 2),
        response: body,
        replaySelection: [],
      }
      const read: CurrentHistoryReaders['calibration'] = () => ({
        selectedSources: [],
        candidates: [original],
      })
      expect(
        authorizedCalibration(prefix, [], { callId: 'call', dispatch: 2 }, read),
      ).toMatchObject({
        calibration: { kind: 'observation', outputBlocks: [{ kind: 'text' }] },
      })
      expect(authorizedCalibration(prefix, [], { callId: 'other', dispatch: 2 }, read)).toEqual({
        unavailable: true,
      })
      expect(authorizedCalibration(prefix, [], { callId: 'call', dispatch: 1 }, read)).toEqual({
        unavailable: true,
      })
      expect(authorizedCalibration(prefix, [], { callId: 'call', dispatch: 3 }, read)).toEqual({
        unavailable: true,
      })
    })
  })
})

describe('U16/V17 conditional withRun calibration over real SL3', () => {
  it('uses a selected old-attempt complete batch from one owned prefix without rejudging current Run', async () => {
    await controlled('calibration-with-run', async ({ binding: original, owner }) => {
      const parsed = parseOpaqueIdentifier('calibration-run-session', 'SessionRef')
      if (!('ok' in parsed)) throw new Error('Run session identity')
      const runSession = parsed.ok
      const run = 'calibration-source-run'
      const shell = (attempt: number) => ({ tenant: original.tenant, run, attempt })
      const make = (
        category: 'message' | 'record' | 'response',
        value: unknown,
        attempt: number,
        purpose: Parameters<typeof prepareModelLogEntry>[0]['purpose'],
      ) => {
        const captured = captureModelLogValue({ category, input: { kind: 'value', value } })
        if (!('ok' in captured)) throw new Error(`Run value: ${captured.reason}`)
        const entry = prepareModelLogEntry({
          session: runSession,
          shell: shell(attempt),
          captured: captured.ok,
          purpose,
          messagePrefix: [],
        })
        if (!('ok' in entry)) throw new Error(`Run entry: ${entry.reason}`)
        return entry.ok
      }
      const start = (attempt: number) =>
        make(
          'message',
          {
            id: `calibration-attempt-${attempt}`,
            type: 'system_reminder',
            nature: 'event',
            source: {
              kind: 'attempt_started',
              attempt,
              reason: attempt === 1 ? 'first' : 'resumed_after_interruption',
              at: '2026-09-29T00:00:00Z',
            },
            blocks: [],
            createdAt: '2026-09-29T00:00:00Z',
          },
          attempt,
          { kind: 'message' },
        )
      const first = await original.log.append(
        runSession,
        [
          start(1),
          make('record', dispatched, 1, { kind: 'record' }),
          make('record', opened, 1, { kind: 'record' }),
        ],
        { kind: 'fenced', run, attempt: 1 },
        { kind: 'unconditional' },
      )
      if ('failure' in first) throw new Error('Run original anchors')
      const second = await original.log.append(
        runSession,
        [start(2)],
        { kind: 'fenced', run, attempt: 2 },
        { kind: 'unconditional' },
      )
      if ('failure' in second) throw new Error('Run newer attempt')
      const candidate = {
        ...knownResponse('reply'),
        call: { callId: 'call', runId: run },
        attemptId: 1,
        late: true,
      }
      if (!isModelResponse(candidate)) throw new Error('Run MR9 response')
      const captured = captureModelLogValue({
        category: 'response',
        input: { kind: 'value', value: candidate },
      })
      if (!('ok' in captured)) throw new Error('Run response capture')
      const message = prepareModelLogEntry({
        session: runSession,
        shell: shell(2),
        captured: (() => {
          const value = captureModelLogValue({
            category: 'message',
            input: { kind: 'value', value: reply },
          })
          if (!('ok' in value)) throw new Error('Run reply capture')
          return value.ok
        })(),
        purpose: { kind: 'persistedMessage', response: captured.ok },
        messagePrefix: [],
      })
      if (!('ok' in message)) throw new Error('Run reply entry')
      const responseEntry = make('response', candidate, 2, { kind: 'response' })
      const settled = await original.log.append(
        runSession,
        [message.ok, responseEntry],
        { kind: 'unfenced' },
        { kind: 'tailEquals', tail: 4 },
      )
      if ('failure' in settled) throw new Error('Run MR9 batch')
      const prefix = await prefixOf({ ...original, session: runSession }, owner)
      const selectedMessage = judgeMessage(reply)
      if (!('ok' in selectedMessage)) throw new Error('selected reply')
      const selected = [selectedMessage.ok]
      const ancestor = {
        origin: 'selected_reply' as const,
        dispatchedEntry: entryAt(prefix, 1),
        messageEntry: entryAt(prefix, 4),
        responseEntry: entryAt(prefix, 5),
        messageIndex: 0,
        response: candidate,
        replaySelection: [{ sourceBlockIndex: 0, messageIndex: 0, blockIndex: 0 }],
      }
      const target = { callId: 'next-call', dispatch: 1, run: 'selected-target-run', attempt: 3 }
      const source: CurrentHistoryReaders['calibration'] = (_prefix, _messages, requested) => {
        expect(requested).toEqual(target)
        return {
          selectedSources: [{ messageIndex: 0, entry: ancestor.messageEntry }],
          candidates: [ancestor],
        }
      }
      expect(authorizedCalibration(prefix, selected, target, source)).toMatchObject({
        calibration: { kind: 'observation', usage: { input_tokens: 11 } },
      })
      expect(
        authorizedCalibration(prefix, selected, target, () => ({ sourceUnavailable: true })),
      ).toEqual({ calibration: { kind: 'none', reason: 'source_unavailable' }, outputHistory: [] })
      for (const changed of [
        { ...ancestor, response: { ...candidate, call: { callId: 'call', runId: 'wrong-run' } } },
        { ...ancestor, response: { ...candidate, attemptId: 2 } },
        { ...ancestor, dispatchedEntry: { ...ancestor.dispatchedEntry, run: 'other-branch' } },
        { ...ancestor, messageEntry: { ...ancestor.messageEntry, attempt: 1 } },
      ])
        expect(
          authorizedCalibration(prefix, selected, target, () => ({
            selectedSources: [{ messageIndex: 0, entry: ancestor.messageEntry }],
            candidates: [changed],
          })),
        ).toEqual({ unavailable: true })
      expect(
        authorizedCalibration(prefix, selected, target, () => ({
          selectedSources: [{ messageIndex: 0, entry: null }],
          candidates: [ancestor],
        })),
      ).toEqual({ unavailable: true })
    })
  })
  it('uses a same-call no-reply Run observation only for its actual next dispatch', async () => {
    await controlled('calibration-with-run-retry', async ({ binding: original, owner }) => {
      const parsed = parseOpaqueIdentifier('calibration-run-retry-session', 'SessionRef')
      if (!('ok' in parsed)) throw new Error('Run retry session')
      const runSession = parsed.ok
      const run = 'calibration-retry-run'
      const make = (
        category: 'message' | 'record' | 'response',
        value: unknown,
        attempt: number,
      ) => {
        const captured = captureModelLogValue({ category, input: { kind: 'value', value } })
        if (!('ok' in captured)) throw new Error(`Run retry capture: ${captured.reason}`)
        const entry = prepareModelLogEntry({
          session: runSession,
          shell: { tenant: original.tenant, run, attempt },
          captured: captured.ok,
          purpose: { kind: category },
          messagePrefix: [],
        })
        if (!('ok' in entry)) throw new Error(`Run retry entry: ${entry.reason}`)
        return entry.ok
      }
      const start = (attempt: number) =>
        make(
          'message',
          {
            id: `retry-attempt-${attempt}`,
            type: 'system_reminder',
            nature: 'event',
            source: {
              kind: 'attempt_started',
              attempt,
              reason: attempt === 1 ? 'first' : 'resumed_after_interruption',
              at: '2026-09-29T00:00:00Z',
            },
            blocks: [],
            createdAt: '2026-09-29T00:00:00Z',
          },
          attempt,
        )
      const initial = await original.log.append(
        runSession,
        [start(1), make('record', dispatched, 1), make('record', opened, 1)],
        { kind: 'fenced', run, attempt: 1 },
        { kind: 'unconditional' },
      )
      if ('failure' in initial) throw new Error('Run retry anchors')
      const candidate = {
        ...knownResponse('delivered'),
        call: { callId: 'call', runId: run },
        attemptId: 1,
      }
      if (!isModelResponse(candidate)) throw new Error('Run retry MR9 response')
      const settled = await original.log.append(
        runSession,
        [make('response', candidate, 1)],
        { kind: 'unfenced' },
        { kind: 'tailEquals', tail: 3 },
      )
      if ('failure' in settled) throw new Error('Run retry original response')
      const next = await original.log.append(
        runSession,
        [start(2)],
        { kind: 'fenced', run, attempt: 2 },
        { kind: 'unconditional' },
      )
      if ('failure' in next) throw new Error('Run retry new attempt')
      const prefix = await prefixOf({ ...original, session: runSession }, owner)
      const ancestor = {
        origin: 'same_call_retry' as const,
        dispatchedEntry: entryAt(prefix, 1),
        responseEntry: entryAt(prefix, 3),
        response: candidate,
        replaySelection: [],
      }
      const source: CurrentHistoryReaders['calibration'] = () => ({
        selectedSources: [],
        candidates: [ancestor],
      })
      const target = { callId: 'call', dispatch: 2, run, attempt: 2 }
      expect(authorizedCalibration(prefix, [], target, source)).toMatchObject({
        calibration: { kind: 'observation', usage: { input_tokens: 11 } },
      })
      for (const invalid of [
        { callId: 'call', dispatch: 2, run: 'another-run', attempt: 2 },
        { callId: 'call', dispatch: 3, run, attempt: 2 },
        { callId: 'other-call', dispatch: 2, run, attempt: 2 },
        { callId: 'call', dispatch: 2 },
      ])
        expect(authorizedCalibration(prefix, [], invalid, source)).toEqual({ unavailable: true })
    })
  })
})
