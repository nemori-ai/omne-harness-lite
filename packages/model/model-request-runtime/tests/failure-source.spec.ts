import { describe, expect, it } from 'vitest'
import type { SessionLog } from '@omne-harness-lite/session-log-jsonl'
import { createModelFailureSource } from '../src/failure-subject.ts'
import { interpretCallHistory } from '../src/call-history.ts'
import { readSettlementPrefix } from '../src/settlement-prefix.ts'
import type { ModelFailureSource } from '../src/service-types.ts'
import { prepare, session } from './log-codec-fixture.ts'
import { controlled } from './settlement-fixture.ts'

describe('v17 failure source lifetime', () => {
  it('retains an exact deep-owned subject across unrelated append, then rejects generation and release', async () => {
    await controlled('failure-source', async ({ binding, owner }) => {
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
        failure: 'upstream_unavailable' as const,
        profile: record.profileSnapshot,
        dispatches: [record] as const,
        retryConclusions: [] as const,
      }
      const retained = new Set<ModelFailureSource>()
      const source = createModelFailureSource({
        prefix: read.prefix,
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
      if (source === null) throw new Error('valid source unavailable')
      expect(Object.isFrozen(source.subject)).toBe(true)
      expect(Object.isFrozen(source.subject.dispatches[0])).toBe(true)
      const beforeVerify = reads
      expect(source.verify(source.subject)).toHaveProperty('authoritativeSubject')
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
      expect(source.verify(source.subject)).toHaveProperty('authoritativeSubject')
      expect(reads).toBe(beforeVerify)
      generation = Object.freeze({})
      expect(source.verify(source.subject)).toEqual({ unavailable: true })
      source.release()
      source.release()
      expect(retained.size).toBe(0)
      expect(source.verify(source.subject)).toEqual({ unavailable: true })
    })
  })
})
