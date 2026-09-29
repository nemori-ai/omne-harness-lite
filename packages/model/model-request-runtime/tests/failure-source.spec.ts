import { describe, expect, it } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import type { SessionLog } from '@omne-harness-lite/session-log-jsonl'
import { createModelFailureSource } from '../src/failure-subject.ts'
import { interpretCallHistory } from '../src/call-history.ts'
import { readSettlementPrefix } from '../src/settlement-prefix.ts'
import type { ModelFailureSource } from '../src/service-types.ts'
import { dispatched, jsonObject, prepare, session, tenant } from './log-codec-fixture.ts'
import { responseV5 } from './log-codec-v2-fixture.ts'
import { controlled } from './settlement-fixture.ts'

describe('v17 failure source lifetime', () => {
  it('binds an actual withRun failed call to its original dispatch while allowing a later attempt', async () => {
    await controlled('failure-source-run-bound', async ({ binding, owner }) => {
      const run = 'source-owned-run'
      const shell = { tenant, run, attempt: 1 }
      const start = {
        id: 'source-owned-attempt-start',
        type: 'system_reminder',
        nature: 'event',
        source: {
          kind: 'attempt_started',
          attempt: 1,
          reason: 'first',
          at: '2026-09-29T00:00:00Z',
        },
        blocks: [],
        createdAt: '2026-09-29T00:00:00Z',
      }
      const anchor = { ...dispatched, call: 'run-call', response: 'run-response' }
      const { reply: _reply, replyDisposition: _disposition, ...rest } = responseV5
      const failed = {
        ...rest,
        id: 'run-response',
        call: { callId: 'run-call', runId: run },
        attemptId: 1,
        outcome: 'failed',
        failure: { cause: 'upstream_unavailable', statusCode: 503 },
        timing: { sentAt: '2026-09-29T00:00:00Z', endedAt: '2026-09-29T00:00:01Z' },
      }
      expect(
        await binding.log.append(
          session,
          [prepare('message', start, { kind: 'message' }, shell)],
          { kind: 'fenced', run, attempt: 1 },
          { kind: 'unconditional' },
        ),
      ).toHaveProperty('positions')
      expect(
        await binding.log.append(
          session,
          [prepare('record', anchor, { kind: 'record' }, shell)],
          { kind: 'fenced', run, attempt: 1 },
          { kind: 'unconditional' },
        ),
      ).toHaveProperty('positions')
      expect(
        await binding.log.append(
          session,
          [prepare('response', failed, { kind: 'response' }, shell)],
          { kind: 'unfenced' },
          { kind: 'unconditional' },
        ),
      ).toHaveProperty('positions')
      const acquired = owner.acquire(2)
      if (!('registration' in acquired)) throw new Error('Run source read registration unavailable')
      const read = await readSettlementPrefix({ binding, registration: acquired.registration })
      acquired.registration.release()
      if (!('prefix' in read)) throw new Error('Run source prefix unavailable')
      const history = interpretCallHistory({ prefix: read.prefix, callId: 'run-call' })
      if (!('known' in history)) throw new Error('Run source call history unavailable')
      const record = history.known.dispatches[0]?.record
      if (record === undefined) throw new Error('Run source original dispatch unavailable')
      const subject = {
        failure: 'upstream_unavailable' as const,
        statusCode: 503,
        profile: record.profileSnapshot,
        dispatches: [record] as const,
        retryConclusions: [] as const,
      }
      const source = createModelFailureSource({
        prefix: read.prefix,
        callId: 'run-call',
        owner,
        subject,
        usable: () => true,
        retain() {},
        forget() {},
      })
      if (source === null) throw new Error('Run source missing')
      expect(source.verify(source.subject, { run, attempt: 1 })).toHaveProperty(
        'authoritativeSubject',
      )
      expect(source.verify(source.subject, { run, attempt: 2 })).toHaveProperty(
        'authoritativeSubject',
      )
      expect(source.verify(source.subject, { run: 'other-run', attempt: 1 })).toEqual({
        invalidInput: true,
      })
      expect(source.verify(source.subject, { run, attempt: 0 })).toEqual({ invalidInput: true })
      expect(source.verify(source.subject, { run, attempt: new LosslessNumber('1.5') })).toEqual({
        invalidInput: true,
      })
      // A deliberately untyped caller cannot omit the required execution member.
      expect(source.verify(source.subject, { run } as never)).toEqual({ invalidInput: true })
      expect(
        createModelFailureSource({
          prefix: read.prefix,
          callId: 'run-call',
          owner,
          subject: {
            ...subject,
            dispatches: [{ ...record, response: 'forged-response' }],
          },
          usable: () => true,
          retain() {},
          forget() {},
        }),
      ).toBeNull()
      const otherRun = 'other-source-run'
      const otherShell = { tenant, run: otherRun, attempt: 1 }
      const otherStart = {
        ...start,
        id: 'other-source-attempt-start',
      }
      expect(
        await binding.log.append(
          session,
          [prepare('message', otherStart, { kind: 'message' }, otherShell)],
          { kind: 'fenced', run: otherRun, attempt: 1 },
          { kind: 'unconditional' },
        ),
      ).toHaveProperty('positions')
      expect(
        await binding.log.append(
          session,
          [
            prepare(
              'record',
              { ...anchor, dispatch: 2, response: 'other-response', provider: 'second' },
              { kind: 'record' },
              otherShell,
            ),
          ],
          { kind: 'fenced', run: otherRun, attempt: 1 },
          { kind: 'unconditional' },
        ),
      ).toHaveProperty('positions')
      const secondGrant = owner.acquire(2)
      if (!('registration' in secondGrant))
        throw new Error('changed prefix registration unavailable')
      const changed = await readSettlementPrefix({
        binding,
        registration: secondGrant.registration,
      })
      secondGrant.registration.release()
      if (!('prefix' in changed)) throw new Error('changed prefix unavailable')
      expect(interpretCallHistory({ prefix: changed.prefix, callId: 'run-call' })).toHaveProperty(
        'unavailable',
      )
      expect(
        createModelFailureSource({
          prefix: changed.prefix,
          callId: 'run-call',
          owner,
          subject,
          usable: () => true,
          retain() {},
          forget() {},
        }),
      ).toBeNull()
      expect(source.verify(source.subject, { run, attempt: 2 })).toHaveProperty(
        'authoritativeSubject',
      )
      source.release()
      expect(source.verify(source.subject, { run, attempt: 1 })).toEqual({ unavailable: true })
    })
  })
  it('retains an exact deep-owned subject across unrelated append, then rejects generation and release', async () => {
    await controlled('failure-source', async ({ binding, owner }) => {
      const { reply: _reply, replyDisposition: _disposition, ...rest } = responseV5
      const delivered = jsonObject(_reply).blocks
      if (!Array.isArray(delivered)) throw new Error('failed response delivered blocks unavailable')
      expect(
        await binding.log.append(
          session,
          [
            prepare(
              'response',
              {
                ...rest,
                outcome: 'failed',
                failure: { cause: 'interrupted_mid_reply' },
                delivered,
              },
              { kind: 'response' },
            ),
          ],
          { kind: 'unfenced' },
          { kind: 'unconditional' },
        ),
      ).toHaveProperty('positions')
      let reads = 0
      const observedLog: SessionLog = {
        ...binding.log,
        async readSince(...args) {
          reads++
          return await binding.log.readSince(...args)
        },
      }
      let generation: object = binding.generation
      const scopedBinding = {
        ...binding,
        log: observedLog,
        currentGeneration: () => generation,
      }
      const grant = owner.acquire(2)
      if (!('registration' in grant)) throw new Error('read registration unavailable')
      const read = await readSettlementPrefix({
        binding: scopedBinding,
        registration: grant.registration,
      })
      if (!('prefix' in read)) throw new Error('owned full prefix unavailable')
      await Promise.resolve()
      grant.registration.release()
      const history = interpretCallHistory({ prefix: read.prefix, callId: 'call' })
      if (!('known' in history)) throw new Error('original dispatch unavailable')
      const record = history.known.dispatches[0]?.record
      if (record === undefined) throw new Error('original record unavailable')
      const subject = {
        failure: 'interrupted_mid_reply' as const,
        profile: record.profileSnapshot,
        dispatches: [record] as const,
        retryConclusions: [] as const,
      }
      const retained = new Set<ModelFailureSource>()
      let hostUsable = true
      const source = createModelFailureSource({
        prefix: read.prefix,
        callId: 'call',
        owner,
        subject,
        usable: () => hostUsable,
        retain: value => {
          retained.add(value)
        },
        forget: value => {
          retained.delete(value)
        },
      })
      if (source === null) throw new Error('valid source unavailable')
      const generationSource = createModelFailureSource({
        prefix: read.prefix,
        callId: 'call',
        owner,
        subject,
        usable: () => true,
        retain: value => {
          retained.add(value)
        },
        forget: value => {
          retained.delete(value)
        },
      })
      if (generationSource === null) throw new Error('generation source unavailable')
      expect(Object.isFrozen(source.subject)).toBe(true)
      expect(Object.isFrozen(source.subject.dispatches[0])).toBe(true)
      const beforeVerify = reads
      const execution = { run: 'invented-run', attempt: 1 }
      expect(source.verify(source.subject, execution)).toEqual({ invalidInput: true })
      expect(reads).toBe(beforeVerify)
      const unrelated = prepare(
        'record',
        {
          kind: 'model_call_ended',
          call: 'other',
          ending: 'undispatched',
          cause: 'credential_unavailable',
        },
        { kind: 'record' },
      )
      expect(
        await binding.log.append(
          session,
          [unrelated],
          { kind: 'unfenced' },
          { kind: 'unconditional' },
        ),
      ).toHaveProperty('positions')
      expect(source.verify(source.subject, execution)).toEqual({ invalidInput: true })
      expect(reads).toBe(beforeVerify)
      hostUsable = false
      expect(source.verify(source.subject, execution)).toEqual({ unavailable: true })
      expect(generationSource.verify(generationSource.subject, execution)).toEqual({
        invalidInput: true,
      })
      generation = Object.freeze({})
      expect(generationSource.verify(generationSource.subject, execution)).toEqual({
        unavailable: true,
      })
      source.release()
      source.release()
      generationSource.release()
      expect(retained.size).toBe(0)
      expect(source.verify(source.subject, execution)).toEqual({ unavailable: true })
    })
  })
})
