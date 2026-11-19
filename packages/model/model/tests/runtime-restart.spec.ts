import { judgePart } from '@omne-harness/message'
import { expect, it } from 'vitest'
import type { DispatchRecord } from '@omne-harness/model-contract'
import type { ModelCommands, TransportFact } from '@omne-harness/model-contract/provider'
import { invocationReference } from './reference-input.ts'
import { eventually, runtimeFixture } from './runtime-fixture.ts'
import { instance, op, proof, unbox } from './memory-fixture.ts'

type Fixture = ReturnType<typeof runtimeFixture>
const completed = { kind: 'completed', reason: 'stop' } as const
const open: TransportFact = { kind: 'block-open', index: '0', mode: 'append', content: 'text' }
const delta = (text: string): TransportFact => ({ kind: 'block-delta', index: '0', delta: text })
const sealed = (text: string): TransportFact => ({
  kind: 'block-seal',
  index: '0',
  block: (() => {
    const part = judgePart({
      kind: 'text',
      id: 'kept',
      text,
      visibility: { toHuman: true, toModel: true },
    })
    if ('rejected' in part || part.ok.kind !== 'text') throw new Error('invalid text block')
    return part.ok
  })(),
})
const lost = {
  kind: 'failed',
  fault: { cause: 'runtime-lost', diagnostic: 'transport-gone', upstreamStatus: null },
} as const

async function state(f: Fixture) {
  const found = unbox(
    await f.provider.runtime.calls.inspect({
      ...f.admit,
      reference: invocationReference({ ...f.admit, admission: f.admit.operation }),
    }),
  )
  if (found.kind !== 'found') throw new Error('missing accepted call')
  return found.state
}

async function dispatches(f: Fixture): Promise<readonly DispatchRecord[]> {
  return unbox(
    await f.provider.runtime.calls.dispatches({
      principal: f.principal,
      tenant: f.tenant,
      call: f.admit.call,
    }),
  )
}

async function savedText(f: Fixture): Promise<string> {
  const current = await state(f)
  if (current.phase !== 'settled') throw new Error('call has not settled')
  const read = unbox(
    await f.dependencies.commands.acquireRead({
      ...f.admit,
      operation: op('restart-read'),
      result: current.settlement.version,
    }),
  )
  if (read.kind !== 'started' || read.value.kind !== 'reading')
    throw new Error('missing saved result')
  unbox(await f.dependencies.commands.endRead({ ...f.admit, read: read.read }))
  return JSON.stringify(read.value.page.parts)
}

/**
 * Holds one command of the first process, so that process dies before it. At the end of the test
 * the held calls answer unavailable, so the first process stops without writing anything.
 */
function holding(name: 'settle' | 'prepareDispatch' | 'recordMaterialization' | 'recordSend') {
  const hold = { on: true }
  const held: ((value: unknown) => void)[] = []
  const wrap = (commands: ModelCommands<never>): ModelCommands<never> => ({
    ...commands,
    [name]: (input: never) =>
      hold.on
        ? new Promise(resolve => held.push(resolve))
        : (commands[name] as (input: never) => unknown).call(commands, input),
  })
  const bury = () => {
    for (const resolve of held)
      resolve({ failure: { kind: 'unavailable', dependency: 'test', diagnostic: 'process died' } })
  }
  return { hold, wrap: wrap as never, bury }
}

it('ends a call whose dispatch was sent and whose transport died as runtime-lost, keeps its content and sends nothing again', async () => {
  const f = runtimeFixture()
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    await f.start(f.admit.call)
    await f.show(f.admit.call, [open, delta('half an ans'), sealed('half an ans')])
    expect(await f.restart(f.admit.call, instance('after-restart'))).toEqual({ ok: undefined })
    const current = await state(f)
    expect(current.phase).toBe('settled')
    if (current.phase !== 'settled') return
    expect(current.settlement.termination).toMatchObject({
      kind: 'failed',
      fault: { cause: 'runtime-lost' },
    })
    expect(await savedText(f)).toContain('half an ans')
    const [record, ...more] = await dispatches(f)
    expect(more).toEqual([])
    expect(record?.terminal).toMatchObject({ kind: 'failed', fault: { cause: 'runtime-lost' } })
    expect(f.channel(f.admit.call).starts).toBe(1)
  } finally {
    await f.dispose()
  }
})

it('ends a call that was sent and showed no content as runtime-lost, without a second dispatch', async () => {
  const f = runtimeFixture()
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    await f.start(f.admit.call)
    expect(await f.restart(f.admit.call, instance('after-restart'))).toEqual({ ok: undefined })
    const current = await state(f)
    expect(current.phase).toBe('settled')
    expect(current.phase === 'settled' && current.settlement.termination).toMatchObject(
      lost && { kind: 'failed', fault: { cause: 'runtime-lost' } },
    )
    expect(await dispatches(f)).toHaveLength(1)
    expect(f.channel(f.admit.call).starts).toBe(1)
  } finally {
    await f.dispose()
  }
})

