import { expect, it } from 'vitest'
import { decodeDispatchId, type LiveModelRequest } from '@omne-harness/model-contract'
import { callId, instanceId, opId, proof, sqlCommands, tenantOf, unbox } from './fixture.ts'

it('reads back the end intent and the last event number of a live call, completed without sealed blocks', async () => {
  const tenant = tenantOf('a')
  const f = sqlCommands([tenant])
  const chat = f.core.admitOf(tenant, callId('live'), opId('admit'))
  const { profile, suppliers, retryPolicy, source } = chat.request
  const request: LiveModelRequest = {
    kind: 'live',
    profile,
    suppliers,
    fallback: false,
    retryPolicy,
    source,
    input: ['text', 'voice'],
    instructions: 'Answer the caller briefly.',
    history: [],
    voice: null,
    media: { via: 'link', audio: 'pcm16' },
  }
  const admit = { ...chat, request }
  const target = { principal: admit.principal, tenant, call: admit.call }
  unbox(await f.commands.admit(admit))
  const execution = unbox(
    await f.commands.claim({
      ...admit,
      operation: opId('claim'),
      instance: instanceId(),
      continuity: proof(admit.call),
    }),
  )
  const dispatch = unbox(decodeDispatchId('mdisp_live'))
  let serial = 0
  const write = async () => ({
    ...execution,
    operation: opId(`write-${++serial}`),
    expected: unbox(await f.commands.loadRecovery(target)).state.revision,
  })
  unbox(
    await f.commands.prepareDispatch({
      ...(await write()),
      dispatch,
      supplier: suppliers[0],
      policyDecision: null,
    }),
  )
  unbox(await f.commands.openReceiveWindow({ ...(await write()), dispatch, window: 'live' }))
  expect(
    unbox(await f.commands.control({ ...target, operation: opId('end'), intent: 'end' })),
  ).toMatchObject({ kind: 'requested', intent: 'end' })
  const termination = { kind: 'completed', reason: 'stop' } as const
  unbox(
    await f.commands.preserve({
      ...(await write()),
      dispatch,
      window: 'live',
      facts: [{ kind: 'ended', termination }],
    }),
  )
  unbox(await f.commands.settle({ ...(await write()), termination, events: { last: 3 } }))
  expect(unbox(await f.commands.loadRecovery(target)).state).toMatchObject({
    phase: 'settled',
    control: { kind: 'requested', intent: 'end' },
    settlement: { termination, events: { last: 3 } },
  })
})
