import { describe, expect, it } from 'vitest'
import { encodeModelInvocationRef } from '@omne-harness/model-contract'
import { createScriptedResultPusher } from '@omne-harness/model-contract/testing'
import {
  access,
  admitCall,
  alice,
  call,
  callRef,
  evidence,
  failureOf,
  must,
  operation,
  scriptedProvider,
  settleCall,
  tenantA,
} from './scripted-support.ts'

type Scripted = ReturnType<typeof scriptedProvider>

function contact(scripted: Scripted, name: string) {
  return scripted.provider.runtime.calls.contact(access(name))
}

describe('the contact answer of the scripted provider', () => {
  it('answers not-accepted for a call it never admitted', async () => {
    const scripted = scriptedProvider()
    expect(must(await contact(scripted, 'a'))).toEqual({ kind: 'not-accepted' })
  })

  it('answers holding for an admitted call and settled once the call ended', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    expect(must(await contact(scripted, 'a'))).toEqual({ kind: 'holding' })
    settleCall(scripted, 'a')
    expect(must(await contact(scripted, 'a'))).toEqual({ kind: 'settled' })
  })

  it('gives the answer the script set, and its own again after the script clears it', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    const lost = { kind: 'lost', evidence: evidence('lock') } as const
    scripted.controller.setContact({ ...callRef('a'), answer: lost })
    expect(must(await contact(scripted, 'a'))).toEqual(lost)
    scripted.controller.setContact({ ...callRef('a'), answer: { kind: 'unknown' } })
    expect(must(await contact(scripted, 'a'))).toEqual({ kind: 'unknown' })
    scripted.controller.setContact({ ...callRef('a'), answer: null })
    expect(must(await contact(scripted, 'a'))).toEqual({ kind: 'holding' })
  })

  it('refuses a principal without the right to inspect, and a reference of another admission', async () => {
    const scripted = scriptedProvider()
    await admitCall(scripted, 'a')
    await admitCall(scripted, 'b')
    scripted.controller.revokeAccess({ ...callRef('a'), principal: alice, actions: ['inspect'] })
    expect(failureOf(await contact(scripted, 'a'))).toEqual({ kind: 'denied', action: 'inspect' })
    const other = must(
      encodeModelInvocationRef({ tenant: tenantA, call: call('b'), admission: operation('x') }),
    )
    expect(
      failureOf(
        await scripted.provider.runtime.calls.contact({
          principal: alice,
          tenant: tenantA,
          reference: other,
        }),
      ),
    ).toEqual({ kind: 'invalid', field: 'admission', reason: 'not-original' })
  })

  it('is scripted through the result pusher too', async () => {
    const scripted = scriptedProvider()
    const pusher = createScriptedResultPusher({
      scripted,
      principal: alice,
      resolveReceiver: () => null,
    })
    await admitCall(scripted, 'a')
    pusher.controller.setContact({ ...callRef('a'), answer: { kind: 'unknown' } })
    expect(must(await pusher.provider.runtime.calls.contact(access('a')))).toEqual({
      kind: 'unknown',
    })
  })
})
