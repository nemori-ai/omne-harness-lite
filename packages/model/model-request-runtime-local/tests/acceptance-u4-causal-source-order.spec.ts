import { describe, expect, it } from 'vitest'
import { LosslessNumber, copyJsonValue, type JsonObject } from '@omne-harness-lite/content-blocks'
import { judgeMessage, type Message } from '@omne-harness-lite/messages'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import type { LogEntry } from '@omne-harness-lite/session-log'
import { authorizedCalibration } from '../src/service-calibration.ts'
import {
  captureModelLogValue,
  modelLogJsonEqual,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import { readSettlementPrefix, type SettlementPrefix } from '../src/settlement-prefix.ts'
import type { CurrentHistoryReaders } from '../src/service-types.ts'
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
  if (!('ok' in copied)) throw new Error('actual MR9 response cannot be captured')
  return jsonObject(copied.ok)
}

function isModelResponse(value: unknown): value is ModelResponse {
  return 'ok' in judgeModelResponse(value)
}

function knownResponse(which: 'A' | 'B'): ModelResponse {
  const branch = which === 'B'
  const value: unknown = {
    ...response,
    ...(branch
      ? {
          id: 'branch-response',
          call: { callId: 'branch-call' },
          reply: { ...reply, id: 'branch-message', response: 'branch-response' },
          usage: {
            input_tokens: 37,
            output_tokens: 5,
            cache_read_tokens: 'unknown',
            cache_write_tokens: 0,
            source: 'upstream',
          },
          cost: { cost_usd: new LosslessNumber('0.0009'), source: 'upstream_usage' },
        }
      : {}),
    inputCalibration: {
      requestInput: {
        kind: 'known',
        projectionRevision: 'u4-test-v1',
        prefixBoundary: 1,
        prefixDigest: digest(branch ? 'd' : 'a'),
        inputEnvelopeDigest: digest('b'),
        countingBasis: {
          binding,
          model: 'teaching/model',
          provider: 'first',
          tokenizerRevision: 'u4-test-v1',
          meterRevision: 'u4-test-v1',
          projectionRevision: 'u4-test-v1',
          replayRevision: 'u4-test-v1',
          transformRevision: 'u4-test-v1',
        },
      },
      observedInput: {
        kind: 'upstream_total',
        tokens: branch ? 37 : 11,
        provenance: { adapterRevision: 'u4-test-v1', fieldPaths: ['usage.prompt_tokens'] },
      },
      outputGroup: {
        kind: 'known',
        projectionRevision: 'u4-test-v1',
        source: 'reply',
        blockDigests: [digest('c')],
        completeness: 'complete',
        usageRef: 'usage',
      },
    },
  }
  if (!isModelResponse(value)) throw new Error(`MR9 ${which} rejected`)
  return value
}

async function prefixOf(log: SettlementLogBinding, owner: ControlledSettlementOwner) {
  const admitted = owner.acquire(2)
  if (!('registration' in admitted)) throw new Error('owned full read unavailable')
  const registration = admitted.registration
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
  if (!('prefix' in read)) throw new Error(`actual SL3 prefix: ${read.reason}`)
  return read.prefix
}

function entryAt(prefix: SettlementPrefix, index: number): LogEntry {
  const entry = prefix.entries[index]
  if (entry === undefined) throw new Error(`missing actual log entry ${index}`)
  return entry
}

function assistant(value: unknown): Message & { readonly type: 'assistant' } {
  const judged = judgeMessage(value)
  if (!('ok' in judged) || judged.ok.type !== 'assistant') throw new Error('actual reply invalid')
  return judged.ok
}

