import { describe, expect, it } from 'vitest'
import type { ControlState } from '@omne-harness/model-contract'
import type { LiveInput } from '../src/live/body.ts'
import { LiveBodies } from '../src/live/registry.ts'
import type { LiveRunner } from '../src/live/runner.ts'
import { callId, identity, op } from './memory-fixture.ts'

function body() {
  const fed: LiveInput[] = []
  const exit = Promise.withResolvers<void>()
  const runner = {
    feed: (input: LiveInput) => void fed.push(input),
    exited: exit.promise,
  } as unknown as LiveRunner
  return { runner, fed, exit: () => exit.resolve() }
}
const REQUESTED = { kind: 'requested', propagation: 'pending', upstream: 'unknown' } as const
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

describe('the live bodies of a process', () => {
  it('holds each call apart, by tenant and by call', () => {
    const bodies = new LiveBodies()
    const [one, two, other] = [body(), body(), body()]
    bodies.hold({ tenant: identity('5'), call: callId('one') }, one.runner)
    bodies.hold({ tenant: identity('5'), call: callId('two') }, two.runner)
    bodies.hold({ tenant: identity('6'), call: callId('one') }, other.runner)
    expect(bodies.get({ tenant: identity('5'), call: callId('one') })).toBe(one.runner)
    expect(bodies.get({ tenant: identity('5'), call: callId('two') })).toBe(two.runner)
    expect(bodies.get({ tenant: identity('6'), call: callId('one') })).toBe(other.runner)
  })

  it('lets a body go when it exits, but keeps the one that took its place', async () => {
    const bodies = new LiveBodies()
    const target = { tenant: identity('5'), call: callId('one') }
    const [first, second] = [body(), body()]
    bodies.hold(target, first.runner)
    bodies.hold(target, second.runner)
    first.exit()
    await settle()
    expect(bodies.get(target)).toBe(second.runner)
    second.exit()
    await settle()
    expect(bodies.holds(target)).toBe(false)
  })

  it('passes a recorded cancel to the body, and nothing for an end or no control', () => {
    const bodies = new LiveBodies()
    const target = { tenant: identity('5'), call: callId('one') }
    const held = body()
    bodies.hold(target, held.runner)
    const controls: ControlState[] = [
      { kind: 'none' },
      { ...REQUESTED, operation: op('end'), intent: 'end' },
      { ...REQUESTED, operation: op('cancel'), intent: 'cancel' },
    ]
    for (const control of controls) bodies.cancelled(target, control)
    expect(held.fed).toEqual([{ kind: 'cancel', control: op('cancel') }])
  })
})
