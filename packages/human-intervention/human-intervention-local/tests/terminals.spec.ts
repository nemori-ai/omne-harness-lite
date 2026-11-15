import { afterEach, expect, it } from 'vitest'
import {
  createHitlSqlTerminals,
  HitlSqlBindingSchema,
} from '@omne-harness/human-intervention-local'
import { json, operationKey } from '../src/encoding.ts'
import { openWorld } from './world.ts'

const worlds: Awaited<ReturnType<typeof openWorld>>[] = []
async function open(options: Parameters<typeof openWorld>[0] = {}) {
  const world = await openWorld(options)
  worlds.push(world)
  return world
}
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})
const binding = HitlSqlBindingSchema.parse({
  operationRef: { tenantRef: 'tenant-a', actorRef: 'alice', operationId: 'reply-a' },
  inputDigest: 'a'.repeat(64),
})
function write(world: Awaited<ReturnType<typeof open>>, reject = false) {
  return world.storage.commit({
    identity: {
      ...world.combination,
      operation: 'hitl.command',
      protocolVersion: '2',
      operationKey: operationKey(binding.operationRef),
    },
    combinationVersion: world.combination.combinationVersion,
    manifestDigest: world.combination.manifestDigest,
    commands: [
      { participant: 'hitl.terminal', facts: { kind: 'consume', binding: json(binding) } },
      ...(reject ? [{ participant: 'fixture.hitl.reject', facts: {} }] : []),
    ],
  })
}

it('absence is not an abort; a committed seal prevents every late write', async () => {
  const world = await open()
  expect(await world.terminals.inspect(binding)).toEqual({ kind: 'absent' })
  expect(await world.terminals.seal(binding)).toMatchObject({
    kind: 'terminal',
    terminal: { state: 'aborted' },
  })
  expect((await write(world)).kind).toBe('rolled_back')
  expect(await world.terminals.inspect(binding)).toMatchObject({
    kind: 'terminal',
    terminal: { state: 'aborted' },
  })
})
it('recognizes a committed original after a seal and storage restart', async () => {
  const world = await open()
  expect((await write(world)).kind).toBe('committed')
  expect(await world.terminals.seal(binding)).toMatchObject({
    kind: 'terminal',
    terminal: { state: 'committed' },
  })
  await world.close()
  const reopened = await open({ root: world.root })
  expect(await reopened.terminals.inspect(binding)).toMatchObject({
    kind: 'terminal',
    terminal: { binding, state: 'committed' },
  })
  expect((await write(reopened)).kind).toBe('committed')
})
it('rolls the terminal back when another participant fails', async () => {
  const world = await open()
  expect((await write(world, true)).kind).toBe('rolled_back')
  expect(await world.terminals.inspect(binding)).toEqual({ kind: 'absent' })
  expect(await world.terminals.seal(binding)).toMatchObject({
    kind: 'terminal',
    terminal: { state: 'aborted' },
  })
})
it('does not replace the original digest and does not conflate actors', async () => {
  const world = await open()
  await world.terminals.seal(binding)
  expect(await world.terminals.inspect({ ...binding, inputDigest: 'b'.repeat(64) })).toEqual({
    kind: 'conflict',
  })
  expect(await world.terminals.seal({ ...binding, inputDigest: 'b'.repeat(64) })).toEqual({
    kind: 'conflict',
  })
  const another = HitlSqlBindingSchema.parse({
    ...binding,
    operationRef: { ...binding.operationRef, actorRef: 'bob' },
  })
  expect(await world.terminals.inspect(another)).toEqual({ kind: 'absent' })
  expect(await world.terminals.seal(another)).toMatchObject({
    kind: 'terminal',
    terminal: { binding: another },
  })
})
it('keeps tenant mismatch outside storage and preserves an uncertain seal for readback', async () => {
  const world = await open({
    wrap: storage => ({
      ...storage,
      async commit(input) {
        await storage.commit(input)
        throw new Error('injected lost commit response')
      },
    }),
  })
  const otherTenant = HitlSqlBindingSchema.parse({
    ...binding,
    operationRef: { ...binding.operationRef, tenantRef: 'tenant-b' },
  })
  expect(await world.terminals.seal(otherTenant)).toEqual({ kind: 'conflict' })
  expect(await world.terminals.seal(binding)).toEqual({ kind: 'unavailable' })
  expect(await world.terminals.inspect(binding)).toMatchObject({
    kind: 'terminal',
    terminal: { state: 'aborted' },
  })
  expect(() =>
    createHitlSqlTerminals({
      storage: world.storage,
      ...world.combination,
      domain: { scope: { kind: 'system' }, transactionDomain: 'invalid' },
    }),
  ).toThrow('tenant domain')
})
