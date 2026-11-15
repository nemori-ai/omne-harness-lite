import { referenceParts } from './reference-input.ts'
import { decodeModelOperationId } from '@omne-harness/model-contract'
import type { CallContact, ModelCalls } from '@omne-harness/model-contract'
import type { ScriptedPrincipal } from '@omne-harness/model-contract/testing'
import { succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import { failures, patched } from './conformance-support.ts'
import { must } from './scripted-support.ts'

type Calls = ModelCalls<ScriptedPrincipal>
type ContactInput = Parameters<Calls['contact']>[0]

const mallory = { name: 'mallory' }

const answering = (
  rewrite: (
    answer: CallContact,
    calls: Calls,
    input: ContactInput,
  ) => CallContact | Promise<CallContact>,
) =>
  failures(subject =>
    patched(subject, {
      calls: calls => ({
        ...calls,
        async contact(input) {
          const outcome = await calls.contact(input)
          return 'ok' in outcome ? succeed(await rewrite(outcome.ok, calls, input)) : outcome
        },
      }),
    }),
  )

async function custodyOf(calls: Calls, input: ContactInput): Promise<string | null> {
  const found = await calls.inspect(input)
  if (!('ok' in found) || found.ok.kind !== 'found' || found.ok.state.phase !== 'settled')
    return null
  return found.ok.state.custody.kind
}

describe('the conformance suite on contact', () => {
  it('fails a provider that cannot say that it never admitted a call', async () => {
    const { failing, reasons } = await answering(answer =>
      answer.kind === 'not-accepted' ? { kind: 'unknown' } : answer,
    )
    expect(failing).toEqual(['contact-without-call-is-not-accepted'])
    expect(reasons).toEqual([
      expect.stringContaining('the contact of a call that was never admitted gives'),
    ])
  })

  it('fails a provider that reports an open call as settled', async () => {
    const { failing, reasons } = await answering(answer =>
      answer.kind === 'holding' ? { kind: 'settled' } : answer,
    )
    expect(failing).toEqual(['contact-on-open-call-claims-no-end'])
    expect(reasons).toEqual([
      expect.stringContaining('the contact of a call that has not settled gives'),
    ])
  })

  it('fails a provider that says it still runs a call whose result waits', async () => {
    const { failing, reasons } = await answering(async (answer, calls, input) =>
      (await custodyOf(calls, input)) === 'producer' ? { kind: 'holding' } : answer,
    )
    expect(failing).toEqual(['contact-on-unacknowledged-result-claims-no-run'])
    expect(reasons).toEqual([
      expect.stringContaining('the contact of a result that is not acknowledged gives'),
    ])
  })

  it('fails a provider that cannot answer for an acknowledged result', async () => {
    const { failing, reasons } = await answering(async (answer, calls, input) =>
      (await custodyOf(calls, input)) === 'acknowledged' ? { kind: 'unknown' } : answer,
    )
    expect(failing).toEqual(['contact-on-acknowledged-result-is-settled'])
    expect(reasons).toEqual([
      expect.stringContaining('the contact of an acknowledged result gives'),
    ])
  })

  it('fails a provider whose contact writes to the call', async () => {
    const { failing, reasons } = await answering(async (answer, calls, input) => {
      const { call } = referenceParts(input)
      await calls.cancel({
        principal: input.principal,
        tenant: input.tenant,
        call,
        operation: must(decodeModelOperationId('mop_contact-writes')),
      })
      return answer
    })
    expect(failing).toEqual(['contact-changes-nothing'])
    expect(reasons).toEqual([expect.stringContaining('the contact changed the call')])
  })

  it('fails a provider whose contact answers another tenant', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          contact: input => calls.contact({ ...input, tenant: subject.tenant }),
        }),
      }),
    )
    expect(failing).toEqual(['refusal-hides-existence'])
    expect(reasons).toEqual([
      expect.stringContaining('contact answers another tenant differently for a call that exists'),
    ])
  })

  it('fails a provider whose contact does not notice a revoked right', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        calls: calls => ({
          ...calls,
          contact: input => calls.contact({ ...input, principal: mallory }),
        }),
      }),
    )
    expect(failing).toEqual(['revoked-principal-gets-denied'])
    expect(reasons).toEqual([
      expect.stringContaining('the contact after the revoke succeeded where it must not'),
    ])
  })
})
