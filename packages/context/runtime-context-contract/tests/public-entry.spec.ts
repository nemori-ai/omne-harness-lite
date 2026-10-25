import { expect, it } from 'vitest'
it('root exports only the eight pure operations', async () => {
  expect(Object.keys(await import('@omne-harness/runtime-context-contract')).sort()).toEqual(
    [
      'declarationDigest',
      'decodeScopeRef',
      'decodeContextBlockKey',
      'judgeNeed',
      'judgeBinding',
      'judgeRegistration',
      'reduceStep',
      'diffForReminder',
    ].sort(),
  )
})
it('testing entry exposes the suite and explicitly non-durable stand-in', async () => {
  const testing = await import('@omne-harness/runtime-context-contract/testing')
  expect(Object.keys(testing).sort()).toEqual(
    [
      'createMemoryRuntimeContext',
      'createTestAuthorityPorts',
      'runtimeContextConformance',
      'runConformanceCase',
      'NotApplicable',
      'RUNTIME_CONTEXT_OBLIGATIONS',
    ].sort(),
  )
  const ports = testing.createTestAuthorityPorts()
  expect(testing.createMemoryRuntimeContext(ports).durability).toBe('none')
  // A recovery capacity bound is required configuration, never an unbounded default.
  expect(() => testing.createMemoryRuntimeContext({ ...ports, replayCapacity: -1 })).toThrow(RangeError)
})
