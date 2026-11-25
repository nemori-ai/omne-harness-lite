import { describe, expect, it } from 'vitest'
import type { CanvasOperations } from '@omne-harness/canvas-contract'
import { caller, domain, media } from './world.ts'

/** Each command, with params that it takes on a canvas where i1 is placed and i2 is in the pile p1. */
const CALLS: readonly (readonly [string, Record<string, unknown>])[] = [
  ['look', {}],
  ['away', {}],
  ['kinds', {}],
  ['place', { reference: media('c') }],
  ['arrange', { items: [{ item: 'i1', top: true }] }],
  ['take', { items: ['i1'] }],
  ['pile', { pile: 'p2', items: ['i1'] }],
  ['scatter', { pile: 'p1' }],
  ['lock', { items: ['i1'] }],
  ['unlock', { items: ['i1'] }],
]

async function seeded() {
  const d = domain()
  const agent = caller(d.canvas)
  await agent.ok('place', { reference: media('a'), at: { x: 0, y: 0 } })
  await agent.ok('place', { reference: media('b'), at: { x: 400, y: 0 } })
  await agent.ok('pile', { pile: 'p1', items: ['i2'] })
  return agent
}

describe('an answer names the command it answers', () => {
  it.each(CALLS)('%s, when it is done', async (command, params) => {
    const agent = await seeded()
    const { head } = await agent.ok(command, params)
    expect(head).toMatch(new RegExp(`^(done|no-change) Canvas ${command}$`))
  })

  it.each(CALLS)('%s, when the canvas throws', async (command, params) => {
    const throwing = new Proxy({} as CanvasOperations, {
      get: () => async () => {
        throw new Error('the canvas fell over')
      },
    })
    const failure = await caller(throwing).failure(command, params)
    expect(failure.operation).toBe(`Canvas.${command}`)
  })
})
