import { describe, expect, it } from 'vitest'
import { copyJsonValue, type JsonObject } from '@omne-harness-lite/content-blocks'
import { judgeMessage } from '@omne-harness-lite/messages'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import { readSettlementPrefix, type SettlementPrefix } from '../src/settlement-prefix.ts'
import { authorizedCalibration } from '../src/service-calibration.ts'
import type { CurrentHistoryReaders } from '../src/service-types.ts'
import { batch, binding, jsonObject, reply, response, session } from './log-codec-fixture.ts'
import { controlled, type ControlledSettlementOwner } from './settlement-fixture.ts'
import type { SettlementLogBinding } from '../src/settlement-types.ts'

const digest = (character: string) => character.repeat(64)
function bodyValue(value: ModelResponse): JsonObject {
  const copied = copyJsonValue(value)
  if (!('ok' in copied)) throw new Error('JSON response fixture')
  return jsonObject(copied.ok)
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
  const judged = judgeModelResponse(candidate)
  if (!('ok' in judged)) throw new Error(`known MR9 fixture: ${JSON.stringify(judged)}`)
  return candidate as unknown as ModelResponse
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
        dispatchedEntry: prefix.entries[0]!,
        messageEntry: prefix.entries[2]!,
        responseEntry: prefix.entries[3]!,
        messageIndex: 0,
        response: body,
        replaySelection: [{ sourceBlockIndex: 0, messageIndex: 0, blockIndex: 0 }],
      }
      const read: CurrentHistoryReaders['calibration'] = () => ({
        selectedSources: [{ messageIndex: 0, entry: prefix.entries[2]! }],
        candidates: [original],
      })
      const target = { callId: 'next-call', dispatch: 1 }
      expect(authorizedCalibration(prefix, selected, target, read)).toMatchObject({
        calibration: { kind: 'observation', usage: { input_tokens: 11 } },
      })
      expect(
        authorizedCalibration(prefix, selected, target, () => ({
          selectedSources: [{ messageIndex: 0, entry: prefix.entries[2]! }],
          candidates: [{ ...original, responseEntry: prefix.entries[0]! }],
        })),
      ).toEqual({ unavailable: true })
      expect(
        authorizedCalibration(prefix, selected, target, () => ({
          selectedSources: [{ messageIndex: 0, entry: prefix.entries[2]! }],
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
        dispatchedEntry: prefix.entries[0]!,
        responseEntry: prefix.entries[2]!,
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
