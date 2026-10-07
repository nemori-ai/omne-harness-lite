import { createSettlementCoordinator } from '../src/settlement-coordinator.ts'
import { ControlledSettlementOwner, policy, noWaitScheduler } from './settlement-fixture.ts'
import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { copyJsonValue, type JsonObject } from '@omne-harness-lite/content-blocks'
import { judgeMessage } from '@omne-harness-lite/messages'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import { type LogEntry } from '@omne-harness-lite/session-log'
import { parseTenantId } from '@omne-harness-lite/identity-values'
import { readSettlementPrefix, type SettlementPrefix } from '../src/settlement-prefix.ts'
import { authorizedCalibration } from '../src/service-calibration.ts'
import type { CurrentHistoryReaders } from '../src/service-types.ts'
import {
  anchors,
  batch,
  binding,
  jsonObject,
  reply,
  response,
  session,
  tenant,
} from './log-codec-fixture.ts'
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

async function realPrefix(
  work: (prefix: SettlementPrefix, invalidate: () => void) => void | Promise<void>,
) {
  const root = resolve(import.meta.dirname, '../../../../tmp/calibration-acceptance')
  await mkdir(root, { recursive: true, mode: 0o700 })
  const dir = await mkdtemp(join(root, 'source-guards-'))
  const sql = new DatabaseSync(join(dir, 'owners.sqlite'))
  sql.exec('CREATE TABLE owner(session TEXT PRIMARY KEY, organization TEXT, account TEXT)')
  sql.prepare('INSERT INTO owner VALUES(?,?,?)').run(session, tenant.organization, tenant.account)
  const row = sql.prepare('SELECT organization,account FROM owner WHERE session=?').get(session)
  const owned = parseTenantId(row)
  if (!('ok' in owned)) throw Error('SQL owner absent')
  const log = await openSqlLogFixture({ dir: join(dir, 'log') })
  try {
    const a = anchors().entries.map(({ session: _s, position: _p, ...entry }) => entry)
    expect(
      await log.append(session, a, { kind: 'unfenced' }, { kind: 'unconditional' }),
    ).not.toHaveProperty('failure')
    expect(
      await log.append(
        session,
        batch(bodyValue(knownResponse('reply'))),
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      ),
    ).not.toHaveProperty('failure')
    let generation = {}
    const stopped: Promise<void>[] = []
    const read = await readSettlementPrefix({
      binding: {
        session,
        tenant: owned.ok,
        generation,
        currentGeneration: () => generation,
        log,
        readPrefix(this: import('../src/settlement-types.ts').SettlementLogBinding) {
          return log.fixturePrefix({ session: this.session, tenant: this.tenant }, this.log)
        },
        originalIssue: log.fixtureOriginalIssue,
      },
      registration: {
        start(_kind, action) {
          const controller = new AbortController()
          const completion = action(controller.signal)
          const stop = completion.then(() => {})
          stopped.push(stop)
          return {
            completion,
            stopped: stop,
            requestStop() {
              controller.abort()
            },
          }
        },
        release() {},
      },
    })
    await Promise.all(stopped)
    if (!('prefix' in read)) throw Error(read.reason)
    await work(read.prefix, () => {
      generation = {}
    })
  } finally {
    await log.close()
    sql.close()
  }
}
describe('independent source guards against actual owned SQL/SL3 prefix', () => {
  it('validates actual locators and rejects cross-session, same-position substitutions, branch mismatch and candidate reordering', async () => {
    await realPrefix((prefix, invalidate) => {
      const parsed = judgeMessage(reply)
      if (!('ok' in parsed)) throw Error('reply rejected')
      const messages = [parsed.ok],
        body = knownResponse('reply')
      const original = {
        origin: 'selected_reply' as const,
        dispatchedEntry: entryAt(prefix, 0),
        messageEntry: entryAt(prefix, 2),
        responseEntry: entryAt(prefix, 3),
        messageIndex: 0,
        response: body,
        replaySelection: [{ sourceBlockIndex: 0, messageIndex: 0, blockIndex: 0 }],
      }
      const read = {
        selectedSources: [{ messageIndex: 0, entry: entryAt(prefix, 2) }],
        candidates: [original],
      }
      const target = { callId: 'next', dispatch: 1 }
      expect(authorizedCalibration(prefix, messages, target, () => read)).toHaveProperty(
        'calibration.kind',
        'observation',
      )
      const checks: { label: string; value: ReturnType<CurrentHistoryReaders['calibration']> }[] = [
        {
          label: 'same position, foreign session locator',
          value: {
            ...read,
            candidates: [
              {
                ...original,
                responseEntry: {
                  ...original.responseEntry,
                  session: 'foreign-session' as typeof session,
                },
              },
            ],
          },
        },
        {
          label: 'same position, changed original payload',
          value: {
            ...read,
            candidates: [
              {
                ...original,
                responseEntry: { ...original.responseEntry, payload: { substituted: true } },
              },
            ],
          },
        },
        {
          label: 'different selected branch entry',
          value: {
            ...read,
            selectedSources: [{ messageIndex: 0, entry: original.dispatchedEntry }],
          },
        },
        {
          label: 'claimed response from another dispatch',
          value: { ...read, candidates: [{ ...original, response: { ...body, dispatch: 2 } }] },
        },
        {
          label: 'duplicated candidate is not a causal sequence',
          value: { ...read, candidates: [original, original] },
        },
        { label: 'missing actual selected source', value: { ...read, selectedSources: [] } },
        {
          label: 'unmapped reply target',
          value: {
            ...read,
            candidates: [
              {
                ...original,
                replaySelection: [{ sourceBlockIndex: 0, messageIndex: 0, blockIndex: 99 }],
              },
            ],
          },
        },
        {
          label: 'duplicate target',
          value: {
            ...read,
            candidates: [
              {
                ...original,
                replaySelection: [...original.replaySelection, ...original.replaySelection],
              },
            ],
          },
        },
      ]
      for (const check of checks)
        expect(
          authorizedCalibration(prefix, messages, target, () => check.value),
          check.label,
        ).toEqual({ unavailable: true })
      expect(
        authorizedCalibration(prefix, messages, target, () => {
          throw Error('required source read failed')
        }),
      ).toEqual({ unavailable: true })
      expect(
        authorizedCalibration(prefix, messages, target, () => ({ sourceUnavailable: true })),
      ).toEqual({ calibration: { kind: 'none', reason: 'source_unavailable' }, outputHistory: [] })
      expect(
        authorizedCalibration(prefix, messages, target, () => ({ noObservation: true })),
      ).toEqual({ unavailable: true })
      invalidate()
      expect(authorizedCalibration(prefix, messages, target, () => read)).toEqual({
        unavailable: true,
      })
    })
  })
  it('same stable key with a different legal calibration value recognizes the original whole batch without rewriting it', async () => {
    await realPrefix(async prefix => {
      const original = knownResponse('reply')
      const alternate = {
        ...original,
        inputCalibration: {
          ...original.inputCalibration,
          observedInput: {
            kind: 'upstream_total' as const,
            tokens: 12,
            provenance: {
              adapterRevision: 'fixture-v1',
              fieldPaths: ['usage.prompt_tokens'] as const,
            },
          },
        },
      }
      expect(judgeModelResponse(alternate)).toHaveProperty('ok')
      const owner = new ControlledSettlementOwner()
      const coordinator = createSettlementCoordinator({
        binding: prefix.binding,
        owner,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      try {
        const before = await prefix.binding.log.readSince(session, 0)
        const receipt = coordinator.settle({
          target: { call: 'call', dispatch: 1, response: 'response' },
          current: { messageId: 'winner-message', disposition: 'persisted' },
          response: bodyValue(alternate),
        })
        const result = await receipt.completion
        await receipt.stopped
        expect(result).toMatchObject({ origin: 'recognized' })
        if (!('settled' in result)) throw Error('original batch not recognized')
        expect(result.settled.response.value).toEqual(bodyValue(original))
        expect(await prefix.binding.log.readSince(session, 0)).toEqual(before)
        expect(owner.active).toBe(0)
      } finally {
        await coordinator.close()
      }
    })
  })
})
