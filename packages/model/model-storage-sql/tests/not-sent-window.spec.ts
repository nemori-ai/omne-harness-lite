import { expect, it } from 'vitest'
import { decodeDispatchId } from '@omne-harness/model-contract'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { callId, instanceId, opId, proof, sqlCommands, tenantOf, unbox } from './fixture.ts'

async function prepared() {
  const tenant = tenantOf('a')
  const f = sqlCommands([tenant])
  const admit = f.core.admitOf(tenant, callId('not-sent'), opId('admit'))
  unbox(await f.commands.admit(admit))
  const execution = unbox(
    await f.commands.claim({
      ...admit,
      operation: opId('claim'),
      instance: instanceId(),
      continuity: proof(admit.call),
    }),
  )
  const dispatch = unbox(decodeDispatchId('mdisp_not-sent'))
  let serial = 0
  const write = async () => ({
    ...execution,
    operation: opId(`write-${++serial}`),
    expected: unbox(await f.commands.loadRecovery(admit)).state.revision,
  })
  unbox(
    await f.commands.prepareDispatch({
      ...(await write()),
      dispatch,
      supplier: admit.request.suppliers[0],
      policyDecision: null,
    }),
  )
  unbox(await f.commands.openReceiveWindow({ ...(await write()), dispatch, window: 'zero-start' }))
  return { ...f, admit, dispatch, write }
}

it('persists a no-send terminal and retains the retry guard after SQL reload and receipt loss', async () => {
  const f = await prepared()
  unbox(
    await f.commands.recordSend({ ...(await f.write()), dispatch: f.dispatch, state: 'not-sent' }),
  )
  const termination = {
    kind: 'failed',
    fault: { cause: 'upstream-unavailable', diagnostic: 'synthetic', upstreamStatus: null },
  } as const
  const facts: TransportFact[] = [{ kind: 'ended', termination }]
  const input = { ...(await f.write()), dispatch: f.dispatch, window: 'zero-start', facts }
  f.sqlite.hooks.loseNextReply = true
  expect(await f.commands.preserve(input)).toMatchObject({
    failure: { kind: 'commit-unknown', operation: input.operation },
  })
  const committed = f.sqlite.commits()
  unbox(await f.commands.preserve(input))
  expect(f.sqlite.commits()).toBe(committed)
  expect(unbox(await f.commands.dispatches(f.admit))[0]).toMatchObject({
    firstContent: 'none-proven',
    send: 'not-sent',
    terminal: termination,
  })
  expect(await f.commands.settle({ ...(await f.write()), termination })).toMatchObject({
    failure: { kind: 'invalid', reason: 'retry-not-decided' },
  })
})

for (const order of ['send-first', 'content-first'] as const)
  it(`rejects contradictory ${order} facts atomically through SQL`, async () => {
    const f = await prepared()
    const content: TransportFact[] = [
      { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
    ]
    if (order === 'send-first')
      unbox(
        await f.commands.recordSend({
          ...(await f.write()),
          dispatch: f.dispatch,
          state: 'not-sent',
        }),
      )
    else
      unbox(
        await f.commands.preserve({
          ...(await f.write()),
          dispatch: f.dispatch,
          window: 'zero-start',
          facts: content,
        }),
      )
    const before = unbox(await f.commands.loadRecovery(f.admit))
    const result =
      order === 'send-first'
        ? await f.commands.preserve({
            ...(await f.write()),
            dispatch: f.dispatch,
            window: 'zero-start',
            facts: content,
          })
        : await f.commands.recordSend({
            ...(await f.write()),
            dispatch: f.dispatch,
            state: 'not-sent',
          })
    expect(result).toMatchObject({ failure: { kind: 'invalid', reason: 'not-sent-content' } })
    expect(unbox(await f.commands.loadRecovery(f.admit))).toEqual(before)
  })
