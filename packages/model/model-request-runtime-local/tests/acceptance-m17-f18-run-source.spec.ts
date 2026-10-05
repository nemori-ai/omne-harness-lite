import { describe, expect, it } from 'vitest'
import { LosslessNumber, type JsonObject } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import type { SessionRef } from '@omne-harness-lite/messages'
import type { OwnedLogEntry } from '@omne-harness-lite/session-log'
import { interpretCallHistory } from '../src/call-history.ts'
import { createModelFailureSource } from '../src/failure-subject.ts'
import {
  captureModelLogValue,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import { createSettlementCoordinator } from '../src/settlement-coordinator.ts'
import {
  interpretRunAtPrefix,
  readSettlementPrefix,
  type SettlementPrefix,
} from '../src/settlement-prefix.ts'
import type { RunHistoryReader, SettlementLogBinding } from '../src/settlement-types.ts'
import { dispatched, jsonObject, opened } from './log-codec-fixture.ts'
import { responseV5 } from './log-codec-v2-fixture.ts'
import {
  controlled,
  noWaitScheduler,
  policy,
  request,
  type ControlledSettlementOwner,
} from './settlement-fixture.ts'

// Evidence for v17 M17-V1/V2/V3 and v18 F18-V1/V3/V5 over the real JSONL provider.
// Terminal recognition is a controlled test reader; it is not the production G28 owner.

const AT = '2026-09-29T00:00:00Z'

function sessionRef(value: string): SessionRef {
  const parsed = parseOpaqueIdentifier(value, 'SessionRef')
  if (!('ok' in parsed)) throw new Error('session identity')
  return parsed.ok
}

function entry(
  session: SessionRef,
  binding: SettlementLogBinding,
  category: 'message' | 'record' | 'response',
  value: unknown,
  shell: { readonly run?: string; readonly attempt?: number },
): OwnedLogEntry {
  const captured = captureModelLogValue({ category, input: { kind: 'value', value } })
  if (!('ok' in captured)) throw new Error(`capture ${category}: ${captured.reason}`)
  const prepared = prepareModelLogEntry({
    session,
    shell:
      shell.run === undefined
        ? { tenant: binding.tenant }
        : { tenant: binding.tenant, run: shell.run, attempt: shell.attempt ?? 1 },
    captured: captured.ok,
    purpose: { kind: category },
    messagePrefix: [],
  })
  if (!('ok' in prepared)) throw new Error(`prepare ${category}: ${prepared.reason}`)
  return prepared.ok
}

function attemptStarted(id: string, attempt: number) {
  return {
    id,
    type: 'system_reminder',
    nature: 'event',
    source: {
      kind: 'attempt_started',
      attempt,
      reason: attempt === 1 ? 'first' : 'resumed_after_interruption',
      at: AT,
    },
    blocks: [],
    createdAt: AT,
  }
}

async function appendOk(
  binding: SettlementLogBinding,
  session: SessionRef,
  entries: readonly OwnedLogEntry[],
  fence: { readonly run: string; readonly attempt: number } | null,
  tail?: number,
) {
  const appended = await binding.log.append(
    session,
    entries,
    fence === null ? { kind: 'unfenced' } : { kind: 'fenced', ...fence },
    tail === undefined ? { kind: 'unconditional' } : { kind: 'tailEquals', tail },
  )
  if ('failure' in appended) throw new Error(`append failed: ${JSON.stringify(appended)}`)
}

async function ownedPrefix(
  binding: SettlementLogBinding,
  owner: ControlledSettlementOwner,
): Promise<SettlementPrefix> {
  const acquired = owner.acquire(2)
  if (!('registration' in acquired)) throw new Error('read registration')
  const read = await readSettlementPrefix({ binding, registration: acquired.registration })
  acquired.registration.release()
  if (!('prefix' in read)) throw new Error(`owned prefix: ${read.reason}`)
  return read.prefix
}

/** Attempt 1 starts, the original D/O anchors are fenced under Run/attempt 1. */
async function runAnchors(
  binding: SettlementLogBinding,
  session: SessionRef,
  run: string,
  latest: number,
) {
  await appendOk(
    binding,
    session,
    [entry(session, binding, 'message', attemptStarted(`${run}-start-1`, 1), { run, attempt: 1 })],
    { run, attempt: 1 },
  )
  await appendOk(
    binding,
    session,
    [
      entry(session, binding, 'record', dispatched, { run, attempt: 1 }),
      entry(session, binding, 'record', opened, { run, attempt: 1 }),
    ],
    { run, attempt: 1 },
  )
  for (let attempt = 2; attempt <= latest; attempt++)
    await appendOk(
      binding,
      session,
      [
        entry(session, binding, 'message', attemptStarted(`${run}-start-${attempt}`, attempt), {
          run,
          attempt,
        }),
      ],
      { run, attempt },
    )
}

function runResponse(run: string, attempt = 1): JsonObject {
  return { ...responseV5, call: { callId: 'call', runId: run }, attemptId: attempt }
}

function countingReader(latestAttempt: number, terminal: 'open' | 'ended' = 'open') {
  const calls: { run: string; attempt: unknown }[] = []
  const reader: RunHistoryReader = (_prefix, run, originalAttempt) => {
    calls.push({ run, attempt: originalAttempt })
    return { known: { run, originalAttempt, latestAttempt, terminal } }
  }
  return { reader, calls }
}

describe('M17-V1 Run interpretation is bound to one authorized owned prefix', () => {
  it('reads a foreign-tenant log as no owned prefix and never consults the Run source', async () => {
    await controlled('m17-v1-tenant', async ({ binding, owner }) => {
      const session = sessionRef('m17-v1-tenant-session')
      const own = { ...binding, session }
      await runAnchors(own, session, 'tenant-run', 1)
      const foreign = parseTenantId({ organization: 'other-org', account: 'other-account' })
      if (!('ok' in foreign)) throw new Error('foreign tenant')
      const acquired = owner.acquire(2)
      if (!('registration' in acquired)) throw new Error('registration')
      const read = await readSettlementPrefix({
        binding: { ...own, tenant: foreign.ok },
        registration: acquired.registration,
      })
      acquired.registration.release()
      expect(read).toEqual({ unavailable: true, reason: 'prefix' })
      const { reader, calls } = countingReader(1)
      const coordinator = createSettlementCoordinator({
        binding: { ...own, tenant: foreign.ok },
        owner,
        run: reader,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const handle = coordinator.settle({ ...request, response: runResponse('tenant-run') })
      expect(await handle.completion).toHaveProperty('unavailable', true)
      await handle.stopped
      await coordinator.close()
      expect(calls).toHaveLength(0)
      // Positive control on the same file: the owning tenant can interpret the same Run.
      const prefix = await ownedPrefix(own, owner)
      expect(
        interpretRunAtPrefix({ prefix, run: 'tenant-run', attempt: 1, source: reader }),
      ).toMatchObject({ known: { originalAttempt: 1, latestAttempt: 1, late: false } })
      expect(calls).toHaveLength(1)
    })
  })

  it('rejects a replaced log generation before or during the Run source, and an unknown Run', async () => {
    await controlled('m17-v1-generation', async ({ binding, owner }) => {
      const session = sessionRef('m17-v1-generation-session')
      let generation: object = binding.generation
      const own: SettlementLogBinding = {
        ...binding,
        session,
        currentGeneration: () => generation,
      }
      await runAnchors(own, session, 'generation-run', 2)
      const prefix = await ownedPrefix(own, owner)
      const { reader, calls } = countingReader(2)
      expect(
        interpretRunAtPrefix({ prefix, run: 'generation-run', attempt: 1, source: reader }),
      ).toMatchObject({ known: { originalAttempt: 1, latestAttempt: 2, late: true } })
      expect(calls).toHaveLength(1)
      // A Run with no MS6 attempt fact in this prefix is not interpreted at all.
      expect(
        interpretRunAtPrefix({ prefix, run: 'another-run', attempt: 1, source: reader }),
      ).toEqual({ unavailable: true })
      expect(calls).toHaveLength(1)
      // The generation changes while the source is answering.
      expect(
        interpretRunAtPrefix({
          prefix,
          run: 'generation-run',
          attempt: 1,
          source: (_prefix, run, originalAttempt) => {
            generation = Object.freeze({})
            return { known: { run, originalAttempt, latestAttempt: 2, terminal: 'open' } }
          },
        }),
      ).toEqual({ unavailable: true })
      // Already replaced before the call: the source is not consulted.
      expect(
        interpretRunAtPrefix({ prefix, run: 'generation-run', attempt: 1, source: reader }),
      ).toEqual({ unavailable: true })
      expect(calls).toHaveLength(1)
    })
  })
})

describe('M17-V2 the Run source is consulted only for new withRun settlement of a valid request', () => {
  it('noRun settlement never calls the Run reader and malformed withRun input fails first', async () => {
    await controlled('m17-v2-no-run', async ({ binding, owner, submissions }) => {
      const { reader, calls } = countingReader(1)
      const coordinator = createSettlementCoordinator({
        binding,
        owner,
        run: reader,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const settled = coordinator.settle(request)
      expect(await settled.completion).toHaveProperty('settled')
      await settled.stopped
      expect(calls).toHaveLength(0)
      expect(submissions.at(-1)?.condition).toEqual({ kind: 'unconditional' })
      const before = submissions.length
      const malformed = coordinator.settle({
        ...request,
        response: { ...runResponse('malformed-run'), call: { callId: 'other', runId: 'x' } },
      })
      expect(await malformed.completion).not.toHaveProperty('settled')
      await malformed.stopped
      expect(calls).toHaveLength(0)
      expect(submissions).toHaveLength(before)
      await coordinator.close()
    })
  })

  it('does not treat a model_call_ended record as Run terminal evidence without the formal reader', async () => {
    await controlled('m17-v2-no-terminal-inference', async ({ binding, owner, submissions }) => {
      const session = sessionRef('m17-v2-terminal-session')
      const own = { ...binding, session }
      await runAnchors(own, session, 'terminal-run', 1)
      await appendOk(
        own,
        session,
        [
          entry(
            session,
            own,
            'record',
            {
              kind: 'model_call_ended',
              call: 'unrelated-call',
              ending: 'undispatched',
              cause: 'credential_unavailable',
            },
            { run: 'terminal-run', attempt: 1 },
          ),
        ],
        { run: 'terminal-run', attempt: 1 },
      )
      const before = submissions.length
      const noReader = createSettlementCoordinator({
        binding: own,
        owner,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const refused = noReader.settle({ ...request, response: runResponse('terminal-run') })
      expect(await refused.completion).toMatchObject({ reason: 'run_history_unavailable' })
      await refused.stopped
      await noReader.close()
      expect(submissions).toHaveLength(before)
      // A tail offered by the source is ignored; the condition comes from the owned prefix.
      const prefix = await ownedPrefix(own, owner)
      const tailOffering = createSettlementCoordinator({
        binding: own,
        owner,
        run: (_prefix, run, originalAttempt) =>
          JSON.parse(
            JSON.stringify({
              known: { run, originalAttempt, latestAttempt: 1, terminal: 'open', tail: 1 },
            }),
          ),
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const accepted = tailOffering.settle({ ...request, response: runResponse('terminal-run') })
      const result = await accepted.completion
      await accepted.stopped
      await tailOffering.close()
      expect(result).toHaveProperty('origin', 'appended')
      expect(submissions.at(-1)?.condition).toEqual({ kind: 'tailEquals', tail: prefix.tail })
      if (!('settled' in result)) throw new Error('settled')
      expect(result.settled.response.response?.late).toBeUndefined()
    })
  })
})

describe('M17-V3 interleaving B: a committed response keeps its original late value', () => {
  it('recognizes the earlier committed batch after a newer attempt without rewriting late', async () => {
    await controlled('m17-v3-interleaving-b', async ({ binding, owner, submissions }) => {
      const session = sessionRef('m17-v3-b-session')
      const own = { ...binding, session }
      const run = 'interleaving-run'
      await runAnchors(own, session, run, 1)
      const first = countingReader(1)
      const coordinator = createSettlementCoordinator({
        binding: own,
        owner,
        run: first.reader,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const settled = coordinator.settle({ ...request, response: runResponse(run) })
      const result = await settled.completion
      await settled.stopped
      await coordinator.close()
      expect(result).toHaveProperty('origin', 'appended')
      if (!('settled' in result)) throw new Error('first batch')
      expect(result.settled.response.response?.late).toBeUndefined()
      expect(submissions.at(-1)?.condition).toMatchObject({ kind: 'tailEquals' })
      // A newer attempt starts after the response was committed.
      await appendOk(
        own,
        session,
        [entry(session, own, 'message', attemptStarted(`${run}-start-2`, 2), { run, attempt: 2 })],
        { run, attempt: 2 },
      )
      const committed = submissions.length
      const later = countingReader(2, 'ended')
      const recognizer = createSettlementCoordinator({
        binding: own,
        owner,
        run: later.reader,
        settlementContention: policy(),
        settlementScheduler: noWaitScheduler,
        diagnostic() {},
      })
      const again = recognizer.settle({ ...request, response: runResponse(run) })
      const recognized = await again.completion
      await again.stopped
      await recognizer.close()
      expect(recognized).toHaveProperty('origin', 'recognized')
      if (!('settled' in recognized)) throw new Error('recognized batch')
      expect(recognized.settled.response.response?.late).toBeUndefined()
      expect(submissions).toHaveLength(committed)
      const durable = await own.log.readSince(session, 0)
      if ('failure' in durable) throw new Error('durable read')
      const responses = durable.entries.filter(
        item => jsonObject(item.payload).category === 'response',
      )
      expect(responses).toHaveLength(1)
      expect(jsonObject(jsonObject(responses[0]?.payload).value).late).toBeUndefined()
    })
  })
})

/** A failed withRun call under `run`; the response is committed at attempt 1 of that Run. */
async function failedRunCall(
  binding: SettlementLogBinding,
  session: SessionRef,
  run: string,
  response: JsonObject,
) {
  await appendOk(
    binding,
    session,
    [entry(session, binding, 'message', attemptStarted(`${run}-f-start`, 1), { run, attempt: 1 })],
    { run, attempt: 1 },
  )
  await appendOk(
    binding,
    session,
    [
      entry(
        session,
        binding,
        'record',
        { ...dispatched, call: 'run-call', response: 'run-response' },
        { run, attempt: 1 },
      ),
    ],
    { run, attempt: 1 },
  )
  await appendOk(binding, session, [entry(session, binding, 'response', response, { run })], null)
}

function failedResponse(run: string, attemptId: unknown = 1): JsonObject {
  const { reply: _reply, replyDisposition: _disposition, ...rest } = responseV5
  return {
    ...rest,
    id: 'run-response',
    call: { callId: 'run-call', runId: run },
    attemptId: attemptId as number,
    outcome: 'failed',
    failure: { cause: 'upstream_unavailable', statusCode: 503 },
    timing: { sentAt: AT, endedAt: '2026-09-29T00:00:01Z' },
  }
}

function subjectFor(prefix: SettlementPrefix) {
  const history = interpretCallHistory({ prefix, callId: 'run-call' })
  if (!('known' in history)) throw new Error('call history')
  const record = history.known.dispatches[0]?.record
  if (record === undefined) throw new Error('dispatch record')
  return {
    failure: 'upstream_unavailable' as const,
    statusCode: 503,
    profile: record.profileSnapshot,
    dispatches: [record] as const,
    retryConclusions: [] as const,
  }
}

function source(prefix: SettlementPrefix, owner: ControlledSettlementOwner, usable = () => true) {
  return createModelFailureSource({
    prefix,
    callId: 'run-call',
    owner,
    subject: subjectFor(prefix),
    usable,
    retain() {},
    forget() {},
  })
}

describe('F18-V1 the source Run comes from the original dispatched shells of one owned prefix', () => {
  it('rejects a response whose Run or attempt disagrees with its dispatched shell, and forged prefixes', async () => {
    await controlled('f18-v1-shells', async ({ binding, owner }) => {
      const good = sessionRef('f18-v1-good')
      await failedRunCall(
        { ...binding, session: good },
        good,
        'shell-run',
        failedResponse('shell-run'),
      )
      const goodPrefix = await ownedPrefix({ ...binding, session: good }, owner)
      const accepted = source(goodPrefix, owner)
      if (accepted === null) throw new Error('positive source')
      expect(accepted.verify(accepted.subject, { run: 'shell-run', attempt: 1 })).toEqual({
        authoritativeSubject: accepted.subject,
      })
      accepted.release()
      for (const forged of [
        { ...goodPrefix },
        Object.assign(Object.create(Object.getPrototypeOf(goodPrefix)), goodPrefix),
      ])
        expect(
          createModelFailureSource({
            prefix: forged as SettlementPrefix,
            callId: 'run-call',
            owner,
            subject: subjectFor(goodPrefix),
            usable: () => true,
            retain() {},
            forget() {},
          }),
        ).toBeNull()
      // A second dispatch under another Run cannot join the original call history.
      for (const secondRun of ['shell-run', 'mixed-run']) {
        const session = sessionRef(`f18-v1-second-${secondRun}`)
        const own = { ...binding, session }
        await failedRunCall(own, session, 'shell-run', failedResponse('shell-run'))
        await appendOk(
          own,
          session,
          [
            entry(session, own, 'message', attemptStarted(`${secondRun}-2`, 2), {
              run: secondRun,
              attempt: 2,
            }),
          ],
          { run: secondRun, attempt: 2 },
        )
        await appendOk(
          own,
          session,
          [
            entry(
              session,
              own,
              'record',
              { ...dispatched, call: 'run-call', dispatch: 2, response: 'run-response-2' },
              { run: secondRun, attempt: 2 },
            ),
          ],
          { run: secondRun, attempt: 2 },
        )
        await appendOk(
          own,
          session,
          [
            entry(
              session,
              own,
              'response',
              {
                ...failedResponse(secondRun, 2),
                id: 'run-response-2',
                dispatch: 2,
              },
              { run: secondRun },
            ),
          ],
          null,
        )
        const prefix = await ownedPrefix(own, owner)
        const history = interpretCallHistory({ prefix, callId: 'run-call' })
        if (secondRun === 'mixed-run') {
          expect(history).toEqual({ unavailable: true, reason: 'history' })
          continue
        }
        if (!('known' in history)) throw Error(`same-Run history: ${JSON.stringify(history)}`)
        const [first, second] = history.known.dispatches
        if (first === undefined || second === undefined) throw Error('two dispatches')
        const twoDispatches = createModelFailureSource({
          prefix,
          callId: 'run-call',
          owner,
          subject: {
            failure: 'upstream_unavailable',
            statusCode: 503,
            profile: second.record.profileSnapshot,
            dispatches: [first.record, second.record],
            retryConclusions: [],
          },
          usable: () => true,
          retain() {},
          forget() {},
        })
        if (twoDispatches === null) throw Error('same-Run two-dispatch source')
        // Each original dispatch keeps its own attempt; the current execution may be later.
        expect(
          twoDispatches.verify(twoDispatches.subject, { run: 'shell-run', attempt: 3 }),
        ).toHaveProperty('authoritativeSubject')
        expect(
          twoDispatches.verify(twoDispatches.subject, { run: 'mixed-run', attempt: 2 }),
        ).toEqual({ invalidInput: true })
        twoDispatches.release()
      }
      const cases: readonly [string, JsonObject][] = [
        ['run-mismatch', failedResponse('another-run')],
        ['attempt-mismatch', failedResponse('shell-run', 2)],
      ]
      for (const [label, response] of cases) {
        const session = sessionRef(`f18-v1-${label}`)
        const own = { ...binding, session }
        await failedRunCall(own, session, 'shell-run', response)
        const prefix = await ownedPrefix(own, owner)
        const history = interpretCallHistory({ prefix, callId: 'run-call' })
        const record = 'known' in history ? history.known.dispatches[0]?.record : undefined
        const created =
          record === undefined
            ? null
            : createModelFailureSource({
                prefix,
                callId: 'run-call',
                owner,
                subject: {
                  failure: 'upstream_unavailable',
                  statusCode: 503,
                  profile: record.profileSnapshot,
                  dispatches: [record],
                  retryConclusions: [],
                },
                usable: () => true,
                retain() {},
                forget() {},
              })
        expect({ label, created }).toEqual({ label, created: null })
      }
    })
  })
})

describe('F18-V3/V5 current attempt shape, scope validity and error priority', () => {
  it('accepts a later attempt of the same Run without rewriting original facts; rejects bad shapes', async () => {
    await controlled('f18-v3-attempts', async ({ binding, owner }) => {
      const session = sessionRef('f18-v3-session')
      const own = { ...binding, session }
      await failedRunCall(own, session, 'attempt-run', failedResponse('attempt-run'))
      const prefix = await ownedPrefix(own, owner)
      const created = source(prefix, owner)
      if (created === null) throw new Error('source')
      const before = JSON.stringify(created.subject)
      for (const attempt of [1, 2, new LosslessNumber('3'), 9007199254740991])
        expect(created.verify(created.subject, { run: 'attempt-run', attempt })).toEqual({
          authoritativeSubject: created.subject,
        })
      for (const attempt of [0, -1, 1.5, new LosslessNumber('2.5'), '2', null, undefined])
        expect(created.verify(created.subject, { run: 'attempt-run', attempt } as never)).toEqual({
          invalidInput: true,
        })
      expect(created.verify(created.subject, { attempt: 2 } as never)).toEqual({
        invalidInput: true,
      })
      expect(created.verify(created.subject, null as never)).toEqual({ invalidInput: true })
      expect(JSON.stringify(created.subject)).toBe(before)
      const durable = await own.log.readSince(session, 0)
      if ('failure' in durable) throw new Error('durable read')
      const response = durable.entries.find(
        item => jsonObject(item.payload).category === 'response',
      )
      expect(jsonObject(jsonObject(response?.payload).value).attemptId).toBe(1)
      created.release()
    })
  })

  it('a revoked scope answers unavailable before any Run or subject judgment', async () => {
    await controlled('f18-v5-priority', async ({ binding, owner }) => {
      const session = sessionRef('f18-v5-session')
      const own = { ...binding, session }
      await failedRunCall(own, session, 'scope-run', failedResponse('scope-run'))
      const prefix = await ownedPrefix(own, owner)
      const created = source(prefix, owner)
      if (created === null) throw new Error('source')
      const tampered = { ...created.subject, failure: 'request_rejected' as const }
      expect(created.verify(tampered, { run: 'scope-run', attempt: 1 })).toEqual({
        invalidInput: true,
      })
      // M17-V7: any changed profile, dispatch, status or in-band fact is not the original.
      const [record] = created.subject.dispatches
      for (const changed of [
        { ...created.subject, profile: { ...created.subject.profile, maxInputTokens: 101 } },
        { ...created.subject, dispatches: [{ ...record, dispatch: 2 }] },
        { ...created.subject, dispatches: [{ ...record, provider: 'second' }] },
        { ...created.subject, statusCode: 500 },
        { ...created.subject, inBand: true },
        { ...created.subject, dispatches: [record, record] },
      ])
        expect(created.verify(changed as never, { run: 'scope-run', attempt: 1 })).toEqual({
          invalidInput: true,
        })
      // The same exact number in another lexical form is the same JSON value, not a change.
      expect(
        created.verify(
          { ...created.subject, statusCode: new LosslessNumber('503.0') },
          { run: 'scope-run', attempt: 1 },
        ),
      ).toHaveProperty('authoritativeSubject')
      expect(created.verify(created.subject, { run: 'other-run', attempt: 1 })).toEqual({
        invalidInput: true,
      })
      // An ordinary unrelated append does not invalidate the captured original.
      await appendOk(
        own,
        session,
        [
          entry(
            session,
            own,
            'record',
            {
              kind: 'model_call_ended',
              call: 'unrelated',
              ending: 'undispatched',
              cause: 'credential_unavailable',
            },
            {},
          ),
        ],
        null,
      )
      expect(created.verify(created.subject, { run: 'scope-run', attempt: 1 })).toHaveProperty(
        'authoritativeSubject',
      )
      owner.state = 'closed'
      for (const [candidate, execution] of [
        [created.subject, { run: 'scope-run', attempt: 1 }],
        [tampered, { run: 'scope-run', attempt: 1 }],
        [created.subject, { run: 'other-run', attempt: 1 }],
        [created.subject, { run: 'scope-run', attempt: 0 }],
      ] as const)
        expect(created.verify(candidate, execution)).toEqual({ unavailable: true })
      owner.state = 'open'
      expect(created.verify(created.subject, { run: 'scope-run', attempt: 1 })).toHaveProperty(
        'authoritativeSubject',
      )
      created.release()
      created.release()
      expect(created.verify(created.subject, { run: 'other-run', attempt: 1 })).toEqual({
        unavailable: true,
      })
    })
  })
})