it('settles a call whose dispatch ended before the process died, with the ending it saved', async () => {
  const { hold, wrap, bury } = holding('settle')
  const f = runtimeFixture({}, wrap)
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    await f.start(f.admit.call)
    f.channel(f.admit.call).push([
      open,
      delta('whole'),
      sealed('whole'),
      { kind: 'ended', termination: completed },
    ])
    await eventually(() =>
      f.preserveInputs.some(input => input.facts.some(fact => fact.kind === 'ended')),
    )
    hold.on = false
    expect(await f.restart(f.admit.call, instance('after-restart'))).toEqual({ ok: undefined })
    const current = await state(f)
    expect(current.phase === 'settled' && current.settlement.termination).toEqual(completed)
    expect(await savedText(f)).toContain('whole')
    expect(f.channel(f.admit.call).starts).toBe(1)
  } finally {
    bury()
    await f.dispose()
  }
})

it('sends a call that was only admitted when the process died, once, to the end', async () => {
  const { hold, wrap, bury } = holding('prepareDispatch')
  const f = runtimeFixture({}, wrap)
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    hold.on = false
    f.channel(f.admit.call).ready.resolve()
    const drove = f.restart(f.admit.call, instance('after-restart'))
    await eventually(() => f.channel(f.admit.call).starts === 1)
    f.channel(f.admit.call).push([
      open,
      delta('fresh'),
      sealed('fresh'),
      { kind: 'ended', termination: completed },
    ])
    expect(await drove).toEqual({ ok: undefined })
    const current = await state(f)
    expect(current.phase === 'settled' && current.settlement.termination).toEqual(completed)
    expect(f.channel(f.admit.call).starts).toBe(1)
  } finally {
    bury()
    await f.dispose()
  }
})

it('sends again a dispatch whose process died before it was materialized, once, to the end', async () => {
  const { hold, wrap, bury } = holding('recordMaterialization')
  const f = runtimeFixture({}, wrap)
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    f.channel(f.admit.call).ready.resolve()
    await eventually(() => f.channel(f.admit.call).resent.length === 1)
    hold.on = false
    expect(f.channel(f.admit.call).starts).toBe(0)
    const drove = f.restart(f.admit.call, instance('after-restart'))
    await eventually(() => f.channel(f.admit.call).starts === 1)
    f.channel(f.admit.call).push([
      open,
      delta('again'),
      sealed('again'),
      { kind: 'ended', termination: completed },
    ])
    expect(await drove).toEqual({ ok: undefined })
    const current = await state(f)
    expect(current.phase === 'settled' && current.settlement.termination).toEqual(completed)
    expect(f.channel(f.admit.call).starts).toBe(1)
  } finally {
    bury()
    await f.dispose()
  }
})

it('ends as runtime-lost a dispatch whose process died after it may have gone out, before its send was recorded', async () => {
  const { hold, wrap, bury } = holding('recordSend')
  const f = runtimeFixture({}, wrap)
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    await f.start(f.admit.call)
    hold.on = false
    expect(await f.restart(f.admit.call, instance('after-restart'))).toEqual({ ok: undefined })
    const current = await state(f)
    expect(current.phase === 'settled' && current.settlement.termination).toMatchObject({
      kind: 'failed',
      fault: { cause: 'runtime-lost' },
    })
    expect(await dispatches(f)).toHaveLength(1)
    expect(f.channel(f.admit.call).starts).toBe(1)
  } finally {
    bury()
    await f.dispose()
  }
})

it('changes nothing for a settled call driven again under another instance', async () => {
  const f = runtimeFixture()
  try {
    unbox(await f.provider.runtime.calls.admit(f.admit))
    await f.start(f.admit.call)
    f.channel(f.admit.call).push([
      open,
      delta('done'),
      sealed('done'),
      { kind: 'ended', termination: completed },
    ])
    await eventually(() => f.results.has(f.admit.call))
    const before = await state(f)
    expect(before.phase).toBe('settled')
    await f.provider.driver.drive(
      {
        principal: f.principal,
        tenant: f.tenant,
        call: f.admit.call,
        operation: op('drive-again'),
        instance: instance('again'),
        continuity: proof(f.admit.call),
      },
      new AbortController().signal,
    )
    const after = await state(f)
    expect(after.phase === 'settled' && after.settlement).toEqual(
      before.phase === 'settled' && before.settlement,
    )
    expect(await dispatches(f)).toHaveLength(1)
    expect(f.channel(f.admit.call).starts).toBe(1)
  } finally {
    await f.dispose()
  }
})
