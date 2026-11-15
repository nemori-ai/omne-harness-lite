import { describe, expect, it } from 'vitest'
import type { FailureCandidate, FinishIntent } from '@omne-harness/agent-contract'
import type { Principal } from '@omne-harness/access-cordis-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  failureCauseOf,
  runFailureCausesOf,
  type FinishReader,
} from '../../../src/rows/session-access/causes.ts'

const common = { step: null, at: '2026-11-15T00:00:00Z', source: {} } as never as Pick<
  FailureCandidate,
  'step' | 'at' | 'source'
>

const candidate = (rest: object) => ({ ...common, ...rest }) as unknown as FailureCandidate

const fault = (diagnostic: string) => ({ cause: 'upstream', diagnostic, upstreamStatus: '503' })

const intent = (failure: FailureCandidate | null) => ({ failure }) as unknown as FinishIntent

const input = {
  principal: { kind: 'login-principal' } as unknown as Principal,
  tenant: { organization: 'o', account: 'a' } as unknown as TenantId,
  execution: 'execution-1',
}

describe('failureCauseOf', () => {
  it('names the cause by the kind of the failure candidate', () => {
    expect(failureCauseOf(candidate({ kind: 'guard', level: 3, basis: {} }))).toEqual({
      kind: 'guard',
      detail: null,
    })
    expect(
      failureCauseOf(candidate({ kind: 'extension-stop', passage: 'p', reason: 'r' })),
    ).toEqual({
      kind: 'extension-stop',
      detail: null,
    })
  })

  it('takes the detail only from the diagnostic of the model fault of a call without reply', () => {
    expect(
      failureCauseOf(candidate({ kind: 'no-reply', call: 'c', fault: fault('http-503') })),
    ).toEqual({ kind: 'no-reply', detail: 'http-503' })
    expect(failureCauseOf(candidate({ kind: 'no-reply', call: 'c' }))).toEqual({
      kind: 'no-reply',
      detail: null,
    })
    expect(failureCauseOf(candidate({ kind: 'no-reply', call: 'c', fault: fault('') }))).toEqual({
      kind: 'no-reply',
      detail: null,
    })
  })

  it('gives no detail for a refused model call, whose failure fields are not a safe diagnostic', () => {
    expect(
      failureCauseOf(
        candidate({
          kind: 'model-refused',
          call: 'c',
          failure: { kind: 'invalid', field: 'messages', reason: 'secret body' },
        }),
      ),
    ).toEqual({ kind: 'model-refused', detail: null })
  })
})

describe('runFailureCausesOf', () => {
  it('is absent without a journal or without its finish read', () => {
    expect(runFailureCausesOf(undefined)).toBeUndefined()
    expect(runFailureCausesOf({})).toBeUndefined()
  })

  it('reads the finish intent of the execution with the principal and the tenant of the caller', async () => {
    const calls: unknown[] = []
    const journal: FinishReader = {
      readFinish: async asked => {
        calls.push(asked)
        return succeed(intent(candidate({ kind: 'no-reply', call: 'c', fault: fault('http-400') })))
      },
    }
    expect(await runFailureCausesOf(journal)?.read(input)).toEqual({
      kind: 'cause',
      cause: { kind: 'no-reply', detail: 'http-400' },
    })
    expect(calls).toEqual([input])
  })

  it.each([
    ['no finish intent', succeed(null)],
    ['a finish intent without a failure', succeed(intent(null))],
  ])('answers none to %s', async (_label, answer) => {
    const journal: FinishReader = { readFinish: async () => answer as never }
    expect(await runFailureCausesOf(journal)?.read(input)).toEqual({ kind: 'none' })
  })

  it('answers unavailable to a refused finish read', async () => {
    const journal: FinishReader = {
      readFinish: async () => fail({ kind: 'denied', action: 'readFinish' }),
    }
    expect(await runFailureCausesOf(journal)?.read(input)).toEqual({ kind: 'unavailable' })
  })
})
