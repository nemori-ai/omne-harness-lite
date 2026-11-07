import { fail } from '@omne-harness/operation-result'
import type { AccessVerdict } from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'

import {
  createLocalInvocationSource,
  createLocalToolLedgerGuards,
  type ToolHostAccess,
} from '@omne-harness/tool-host-local'
import { describe, expect, it } from 'vitest'
import {
  callId,
  evidence,
  invokeRequest,
  samePrincipalBySubject,
  subjectCodec,
  tenantA,
  type Subject,
} from '../coordinator-values.ts'

function assemble(access: ToolHostAccess<Subject>) {
  const sources = createLocalInvocationSource({
    store: createMemoryToolLedgerStore(),
    authority: {
      qualify: async () => ({ kind: 'unavailable', diagnostic: 'not issuing' }),
      samePrincipal: samePrincipalBySubject,
    },
    principalCodec: subjectCodec,
    commitAttempts: 2,
  })
  return createLocalToolLedgerGuards({
    access,
    sources,
    bindings: {
      recover: async () =>
        fail({ kind: 'unavailable', dependency: 'fixture', diagnostic: 'not executing' }),
    },
    grants: new Map(),
  })
}

describe('existing ToolHostAccess consumption', () => {
  it('passes the same current adapter to the ledger and start guard', async () => {
    const calls: string[] = []
    let verdict: AccessVerdict = { kind: 'allowed' }
    const adapter: ToolHostAccess<Subject>['guard'] & ToolHostAccess<Subject>['start'] = {
      qualify: async input => {
        calls.push(input.action)
        return verdict
      },
    }
    const guards = assemble({ guard: adapter, start: adapter })
    const input = { principal: { subject: 'alice' }, tenant: tenantA, call: callId('qualified') }
    expect(guards.access).toBe(adapter)
    expect(await guards.access.qualify({ ...input, action: 'lookup' })).toEqual({ kind: 'allowed' })
    const request = {
      ...invokeRequest(),
      invocation: { kind: 'direct' as const, source: evidence('source') },
    }
    expect(await guards.starts.qualifyStart({ ...input, request })).toEqual({ kind: 'allowed' })
    verdict = { kind: 'unavailable', diagnostic: 'source withdrawn' }
    expect(await guards.starts.qualifyStart({ ...input, request })).toEqual(verdict)
    expect(await guards.access.qualify({ ...input, action: 'lookup' })).toEqual(verdict)
    expect(calls).toEqual(['lookup', 'start', 'start', 'lookup'])
  })

  it.each(['denied', 'throws'] as const)(
    'does not turn %s qualification into a start',
    async mode => {
      const adapter: ToolHostAccess<Subject>['guard'] & ToolHostAccess<Subject>['start'] = {
        qualify: async () => {
          if (mode === 'throws') throw new Error('secret input')
          return { kind: 'denied', reason: 'not qualified' }
        },
      }
      const answer = await assemble({ guard: adapter, start: adapter }).starts.qualifyStart({
        principal: { subject: 'alice' },
        tenant: tenantA,
        call: callId('refused'),
        request: { ...invokeRequest(), invocation: { kind: 'direct', source: evidence('source') } },
      })
      expect(answer.kind).toBe(mode === 'denied' ? 'refused' : 'unavailable')
      expect(JSON.stringify(answer)).not.toContain('secret input')
    },
  )
})
