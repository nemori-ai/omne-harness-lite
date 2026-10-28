import { expect, it } from 'vitest'

it('root entry exposes the independent host receiver and its retained state', async () => {
  const root = (await import('@omne-harness/agent-host-local')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['createLocalModelReceiver', 'createModelReceiverState'])
})