describe('U16-V6 same-log causal source order', () => {
  it('uses selected ancestry rather than physical last R or candidate arrival order', async () => {
    await controlled('u4-causal-order', async ({ binding: log, owner, submissions }) => {
      const A = knownResponse('A')
      const B = knownResponse('B')
      const originalA = await log.log.append(
        session,
        batch(bodyValue(A)),
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
      if ('failure' in originalA) throw new Error('first M/R not durably committed')
      const branchD = prepareModelLogEntry({
        session,
        shell: { tenant: log.tenant },
        captured: (() => {
          const captured = captureModelLogValue({
            category: 'record',
            input: {
              kind: 'value',
              value: { ...dispatched, call: 'branch-call', response: 'branch-response' },
            },
          })
          if (!('ok' in captured)) throw new Error('branch D capture')
          return captured.ok
        })(),
        purpose: { kind: 'record' },
        messagePrefix: [],
      })
      const branchO = prepareModelLogEntry({
        session,
        shell: { tenant: log.tenant },
        captured: (() => {
          const captured = captureModelLogValue({
            category: 'record',
            input: { kind: 'value', value: { ...opened, call: 'branch-call' } },
          })
          if (!('ok' in captured)) throw new Error('branch O capture')
          return captured.ok
        })(),
        purpose: { kind: 'record' },
        messagePrefix: [],
      })
      if (!('ok' in branchD) || !('ok' in branchO)) throw new Error('branch anchors invalid')
      const anchorsB = await log.log.append(
        session,
        [branchD.ok, branchO.ok],
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
      if ('failure' in anchorsB) throw new Error('branch anchors not durable')
      const originalB = await log.log.append(
        session,
        batch(bodyValue(B)),
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
      if ('failure' in originalB) throw new Error('later nonancestor M/R not durable')

      const prefix = await prefixOf(log, owner)
      expect(prefix.entries).toHaveLength(8)
      const replies = [assistant(A.reply), assistant(B.reply)] as const
      const candidate = (which: 'A' | 'B') => {
        const index = which === 'A' ? 0 : 4
        return {
          origin: 'selected_reply' as const,
          dispatchedEntry: entryAt(prefix, index),
          messageEntry: entryAt(prefix, index + 2),
          responseEntry: entryAt(prefix, index + 3),
          messageIndex: 0,
          response: which === 'A' ? A : B,
          replaySelection: [{ sourceBlockIndex: 0, messageIndex: 0, blockIndex: 0 }],
        }
      }
      const source =
        (which: 'A' | 'B'): CurrentHistoryReaders['calibration'] =>
        (givenPrefix, messages, target) => {
          // These locators come from the actual owned M/R entries selected by the caller.
          // The physical latest branch is not promoted by its log position.
          if (
            givenPrefix !== prefix ||
            target.callId !== 'next-call' ||
            messages.length !== 1 ||
            messages[0]?.type !== 'assistant' ||
            messages[0]?.response !== (which === 'A' ? A.id : B.id)
          )
            return { sourceUnavailable: true }
          const chosen = candidate(which)
          return {
            selectedSources: [{ messageIndex: 0, entry: chosen.messageEntry }],
            candidates: [chosen],
          }
        }
      const before = await log.log.readSince(session, 0)
      if ('failure' in before) throw new Error('actual source log unavailable')
      const writes = submissions.length
      const target = { callId: 'next-call', dispatch: 1 }
      for (const [which, expectedTokens] of [
        ['A', 11],
        ['B', 37],
      ] as const) {
        const selected = [replies[which === 'A' ? 0 : 1]]
        const result = authorizedCalibration(prefix, selected, target, source(which))
        expect(result).toMatchObject({
          calibration: {
            kind: 'observation',
            usage: { input_tokens: expectedTokens },
            inputCalibration: {
              requestInput: { prefixDigest: digest(which === 'A' ? 'a' : 'd') },
              observedInput: { tokens: expectedTokens },
              outputGroup: { source: 'reply', completeness: 'complete' },
            },
            outputBlocks: [replies[which === 'A' ? 0 : 1].blocks[0]],
            replaySelection: [{ sourceBlockIndex: 0, messageIndex: 0, blockIndex: 0 }],
          },
        })
      }
      const chosenA = [replies[0]]
      const actualA = candidate('A'),
        actualB = candidate('B')
      for (const ordered of [[actualA, actualB], [actualB, actualA], [actualB]]) {
        const malicious: CurrentHistoryReaders['calibration'] = () => ({
          selectedSources: [{ messageIndex: 0, entry: actualA.messageEntry }],
          candidates: ordered,
        })
        expect(authorizedCalibration(prefix, chosenA, target, malicious)).toEqual({
          unavailable: true,
        })
      }
      // Both original R bodies, including upstream cost, stay byte-for-byte in the same log.
      const after = await log.log.readSince(session, 0)
      expect(after).toEqual(before)
      expect(submissions).toHaveLength(writes)
      if ('failure' in after) throw new Error('actual SL3 readback')
      expect(modelLogJsonEqual(jsonObject(entryAt(prefix, 3).payload).value, A)).toBe(true)
      expect(modelLogJsonEqual(jsonObject(entryAt(prefix, 7).payload).value, B)).toBe(true)
      expect(modelLogJsonEqual(A.cost, B.cost)).toBe(false)
    })
  })
})
