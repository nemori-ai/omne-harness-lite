import { describe, expect, it } from 'vitest'
import {
  evidence,
  operationId,
  ordinaryInput,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { open, scene } from './scene.ts'

type Opened = Awaited<ReturnType<typeof open>>

const interrupt = (s: Opened | ReturnType<typeof scene>, name: string, input = name) =>
  s.commit({
    kind: 'interrupt',
    input: {
      ...s.base,
      operation: operationId(name),
      run: null,
      urgent: ordinaryInput(input),
      decision: evidence('person'),
    },
  })

// The interrupt table of the design: the Run there, no Run, and an archived session (C27).
describe('an urgent input with no Run named', () => {
  it('interrupts the Run there: the input goes to it and the Run is not cancelled', async () => {
    const s = await open()
    const before = await s.active()
    const answer = succeeded(await interrupt(s, 'urgent'), 'interrupt')
    expect(answer.progress).toMatchObject({ intent: { kind: 'interrupt', run: before.run.run } })
    expect(await s.read()).toMatchObject({
      pending: ['first', 'urgent'],
      run: { kind: 'active', run: before.run.run },
    })
  })

  it('with no Run there, it is an ordinary input for the next Run, and the answer has no control', async () => {
    const s = scene()
    await s.create()
    const answer = succeeded(await interrupt(s, 'urgent'), 'interrupt')
    expect(answer.progress).toBeNull()
    const snapshot = await s.read()
    expect(snapshot.pending).toEqual(['urgent'])
    expect(snapshot.controls).toEqual([])
  })

  it('the same urgent input again answers the original, Run or not', async () => {
    const s = await open()
    const first = succeeded(await interrupt(s, 'urgent'), 'first')
    const again = succeeded(await interrupt(s, 'urgent'), 'again')
    expect(again.receipt).toMatchObject({ operation: first.receipt.operation, recovered: true })
    const idle = scene()
    await idle.create()
    succeeded(await interrupt(idle, 'urgent'), 'first idle')
    const recalled = succeeded(await interrupt(idle, 'urgent'), 'again idle')
    expect(recalled.receipt.recovered).toBe(true)
    expect((await idle.read()).pending).toEqual(['urgent'])
  })

  it('an archived session refuses it', async () => {
    const s = scene()
    await s.create()
    await s.control('archive')
    expect(await interrupt(s, 'urgent')).toMatchObject({ failure: { kind: 'archived' } })
  })
})
